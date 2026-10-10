"""ASGI app for the API-level QA lab: the production mastering + health routers
under /api, exactly as app.main mounts them, minus the chords router (which
imports essentia at module load and is not in requirements-test.txt).

  uvicorn benchmark.qa_app:app --port 8011     (from backend/)
"""

from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.mastering import router as mastering_router

app = FastAPI(title="Auralith QA lab")
app.include_router(health_router, prefix="/api")
app.include_router(mastering_router, prefix="/api")
