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
    title="Kids Camp API",
    description="Pre-registration API for the kids camp.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    "https://tabor.lutheran.sk",
    "http://localhost:5500",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(register.router)


@app.get("/liveness/", status_code=200)
def liveness_check():
    return "Liveness check succeeded."


@app.get("/readiness/", status_code=200)
def readiness_check():
    return "Readiness check succeeded."


@app.get("/startup/", status_code=200)
def startup_check():
    return "Startup check succeeded."