from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import AsyncSessionLocal, sync_engine
from app.models import Company
from app.schemas import CompanyRegister, CompanyLogin, CompanyResponse, Token
from app.auth import hash_password, verify_password, create_access_token, get_current_user, validate_schema_name
from app.schemas import TokenData

router = APIRouter(prefix="/api/auth", tags=["auth"])

TENANT_DDL = """
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""


@router.post("/register", response_model=CompanyResponse)
async def register(data: CompanyRegister):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Company).where(Company.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

        company = Company(
            name=data.name,
            email=data.email,
            hashed_password=hash_password(data.password),
            schema_name="tenant_placeholder",
        )
        db.add(company)
        await db.flush()

        schema_name = validate_schema_name(f"tenant_{company.id}")
        company.schema_name = schema_name

        await db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))
        await db.commit()
        await db.refresh(company)

    with sync_engine.begin() as conn:
        conn.execute(text(f"SET search_path TO {schema_name}, public"))
        for stmt in TENANT_DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                conn.execute(text(stmt))

    return company


@router.post("/login", response_model=Token)
async def login(data: CompanyLogin):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Company).where(Company.email == data.email))
        company = result.scalar_one_or_none()
        if not company or not verify_password(data.password, company.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_access_token({"company_id": company.id, "schema_name": company.schema_name})
        return Token(access_token=token)


@router.get("/me", response_model=CompanyResponse)
async def me(token_data: TokenData = Depends(get_current_user)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Company).where(Company.id == token_data.company_id))
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        return company


@router.delete("/me")
async def delete_tenant(token_data: TokenData = Depends(get_current_user)):
    schema_name = validate_schema_name(token_data.schema_name)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Company).where(Company.id == token_data.company_id))
        company = result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        try:
            await db.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))
            await db.delete(company)
            await db.commit()
        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to delete tenant")

    return {"detail": "Tenant deleted successfully"}
