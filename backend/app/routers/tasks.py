from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.schemas import TaskCreate, TaskUpdate, TaskResponse, TaskReorder
from app.crud import (
    create_task, get_tasks_by_project, get_task,
    update_task, delete_task, reorder_task
)
from app.auth import get_tenant_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])


@router.post("", response_model=TaskResponse)
async def create(project_id: int, data: TaskCreate, db: AsyncSession = Depends(get_tenant_db)):
    task = await create_task(db, project_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Project not found")
    return task


@router.get("", response_model=List[TaskResponse])
async def list_all(project_id: int, db: AsyncSession = Depends(get_tenant_db)):
    return await get_tasks_by_project(db, project_id)


@router.get("/{task_id}", response_model=TaskResponse)
async def get(project_id: int, task_id: int, db: AsyncSession = Depends(get_tenant_db)):
    task = await get_task(db, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update(project_id: int, task_id: int, data: TaskUpdate, db: AsyncSession = Depends(get_tenant_db)):
    task = await update_task(db, task_id, data)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}/reorder", response_model=TaskResponse)
async def reorder(project_id: int, task_id: int, data: TaskReorder, db: AsyncSession = Depends(get_tenant_db)):
    task = await reorder_task(db, task_id, data.new_status, data.new_position)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}")
async def remove(project_id: int, task_id: int, db: AsyncSession = Depends(get_tenant_db)):
    if not await delete_task(db, task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"detail": "Deleted"}
