import logging

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import close_db
from app.routers import register

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield
    await close_db()


app = FastAPI(
    title="Family Camp API",
    description="Pre-registration API for the family camp.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(register.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
