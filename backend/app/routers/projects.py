from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from app.crud import create_project, get_projects, get_project, update_project, delete_project
from app.auth import get_tenant_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
async def create(data: ProjectCreate, db: AsyncSession = Depends(get_tenant_db)):
    return await create_project(db, data)


@router.get("", response_model=List[ProjectResponse])
async def list_all(db: AsyncSession = Depends(get_tenant_db)):
    return await get_projects(db)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get(project_id: int, db: AsyncSession = Depends(get_tenant_db)):
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update(project_id: int, data: ProjectUpdate, db: AsyncSession = Depends(get_tenant_db)):
    project = await update_project(db, project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def remove(project_id: int, db: AsyncSession = Depends(get_tenant_db)):
    if not await delete_project(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"detail": "Deleted"}
