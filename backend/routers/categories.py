"""Admin: Category CRUD, nested categories, sermon assignment."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import require_admin
from models import Category, CategoryCreate, CategoryUpdate
from repositories.entities import categories_repo, sermons_repo
from services import log as activity_log
from services.serialization import clean, clean_list

router = APIRouter(prefix="/api/v1/admin/categories", tags=["admin:categories"])


@router.get("")
async def list_categories(_=Depends(require_admin)):
    items = await categories_repo().find({}, sort=[("name", 1)])
    counts: dict = {}
    for s in await sermons_repo().find({}, projection={"category_ids": 1}):
        for cid in s.get("category_ids", []) or []:
            counts[cid] = counts.get(cid, 0) + 1
    for c in items:
        c["sermon_count"] = counts.get(c["id"], 0)
    return {"items": clean_list(items), "total": len(items)}


@router.get("/{category_id}")
async def get_category(category_id: str, _=Depends(require_admin)):
    doc = await categories_repo().find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    return clean(doc)


@router.post("", response_model=Category)
async def create_category(body: CategoryCreate, request: Request, current=Depends(require_admin)):
    repo = categories_repo()
    if await repo.find_one({"slug": body.slug}):
        raise HTTPException(status_code=409, detail="Slug already exists")
    if body.parent_id and not await repo.find_one({"id": body.parent_id}):
        raise HTTPException(status_code=400, detail="parent_id does not exist")
    c = Category(**body.model_dump())
    await repo.insert(c.model_dump())
    await activity_log(actor=current, action="category_created", entity_type="category", entity_id=c.id, message=f"Created “{c.name}”", request=request)
    return c


@router.patch("/{category_id}", response_model=Category)
async def update_category(category_id: str, body: CategoryUpdate, request: Request, current=Depends(require_admin)):
    repo = categories_repo()
    existing = await repo.find_one({"id": category_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "slug" in updates and updates["slug"] != existing.get("slug"):
        if await repo.find_one({"slug": updates["slug"]}):
            raise HTTPException(status_code=409, detail="Slug already exists")
    if updates.get("parent_id") == category_id:
        raise HTTPException(status_code=400, detail="A category cannot be its own parent")
    await repo.update_one({"id": category_id}, updates)
    doc = await repo.find_one({"id": category_id})
    await activity_log(actor=current, action="category_updated", entity_type="category", entity_id=category_id, message=f"Updated “{doc.get('name')}”", request=request)
    return clean(doc)


@router.delete("/{category_id}")
async def delete_category(category_id: str, request: Request, current=Depends(require_admin)):
    repo = categories_repo()
    doc = await repo.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    await repo.delete_one({"id": category_id})
    # detach from any sermons
    for s in await sermons_repo().find({"category_ids": category_id}, projection={"id": 1}):
        await sermons_repo().raw_update_one({"id": s["id"]}, {"$pull": {"category_ids": category_id}})
    # reparent children up one level
    for child in await repo.find({"parent_id": category_id}, projection={"id": 1}):
        await repo.update_one({"id": child["id"]}, {"parent_id": doc.get("parent_id")})
    await activity_log(actor=current, action="category_deleted", entity_type="category", entity_id=category_id, message=f"Deleted “{doc.get('name')}”", request=request)
    return {"ok": True}


class AssignRequest(BaseModel):
    sermon_ids: List[str]


@router.post("/{category_id}/assign")
async def assign_sermons(category_id: str, body: AssignRequest, request: Request, current=Depends(require_admin)):
    if not await categories_repo().find_one({"id": category_id}):
        raise HTTPException(status_code=404, detail="Category not found")
    n = 0
    for sid in body.sermon_ids:
        m = await sermons_repo().raw_update_one({"id": sid}, {"$addToSet": {"category_ids": category_id}})
        n += m
    await activity_log(actor=current, action="category_assigned", entity_type="category", entity_id=category_id, message=f"Assigned {len(body.sermon_ids)} sermons", request=request)
    return {"assigned": n}


@router.post("/{category_id}/unassign")
async def unassign_sermons(category_id: str, body: AssignRequest, request: Request, current=Depends(require_admin)):
    n = 0
    for sid in body.sermon_ids:
        m = await sermons_repo().raw_update_one({"id": sid}, {"$pull": {"category_ids": category_id}})
        n += m
    await activity_log(actor=current, action="category_unassigned", entity_type="category", entity_id=category_id, message=f"Unassigned {len(body.sermon_ids)} sermons", request=request)
    return {"unassigned": n}
