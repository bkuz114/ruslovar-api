"""
FastAPI application for the ruslovar API.

This module creates the FastAPI app, configures CORS, includes all API
routes, and defines the lifespan context (startup/shutdown).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html

from app.api.router import api_router
from app.config import settings

from pathlib import Path

# == Set up Swagger UI to work offline == #
# (FastAPI serves assets via CDN by deafault; will need to force it to use local files)

# URL prefix where local Swagger UI assets will be served.
SWAGGER_UI_URL_PREFIX = "/static/swagger-ui"
# actual path on the filesystem containing the local Swagger assets, derived from the URL prefix.
SWAGGER_UI_DIR = Path(__file__).resolve().parent / SWAGGER_UI_URL_PREFIX.lstrip("/")


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
        # Disable the default /docs route, which loads Swagger UI assets from a CDN.
        # Will define custom /docs below with local assets (no CDN) so can host offline
        docs_url=None,
        version="0.1.0",
    )

    # Instruct FastAPI where on disk to serve the static swagger assets from
    # (the offline files being used to generate swagger UI for the /docs API)
    app.mount(
        SWAGGER_UI_URL_PREFIX,
        StaticFiles(directory=str(SWAGGER_UI_DIR)),
        name="swagger-ui",
    )

    # Custom /docs route (source of Swagger UI)
    #
    # - By default, FastAPI creates /docs and generates an HTML page that loads
    #   Swagger UI assets from a CDN.
    # - Want Swagger to work offline (no CDN), so disabled that default route
    #   above via docs_url=None
    # - Here, manually define /docs and call get_swagger_ui_html() and point it
    #   at local offline asset files.
    #
    # The returned page is functionally identical to the default /docs,
    # except that every asset is served from this application.
    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_ui():
        return get_swagger_ui_html(
            openapi_url=app.openapi_url,
            title=app.title + " - Swagger UI",
            swagger_js_url=f"{SWAGGER_UI_URL_PREFIX}/swagger-ui-bundle.js",
            swagger_css_url=f"{SWAGGER_UI_URL_PREFIX}/swagger-ui.css",
            swagger_favicon_url=f"{SWAGGER_UI_URL_PREFIX}/favicon-32x32.png",
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
