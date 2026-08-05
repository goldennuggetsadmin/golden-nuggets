"""
PostgreSQL Async Repository implementation for Golden Nuggets — production.
Uses asyncpg connection pool with Supabase REST fallback.
"""
from __future__ import annotations
import uuid
import json
import logging
from typing import Optional, List, Dict, Any
import httpx

from config.settings import settings
from repositories.base import BaseRepository

logger = logging.getLogger(__name__)

JSONB_COLS = {"transcripts", "metadata", "pipeline", "quality_diagnostics", "import_report"}

def _clean_val(k: str, v: Any) -> Any:
    if isinstance(v, uuid.UUID):
        return str(v)
    if k in JSONB_COLS and isinstance(v, (list, dict)):
        return json.dumps(v, default=str)
    if isinstance(v, dict):
        return json.dumps(v, default=str)
    # Python lists for ARRAY columns (e.g. tags, category_ids) passed through as-is for asyncpg
    return v

def _row_to_dict(row) -> dict:
    """Convert an asyncpg Record to a plain dict.
    
    JSONB columns (e.g. transcripts, tags) are returned by asyncpg as either:
    - Already a list/dict (when asyncpg auto-decodes them)
    - A JSON string (when the column type is text or asyncpg returns raw JSON)
    We always ensure they are Python objects, never raw JSON strings.
    """
    if not row:
        return {}
    d = dict(row)
    # JSONB / JSON-encoded string fields that must be Python objects, never strings.
    JSON_FIELDS = {"transcripts", "tags", "category_ids", "pipeline", "quality_diagnostics",
                   "import_report", "metadata"}
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, str) and k in JSON_FIELDS and v.strip().startswith(("[", "{")):
            try:
                d[k] = json.loads(v)
            except (ValueError, TypeError):
                pass  # Leave as string if JSON parse fails
        elif isinstance(v, (dict, list)):
            pass  # Already a Python object — no conversion needed
    return d

def _parse_filter(filt: dict, param_start: int = 1) -> tuple[str, list, int]:
    if not filt:
        return "1=1", [], param_start

    clauses = []
    params = []
    idx = param_start

    for k, v in filt.items():
        if k == "$or" and isinstance(v, list):
            or_clauses = []
            for sub in v:
                sub_clause, sub_params, idx = _parse_filter(sub, idx)
                or_clauses.append(f"({sub_clause})")
                params.extend(sub_params)
            if or_clauses:
                clauses.append(f"({' OR '.join(or_clauses)})")
        elif isinstance(v, dict):
            if "$in" in v and v["$in"]:
                placeholders = ", ".join(f"${idx + i}" for i in range(len(v["$in"])))
                clauses.append(f"{k} IN ({placeholders})")
                params.extend(v["$in"])
                idx += len(v["$in"])
            elif "$regex" in v:
                pattern = v["$regex"]
                opts = v.get("$options", "")
                op = "~*" if "i" in opts else "~"
                clauses.append(f"{k} {op} ${idx}")
                params.append(pattern)
                idx += 1
            elif "$ne" in v:
                # IS DISTINCT FROM handles NULLs correctly:
                # NULL IS DISTINCT FROM TRUE → TRUE (row included)
                # FALSE IS DISTINCT FROM TRUE → TRUE (row included)
                clauses.append(f"{k} IS DISTINCT FROM ${idx}")
                params.append(v["$ne"])
                idx += 1
        elif v is None:
            clauses.append(f"{k} IS NULL")
        else:
            clauses.append(f"{k} = ${idx}")
            params.append(v)
            idx += 1
    return " AND ".join(clauses) if clauses else "1=1", params, idx


