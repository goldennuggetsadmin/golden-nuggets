import uuid
import logging
from typing import Optional, Any
from db import get_pool
from .base import BaseRepository
from config.settings import settings
import httpx

logger = logging.getLogger(__name__)

def _clean_val(k: str, v: Any) -> Any:
    if isinstance(v, (dict, list)):
        import json
        return json.dumps(v)
    return v

def _row_to_dict(row) -> dict:
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
            try:
                import json
                d[k] = json.loads(v)
            except Exception:
                pass
    return d

def _parse_filter(filt: dict, param_offset: int = 1) -> tuple[str, list, int]:
    if not filt:
        return "1=1", [], param_offset
    clauses = []
    params = []
    idx = param_offset
    for k, v in filt.items():
        if isinstance(v, dict):
            if "$in" in v:
                in_vals = v["$in"]
                if not in_vals:
                    clauses.append("1=0")
                else:
                    placeholders = ", ".join(f"${idx + i}" for i in range(len(in_vals)))
                    clauses.append(f"{k} IN ({placeholders})")
                    params.extend(in_vals)
                    idx += len(in_vals)
            elif "$gte" in v or "$lte" in v or "$gt" in v or "$lt" in v:
                for op, sql_op in [("$gte", ">="), ("$lte", "<="), ("$gt", ">"), ("$lt", "<")]:
                    if op in v:
                        clauses.append(f"{k} {sql_op} ${idx}")
                        params.append(v[op])
                        idx += 1
            elif "$regex" in v:
                pattern = v["$regex"]
                flags = v.get("$options", "")
                op = "~*" if "i" in flags else "~"
                clauses.append(f"{k} {op} ${idx}")
                params.append(pattern)
                idx += 1
            elif "$ne" in v:
                clauses.append(f"{k} != ${idx}")
                params.append(v["$ne"])
                idx += 1
        elif v is None:
            clauses.append(f"{k} IS NULL")
        else:
            clauses.append(f"{k} = ${idx}")
            params.append(v)
            idx += 1
    return " AND ".join(clauses) if clauses else "1=1", params, idx


