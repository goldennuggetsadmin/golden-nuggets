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
                has_regex = False
                for op, op_val in value.items():
                    if op == "$ne":
                        if op_val is None:
                            clauses.append(f"{key} IS NOT NULL")
                        else:
                            clauses.append(f"{key} != ${param_offset}")
                            params.append(_clean_val(key, op_val))
                            param_offset += 1
                    elif op == "$exists":
                        if op_val:
                            clauses.append(f"{key} IS NOT NULL")
                        else:
                            clauses.append(f"{key} IS NULL")
                    elif op == "$in":
                        cleaned_list = [_clean_val(key, v) for v in op_val] if isinstance(op_val, list) else op_val
                        clauses.append(f"{key} = ANY(${param_offset})")
                        params.append(cleaned_list)
                        param_offset += 1
                    elif op == "$gte":
                        clauses.append(f"{key} >= ${param_offset}")
                        params.append(_clean_val(key, op_val))
                        param_offset += 1
                    elif op == "$regex":
                        has_regex = True
                
                if has_regex:
                    options = value.get("$options", "")
                    if "i" in options:
                        clauses.append(f"{key} ILIKE ${param_offset}")
                    else:
                        clauses.append(f"{key} LIKE ${param_offset}")
                    params.append(f"%{value['$regex']}%")
                    param_offset += 1
            else:
                if value is None:
                    clauses.append(f"{key} IS NULL")
                elif key in ("category_ids", "tags", "featured_sermon_ids", "upcoming_meeting_ids") and isinstance(value, str):
                    clauses.append(f"${param_offset} = ANY({key})")
                    params.append(_clean_val(key, value))
                    param_offset += 1
                else:
                    clauses.append(f"{key} = ${param_offset}")
                    params.append(_clean_val(key, value))
                    param_offset += 1
                
    if not clauses:
        return "1=1", [], param_offset
    return " AND ".join(clauses), params, param_offset


class PostgreSQLRepository(BaseRepository):
    def __init__(self, collection: str) -> None:
        super().__init__(collection)
        self.table = collection

    async def insert(self, doc: dict) -> dict:
        doc_copy = dict(doc)
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
            order_parts = []
            for field, direction in sort:
                order_parts.append(f"{field} {'DESC' if direction == -1 else 'ASC'}")
            query += " ORDER BY " + ", ".join(order_parts)
            
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
        if not patch:
            return 0
        patch_copy = dict(patch)
        if self.table == "sermons":
            for invalid_col in ("official_pdf_hash", "canonical_text", "canonical_text_hash", "import_engine", "import_report", "raw_transcript", "verification", "current_version", "versions", "refresh_report", "audit_timeline"):
                patch_copy.pop(invalid_col, None)
        keys = list(patch_copy.keys())
        values = [_clean_val(k, v) for k, v in patch_copy.items()]
        
        set_clauses = [f"{k} = ${i+1}" for i, k in enumerate(keys)]
        set_str = ", ".join(set_clauses)
        
        where, where_params, _ = _parse_filter(filt, len(values) + 1)
        
        ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
        query = f"UPDATE {self.table} SET {set_str} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"

        async with get_pool().acquire() as conn:
            status = await conn.execute(query, *values, *where_params)
            return int(status.split()[-1])

    async def update_many(self, filt: dict, patch: dict) -> int:
        if not patch:
            return 0
        keys = list(patch.keys())
        values = [_clean_val(k, v) for k, v in patch.items()]
        
        set_clauses = [f"{k} = ${i+1}" for i, k in enumerate(keys)]
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

    async def raw_update_one(self, filt: dict, mongo_style_update: dict, upsert: bool = False) -> int:
        if upsert:
            unique_key = list(filt.keys())[0]
            unique_val = _clean_val(unique_key, list(filt.values())[0])
            
            insert_keys = [unique_key]
            insert_vals = [unique_val]
            update_clauses = []
            
            patch = mongo_style_update.get("$set", {})
            for k, v in patch.items():
                if k not in insert_keys:
                    insert_keys.append(k)
                    insert_vals.append(_clean_val(k, v))
                update_clauses.append(f"{k} = EXCLUDED.{k}")
                
            insert_keys_str = ", ".join(insert_keys)
            insert_placeholders = ", ".join(f"${i+1}" for i in range(len(insert_keys)))
            update_str = ", ".join(update_clauses)
            
            query = f"INSERT INTO {self.table} ({insert_keys_str}) VALUES ({insert_placeholders}) ON CONFLICT ({unique_key}) DO UPDATE SET {update_str}"
            
            async with get_pool().acquire() as conn:
                await conn.execute(query, *insert_vals)
                return 1
                
        else:
            set_clauses = []
            params = []
            param_offset = 1
            
            if "$set" in mongo_style_update:
                for k, v in mongo_style_update["$set"].items():
                    set_clauses.append(f"{k} = ${param_offset}")
                    params.append(_clean_val(k, v))
                    param_offset += 1
            if "$inc" in mongo_style_update:
                for k, v in mongo_style_update["$inc"].items():
                    set_clauses.append(f"{k} = COALESCE({k}, 0) + ${param_offset}")
                    params.append(v)
                    param_offset += 1
            if "$addToSet" in mongo_style_update:
                for k, v in mongo_style_update["$addToSet"].items():
                    set_clauses.append(f"{k} = array_append(COALESCE({k}, '{{}}'::text[]), ${param_offset}::text)")
                    params.append(str(v))
                    param_offset += 1
            if "$pull" in mongo_style_update:
                for k, v in mongo_style_update["$pull"].items():
                    set_clauses.append(f"{k} = array_remove(COALESCE({k}, '{{}}'::text[]), ${param_offset}::text)")
                    params.append(str(v))
                    param_offset += 1
                    
            if not set_clauses:
                return 0
                
            set_str = ", ".join(set_clauses)
            where, where_params, _ = _parse_filter(filt, param_offset)
            params.extend(where_params)
            
            ident_col = "identifier" if "identifier" in filt and self.table == "login_attempts" else "id"
            query = f"UPDATE {self.table} SET {set_str} WHERE {ident_col} IN (SELECT {ident_col} FROM {self.table} WHERE {where} LIMIT 1)"
                
            async with get_pool().acquire() as conn:
                status = await conn.execute(query, *params)
                return int(status.split()[-1])
