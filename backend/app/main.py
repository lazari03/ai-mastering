import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.chords import router as chords_router
from app.api.routes.health import router as health_router
from app.api.routes.mastering import router as mastering_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.storage_cleanup import run_forever as run_storage_cleanup_forever

configure_logging()

app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
)


@app.on_event("startup")
async def _start_storage_cleanup() -> None:
    asyncio.create_task(run_storage_cleanup_forever())

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(mastering_router, prefix=settings.api_prefix)
app.include_router(chords_router, prefix=settings.api_prefix)
