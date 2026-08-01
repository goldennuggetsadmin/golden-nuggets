from fastapi import Request
from fastapi.responses import JSONResponse
from .exceptions import AppError
from .logger import logger

async def app_error_handler(request: Request, exc: AppError):
    logger.warning(f"AppError at {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.code,
        content={"detail": exc.detail, "error": exc.detail, "code": exc.code},
    )

async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception at {request.url.path}: {exc}")
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "error": str(exc), "code": 500},
    )