class PostgreSQLRepository(BaseRepository):
    def __init__(self, table_name: str):
        self.table = table_name

    def _get_supabase_headers(self):
        return {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def _rest_find(self, filt: Optional[dict] = None, sort: Optional[list[tuple[str, int]]] = None, skip: int = 0, limit: int = 0) -> list[dict]:
        url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
        params = {"select": "*"}
        if limit:
            params["limit"] = str(limit)
        if skip:
            params["offset"] = str(skip)
        if sort:
            orders = []
            for col, order in sort:
                direction = "desc" if order == -1 else "asc"
                orders.append(f"{col}.{direction}")
            params["order"] = ",".join(orders)
            
        if filt:
            for k, v in filt.items():
                if isinstance(v, dict):
                    if "$in" in v and v["$in"]:
                        params[f"{k}"] = f"in.({','.join(str(x) for x in v['$in'])})"
                    elif "$gte" in v:
                        params[f"{k}"] = f"gte.{v['$gte']}"
                    elif "$lte" in v:
                        params[f"{k}"] = f"lte.{v['$lte']}"
                    elif "$regex" in v:
                        params[f"{k}"] = f"ilike.*{v['$regex']}*"
                elif v is not None:
                    params[f"{k}"] = f"eq.{v}"

        async with httpx.AsyncClient(verify=False) as client:
            res = await client.get(url, headers=self._get_supabase_headers(), params=params, timeout=10.0)
            res.raise_for_status()
            return res.json()

    async def insert(self, doc: dict) -> dict:
        return await self.insert_one(doc)

    async def insert_one(self, doc: dict) -> dict:
        doc_copy = dict(doc)
        if "id" not in doc_copy:
            doc_copy["id"] = str(uuid.uuid4())
        
        if self.table == "sermons":
            for invalid_col in ("official_pdf_hash", "canonical_text", "canonical_text_hash", "import_engine", "import_report", "raw_transcript", "verification", "current_version", "versions", "refresh_report", "audit_timeline"):
                doc_copy.pop(invalid_col, None)

        try:
            pool = get_pool()
            keys = list(doc_copy.keys())
            values = [_clean_val(k, v) for k, v in doc_copy.items()]
            placeholders = ", ".join(f"${i+1}" for i in range(len(keys)))
            col_names = ", ".join(keys)
            query = f"INSERT INTO {self.table} ({col_names}) VALUES ({placeholders}) RETURNING *"
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, *values)
                return _row_to_dict(row)
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on insert_one ({e}), falling back to Supabase REST")
            url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.post(url, headers=self._get_supabase_headers(), json=doc_copy, timeout=10.0)
                res.raise_for_status()
                data = res.json()
                return data[0] if isinstance(data, list) and data else doc_copy

    async def find_one(self, filt: dict) -> Optional[dict]:
        try:
            pool = get_pool()
            where, params, _ = _parse_filter(filt)
            query = f"SELECT * FROM {self.table} WHERE {where} LIMIT 1"
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, *params)
                return _row_to_dict(row) if row else None
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on find_one ({e}), falling back to Supabase REST")
            results = await self._rest_find(filt=filt, limit=1)
            return results[0] if results else None

    async def find(self, filt: Optional[dict] = None, sort: Optional[list[tuple[str, int]]] = None, skip: int = 0, limit: int = 0, projection: Optional[dict] = None) -> list[dict]:
        try:
            pool = get_pool()
            where, params, _ = _parse_filter(filt or {})
            query = f"SELECT * FROM {self.table} WHERE {where}"
            if sort:
                sort_clauses = []
                for col, order in sort:
                    direction = "DESC" if order == -1 else "ASC"
                    sort_clauses.append(f"{col} {direction}")
                query += " ORDER BY " + ", ".join(sort_clauses)
            if limit:
                query += f" LIMIT {limit}"
            if skip:
                query += f" OFFSET {skip}"
            async with pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
                return [_row_to_dict(row) for row in rows]
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on find ({e}), falling back to Supabase REST")
            return await self._rest_find(filt=filt, sort=sort, skip=skip, limit=limit)

    async def count(self, filt: Optional[dict] = None) -> int:
        try:
            pool = get_pool()
            where, params, _ = _parse_filter(filt or {})
            query = f"SELECT COUNT(*) FROM {self.table} WHERE {where}"
            async with pool.acquire() as conn:
                return await conn.fetchval(query, *params)
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on count ({e}), falling back to Supabase REST")
            results = await self._rest_find(filt=filt)
            return len(results)

    async def update_one(self, filt: dict, patch: dict) -> int:
        update_doc = patch.get("$set", patch)
        if not update_doc:
            return 0
        try:
            pool = get_pool()
            keys = list(update_doc.keys())
            values = [_clean_val(k, v) for k, v in update_doc.items()]
            set_clauses = [f"{k} = ${i+1}" for i, k in enumerate(keys)]
            set_str = ", ".join(set_clauses)
            where, where_params, _ = _parse_filter(filt, len(values) + 1)
            ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
            query = f"UPDATE {self.table} SET {set_str} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"
            async with pool.acquire() as conn:
                status = await conn.execute(query, *values, *where_params)
                return int(status.split()[-1])
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on update_one ({e}), falling back to Supabase REST")
            url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
            headers = self._get_supabase_headers()
            if "id" in filt:
                url += f"?id=eq.{filt['id']}"
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.patch(url, headers=headers, json=update_doc, timeout=10.0)
                return 1 if res.status_code < 400 else 0

    async def update_many(self, filt: dict, patch: dict) -> int:
        update_doc = patch.get("$set", patch)
        if not update_doc:
            return 0
        try:
            pool = get_pool()
            keys = list(update_doc.keys())
            values = [_clean_val(k, v) for k, v in update_doc.items()]
            set_clauses = [f"{k} = ${i+1}" for i, k in enumerate(keys)]
            set_str = ", ".join(set_clauses)
            where, where_params, _ = _parse_filter(filt, len(values) + 1)
            query = f"UPDATE {self.table} SET {set_str} WHERE {where}"
            async with pool.acquire() as conn:
                status = await conn.execute(query, *values, *where_params)
                return int(status.split()[-1])
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on update_many ({e}), falling back to Supabase REST")
            return 0

    async def delete_one(self, filt: dict) -> int:
        try:
            pool = get_pool()
            where, params, _ = _parse_filter(filt)
            ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
            query = f"DELETE FROM {self.table} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"
            async with pool.acquire() as conn:
                status = await conn.execute(query, *params)
                return int(status.split()[-1])
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on delete_one ({e}), falling back to Supabase REST")
            url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
            if "id" in filt:
                url += f"?id=eq.{filt['id']}"
            async with httpx.AsyncClient(verify=False) as client:
                res = await client.delete(url, headers=self._get_supabase_headers(), timeout=10.0)
                return 1 if res.status_code < 400 else 0

    async def delete_many(self, filt: dict) -> int:
        try:
            pool = get_pool()
            where, params, _ = _parse_filter(filt)
            query = f"DELETE FROM {self.table} WHERE {where}"
            async with pool.acquire() as conn:
                status = await conn.execute(query, *params)
                return int(status.split()[-1])
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on delete_many ({e}), falling back to Supabase REST")
            return 0

    async def upsert_one(self, filt: dict, doc: dict, unique_key: str = "id") -> int:
        doc_copy = dict(doc)
        if "id" not in doc_copy:
            doc_copy["id"] = str(uuid.uuid4())
        try:
            pool = get_pool()
            keys = list(doc_copy.keys())
            insert_vals = [_clean_val(k, v) for k, v in doc_copy.items()]
            insert_keys_str = ", ".join(keys)
            insert_placeholders = ", ".join(f"${i+1}" for i in range(len(keys)))
            update_clauses = [f"{k} = EXCLUDED.{k}" for k in keys if k != unique_key]
            update_str = ", ".join(update_clauses)
            query = f"INSERT INTO {self.table} ({insert_keys_str}) VALUES ({insert_placeholders}) ON CONFLICT ({unique_key}) DO UPDATE SET {update_str}"
            async with pool.acquire() as conn:
                await conn.execute(query, *insert_vals)
                return 1
        except Exception as e:
            logger.warning(f"PostgreSQL asyncpg failed on upsert_one ({e}), falling back to Supabase REST")
            url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
            headers = self._get_supabase_headers()
            headers["Prefer"] = "resolution=merge-duplicates"
            async with httpx.AsyncClient(verify=False) as client:
                await client.post(url, headers=headers, json=doc_copy, timeout=10.0)
                return 1

    async def aggregate(self, pipeline: list) -> list[dict]:
        return []
