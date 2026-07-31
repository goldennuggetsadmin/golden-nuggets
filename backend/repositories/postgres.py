from __future__ import annotations
from typing import Optional, List, Tuple
import uuid
import datetime
from db import get_pool
from .base import BaseRepository

def _row_to_dict(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, (datetime.datetime, datetime.date)):
            d[k] = v.isoformat()
        elif isinstance(v, str) and k in ("transcripts", "metadata"):
            import json
            try:
                d[k] = json.loads(v)
            except Exception:
                pass
    return d

def _clean_val(key: str, val: any) -> any:
    if val is None:
        return None
    if isinstance(val, (dict, list)) and key in ("transcripts", "metadata"):
        import json
        return json.dumps(val)
    if isinstance(val, str):
        if (key == "id" or key == "parent_id") and len(val) == 36:
            try:
                return uuid.UUID(val)
            except ValueError:
                pass
        if key in ("created_at", "updated_at", "timestamp", "lock_until"):
            try:
                return datetime.datetime.fromisoformat(val)
            except Exception:
                pass
    return val

def _parse_filter(filt: dict, param_offset: int = 1) -> tuple[str, list, int]:
    if not filt:
        return "1=1", [], param_offset
    
    clauses = []
    params = []
    
    for key, value in filt.items():
        if key == "$or":
            or_clauses = []
            for sub_filt in value:
                sub_clause, sub_params, param_offset = _parse_filter(sub_filt, param_offset)
                or_clauses.append(f"({sub_clause})")
                params.extend(sub_params)
            clauses.append("(" + " OR ".join(or_clauses) + ")")
        else:
            if isinstance(value, dict):
                for op, val in value.items():
                    val = _clean_val(key, val)
                    if op == "$regex":
                        options = value.get("$options", "")
                        op_sql = "~*" if "i" in options else "~"
                        clauses.append(f"{key} {op_sql} ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$in":
                        in_placeholders = []
                        for item in val:
                            in_placeholders.append(f"${param_offset}")
                            params.append(_clean_val(key, item))
                            param_offset += 1
                        clauses.append(f"{key} IN ({', '.join(in_placeholders)})")
                    elif op == "$gte":
                        clauses.append(f"{key} >= ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$lte":
                        clauses.append(f"{key} <= ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$gt":
                        clauses.append(f"{key} > ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$lt":
                        clauses.append(f"{key} < ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$ne":
                        clauses.append(f"{key} != ${param_offset}")
                        params.append(val)
                        param_offset += 1
                    elif op == "$exists":
                        if val:
                            clauses.append(f"{key} IS NOT NULL")
                        else:
                            clauses.append(f"{key} IS NULL")
            else:
                cleaned = _clean_val(key, value)
                if cleaned is None:
                    clauses.append(f"{key} IS NULL")
                else:
                    clauses.append(f"{key} = ${param_offset}")
                    params.append(cleaned)
                    param_offset += 1

    return " AND ".join(clauses), params, param_offset


class PostgreSQLRepository(BaseRepository):
    def __init__(self, table_name: str):
        self.table = table_name

    async def insert_one(self, doc: dict) -> dict:
        doc_copy = dict(doc)
        if "id" not in doc_copy:
            doc_copy["id"] = str(uuid.uuid4())
        
        if self.table == "sermons":
            for invalid_col in ("official_pdf_hash", "canonical_text", "canonical_text_hash", "import_engine", "import_report", "raw_transcript", "verification", "current_version", "versions", "refresh_report", "audit_timeline"):
                doc_copy.pop(invalid_col, None)
        keys = list(doc_copy.keys())
        values = [_clean_val(k, v) for k, v in doc_copy.items()]
        placeholders = ", ".join(f"${i+1}" for i in range(len(keys)))
        col_names = ", ".join(keys)
        query = f"INSERT INTO {self.table} ({col_names}) VALUES ({placeholders}) RETURNING *"
        async with get_pool().acquire() as conn:
            row = await conn.fetchrow(query, *values)
            return _row_to_dict(row)

    async def find_one(self, filt: dict) -> Optional[dict]:
        where, params, _ = _parse_filter(filt)
        query = f"SELECT * FROM {self.table} WHERE {where} LIMIT 1"
        async with get_pool().acquire() as conn:
            row = await conn.fetchrow(query, *params)
            return _row_to_dict(row) if row else None

    async def find(self, filt: Optional[dict] = None, sort: Optional[list[tuple[str, int]]] = None, skip: int = 0, limit: int = 0, projection: Optional[dict] = None) -> list[dict]:
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
            
        async with get_pool().acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [_row_to_dict(row) for row in rows]

    async def count(self, filt: Optional[dict] = None) -> int:
        where, params, _ = _parse_filter(filt or {})
        query = f"SELECT COUNT(*) FROM {self.table} WHERE {where}"
        async with get_pool().acquire() as conn:
            return await conn.fetchval(query, *params)

    async def update_one(self, filt: dict, patch: dict) -> int:
        update_doc = patch.get("$set", patch)
        if not update_doc:
            return 0
            
        keys = list(update_doc.keys())
        values = [_clean_val(k, v) for k, v in update_doc.items()]
        
        set_clauses = []
        for i, k in enumerate(keys):
            set_clauses.append(f"{k} = ${i+1}")
        set_str = ", ".join(set_clauses)
        
        where, where_params, _ = _parse_filter(filt, len(values) + 1)
        ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
        query = f"UPDATE {self.table} SET {set_str} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"

        async with get_pool().acquire() as conn:
            status = await conn.execute(query, *values, *where_params)
            return int(status.split()[-1])

    async def update_many(self, filt: dict, patch: dict) -> int:
        update_doc = patch.get("$set", patch)
        if not update_doc:
            return 0
            
        keys = list(update_doc.keys())
        values = [_clean_val(k, v) for k, v in update_doc.items()]
        
        set_clauses = []
        for i, k in enumerate(keys):
            set_clauses.append(f"{k} = ${i+1}")
        set_str = ", ".join(set_clauses)
        
        where, where_params, _ = _parse_filter(filt, len(values) + 1)
        
        query = f"UPDATE {self.table} SET {set_str} WHERE {where}"
        async with get_pool().acquire() as conn:
            status = await conn.execute(query, *values, *where_params)
            return int(status.split()[-1])

    async def delete_one(self, filt: dict) -> int:
        where, params, _ = _parse_filter(filt)
        ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
        query = f"DELETE FROM {self.table} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"

        async with get_pool().acquire() as conn:
            status = await conn.execute(query, *params)
            return int(status.split()[-1])

    async def delete_many(self, filt: dict) -> int:
        where, params, _ = _parse_filter(filt)
        query = f"DELETE FROM {self.table} WHERE {where}"
        async with get_pool().acquire() as conn:
            status = await conn.execute(query, *params)
            return int(status.split()[-1])

    async def upsert_one(self, filt: dict, doc: dict, unique_key: str = "id") -> int:
        doc_copy = dict(doc)
        if "id" not in doc_copy:
            doc_copy["id"] = str(uuid.uuid4())
            
        keys = list(doc_copy.keys())
        insert_vals = [_clean_val(k, v) for k, v in doc_copy.items()]
        
        insert_keys_str = ", ".join(keys)
        insert_placeholders = ", ".join(f"${i+1}" for i in range(len(keys)))
        
        update_clauses = []
        for k in keys:
            if k != unique_key:
                update_clauses.append(f"{k} = EXCLUDED.{k}")
        update_str = ", ".join(update_clauses)
        
        query = f"INSERT INTO {self.table} ({insert_keys_str}) VALUES ({insert_placeholders}) ON CONFLICT ({unique_key}) DO UPDATE SET {update_str}"
        
        async with get_pool().acquire() as conn:
            await conn.execute(query, *insert_vals)
            return 1

    async def aggregate(self, pipeline: list) -> list[dict]:
        return []
