from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import async_engine, AsyncSessionLocal
from app.models import Company, Base
from app.routers import auth, projects, tasks, websocket, custom_fields, notifications


async def init_public_tables():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[Company.__table__])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_public_tables()
    yield


app = FastAPI(title="Multi-Tenant Task Manager", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:2222", "ws://localhost:2222"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(websocket.router)
app.include_router(custom_fields.router)
app.include_router(notifications.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