SERMON_SUMMARY_COLS = (
    "id, sermon_code, title, speaker, date, year, location, state, series, "
    "language, description, duration, tags, category_ids, featured, status, "
    "source, source_url, audio_url, audio_storage_path, artwork_url, artwork_storage_path, "
    "pdf_english_url, pdf_english_storage_path, pdf_telugu_url, pdf_telugu_storage_path, "
    "is_archived, play_count, download_count, favorite_count, verification_status, "
    "transcript_parsed, transcript_paragraph_count, transcript_page_count, "
    "transcript_parser_version, transcript, transcripts, "
    "approved_by, approved_at, approval_reason, "
    "created_at, updated_at"
)

# Global connection pool
_pool = None

def get_pool():
    import db
    return db.get_pool()

_HTTPX_CLIENT: Optional[httpx.AsyncClient] = None

def get_httpx_client() -> httpx.AsyncClient:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None or _HTTPX_CLIENT.is_closed:
        _HTTPX_CLIENT = httpx.AsyncClient(
            verify=False,
            timeout=10.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
        )
    return _HTTPX_CLIENT


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
        try:
            url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
            select_cols = SERMON_SUMMARY_COLS if self.table == "sermons" else "*"
            base_params = {"select": select_cols}
            if sort:
                orders = []
                for col, order in sort:
                    direction = "desc" if order == -1 else "asc"
                    orders.append(f"{col}.{direction}")
                base_params["order"] = ",".join(orders)

            if filt:
                for k, v in filt.items():
                    if k == "$or" and isinstance(v, list):
                        or_conds = []
                        for sub in v:
                            for sk, sv in sub.items():
                                if isinstance(sv, dict):
                                    if "$in" in sv and sv["$in"]:
                                        quoted = ",".join(f'"{x}"' for x in sv["$in"])
                                        or_conds.append(f"{sk}.in.({quoted})")
                                    elif "$regex" in sv:
                                        or_conds.append(f"{sk}.ilike.*{sv['$regex']}*")
                                    elif "$ne" in sv:
                                        or_conds.append(f"{sk}.neq.{sv['$ne']}")
                                elif sv is not None:
                                    or_conds.append(f"{sk}.eq.{sv}")
                        if or_conds:
                            base_params["or"] = f"({','.join(or_conds)})"
                        continue

                    if isinstance(v, dict):
                        if "$in" in v and v["$in"]:
                            quoted = ",".join(f'"{x}"' for x in v["$in"])
                            base_params[f"{k}"] = f"in.({quoted})"
                        elif "$gte" in v:
                            base_params[f"{k}"] = f"gte.{v['$gte']}"
                        elif "$lte" in v:
                            base_params[f"{k}"] = f"lte.{v['$lte']}"
                        elif "$regex" in v:
                            base_params[f"{k}"] = f"ilike.*{v['$regex']}*"
                        elif "$ne" in v:
                            base_params[f"{k}"] = f"neq.{v['$ne']}"
                    elif v is not None:
                        base_params[f"{k}"] = f"eq.{v}"

            client = get_httpx_client()
            all_results = []
            current_offset = skip
            max_to_fetch = limit if limit > 0 else 50000

            while len(all_results) < max_to_fetch:
                batch_limit = min(1000, max_to_fetch - len(all_results))
                params = dict(base_params)
                params["limit"] = str(batch_limit)
                params["offset"] = str(current_offset)

                res = await client.get(url, headers=self._get_supabase_headers(), params=params, timeout=5.0)
                res.raise_for_status()
                batch = res.json()
                if not batch or not isinstance(batch, list):
                    break
                all_results.extend(batch)
                if len(batch) < 1000:
                    break
                current_offset += len(batch)

            return all_results
        except Exception as e:
            logger.error(f"Supabase REST query failed for {self.table}: {e}")
            return []

    async def insert(self, doc: dict) -> dict:
        return await self.insert_one(doc)

    async def insert_one(self, doc: dict) -> dict:
        doc_copy = dict(doc)
        if "id" not in doc_copy:
            doc_copy["id"] = str(uuid.uuid4())

        # ── Whitelist: only keep columns that actually exist in the target table ──
        if self.table == "sermons":
            VALID_SERMON_COLS = {
                "id", "sermon_code", "title", "speaker", "date", "year", "location",
                "state", "series", "language", "description", "duration", "tags",
                "category_ids", "featured", "status", "source", "source_url",
                "audio_url", "artwork_url", "pdf_english_url", "pdf_telugu_url",
                "is_archived", "play_count", "download_count", "favorite_count",
                "verification_status", "transcript_parsed", "transcript_paragraph_count",
                "transcript_page_count", "transcript_parser_version",
                "approved_by", "approved_at", "approval_reason",
                "previous_status", "audio_storage_path", "artwork_storage_path",
                "pdf_english_storage_path", "pdf_telugu_storage_path",
                "created_at", "updated_at"
            }
            doc_copy = {k: v for k, v in doc_copy.items() if k in VALID_SERMON_COLS}
        elif self.table == "activity_log":
            VALID_ACTIVITY_COLS = {
                "id", "action", "entity_type", "entity_id", "message", "status",
                "actor_id", "ip", "user_agent", "metadata", "created_at"
            }
            doc_copy = {k: v for k, v in doc_copy.items() if k in VALID_ACTIVITY_COLS}

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
            
            select_cols = "*"
            if self.table == "sermons":
                if projection and projection.get("transcripts") == 1:
                    select_cols = "*"
                elif not projection or projection.get("transcripts") == 0:
                    select_cols = SERMON_SUMMARY_COLS

            query = f"SELECT {select_cols} FROM {self.table} WHERE {where}"
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
            logger.warning(f"PostgreSQL asyncpg failed on count ({e}), falling back to Supabase REST count")
            try:
                url = f"{settings.SUPABASE_URL}/rest/v1/{self.table}"
                headers = {
                    **self._get_supabase_headers(),
                    "Prefer": "count=exact"
                }
                params_rest = {"select": "id", "limit": "1"}
                if filt:
                    for k, v in filt.items():
                        if k.startswith("$"):
                            continue
                        if isinstance(v, dict):
                            if "$ne" in v:
                                params_rest[k] = f"neq.{v['$ne']}"
                            elif "$in" in v and v["$in"]:
                                quoted = ",".join(f'"{x}"' for x in v["$in"])
                                params_rest[k] = f"in.({quoted})"
                            elif "$gte" in v:
                                params_rest[k] = f"gte.{v['$gte']}"
                            elif "$lte" in v:
                                params_rest[k] = f"lte.{v['$lte']}"
                        elif v is not None:
                            params_rest[k] = f"eq.{v}"
                async with httpx.AsyncClient(verify=False) as client:
                    res = await client.get(url, headers=headers, params=params_rest, timeout=5.0)
                    if res.status_code < 400:
                        cr = res.headers.get("content-range", "")
                        # content-range: 0-0/255 → extract total after '/'
                        if "/" in cr:
                            total_str = cr.split("/")[-1]
                            if total_str != "*":
                                return int(total_str)
                    # Last resort: count returned rows
                    return len(res.json()) if res.status_code < 400 else 0
            except Exception as e2:
                logger.error(f"Supabase REST count also failed ({e2})")
                return 0

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
                import json
                json_data = json.loads(json.dumps(update_doc, default=str))
                res = await client.patch(url, headers=headers, json=json_data, timeout=10.0)
                return 1 if res.status_code < 400 else 0

    async def raw_update_one(self, filt: dict, patch: dict, upsert: bool = False) -> int:
        res = await self.update_one(filt, patch)
        if res == 0 and upsert:
            update_doc = patch.get("$set", patch)
            combined = {**filt, **update_doc}
            clean_doc = {k: v for k, v in combined.items() if not k.startswith("$")}
            try:
                await self.insert(clean_doc)
                return 1
            except Exception as e:
                logger.warning(f"PostgreSQL raw_update_one upsert fallback failed ({e})")
        return res

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
            return 0

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
