"""Application entry point.

The browser only ever talks to the API through the same origin: Vite proxies /api in
development and nginx does it in Docker. That is why there is no CORS setup, and why the
docs live under /api as well.
"""

from fastapi import FastAPI

from app.api.routes import router

app = FastAPI(
    title="Crosscheck",
    description="Grades a rule-based and an LLM candidate scorer against recruiter decisions.",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.include_router(router)
