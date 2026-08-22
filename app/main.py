"""
FastAPI application for the ruslovar API.

This module creates the FastAPI app, configures CORS, includes all API
routes, and defines the lifespan context (startup/shutdown).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    Returns:
        A configured FastAPI instance ready to serve requests.
    """
    app = FastAPI(
        title="Ruslovar API",
        description=(
            "Russian dictionary API for noun declensions. "
            "See docs/api.md for the full contract."
        ),
        version="0.1.0",
    )

    # CORS configuration.
    # Origins are loaded from settings (comma-separated or "*" for all).
    # For production, restrict this to the actual webapp domain.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include all API routes
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()


@app.get(
    "/health",
    summary="Health check",
    description="Returns 200 if the API is running. Does not check database connectivity.",
)
def health():
    """
    Simple health check endpoint.
    """
    return {"status": "ok"}
