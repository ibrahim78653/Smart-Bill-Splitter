"""FastAPI application factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import bills, people
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler, generic_error_handler
from app.core.logging import setup_logging
from app.repositories.bill_repository import close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    settings = get_settings()
    settings.image_storage_path.mkdir(parents=True, exist_ok=True)
    yield
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="AI Bill Splitter API",
        description="Smart Bill Splitter — AI extraction + deterministic calculation engine",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register error handlers
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)

    # Register routers
    app.include_router(bills.router)
    app.include_router(people.router)

    # Static file serving for uploaded bill images
    settings.image_storage_path.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(settings.image_storage_path)), name="uploads")

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "ai-bill-splitter"}

    return app


app = create_app()
