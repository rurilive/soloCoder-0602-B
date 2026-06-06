from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List
from app.schemas import TaskCreate, TaskUpdate, TaskResponse, TaskReorder, BulkTaskMove, BulkTaskDelete
from app.crud import (
    create_task, get_tasks_by_project, get_task,
    update_task, delete_task, reorder_task,
    bulk_move_tasks, bulk_delete_tasks, create_notification
)
from app.auth import get_tenant_db, get_current_user
from app.schemas import TokenData
from sqlalchemy.ext.asyncio import AsyncSession
from app.websocket_manager import manager

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])


def get_request_id(request: Request) -> str | None:
    return request.headers.get("X-Request-ID")


@router.post("", response_model=TaskResponse)
async def create(
    project_id: int,
    data: TaskCreate,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    task = await create_task(db, project_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Project not found")
    
    notification = await create_notification(
        db,
        type="task_created",
        title="新任务创建",
        message=f"任务 \"{task.title}\" 已创建",
        related_task_id=task.id,
        related_project_id=project_id,
    )
    await manager.broadcast_notification(token_data.schema_name, notification)
    
    await manager.broadcast_task_update(
        token_data.schema_name, project_id, task, action="create",
        request_id=get_request_id(request)
    )
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
async def update(
    project_id: int,
    task_id: int,
    data: TaskUpdate,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    task = await update_task(db, task_id, project_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    notification = await create_notification(
        db,
        type="task_updated",
        title="任务已更新",
        message=f"任务 \"{task.title}\" 已更新",
        related_task_id=task.id,
        related_project_id=project_id,
    )
    await manager.broadcast_notification(token_data.schema_name, notification)
    
    await manager.broadcast_task_update(
        token_data.schema_name, project_id, task, action="update",
        request_id=get_request_id(request)
    )
    return task


@router.put("/{task_id}/reorder", response_model=TaskResponse)
async def reorder(
    project_id: int,
    task_id: int,
    data: TaskReorder,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    task = await reorder_task(db, task_id, project_id, data.new_status, data.new_position)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    status_labels = {"todo": "待办", "in_progress": "进行中", "done": "已完成"}
    notification = await create_notification(
        db,
        type="task_moved",
        title="任务状态变更",
        message=f"任务 \"{task.title}\" 已移动到 {status_labels.get(task.status, task.status)}",
        related_task_id=task.id,
        related_project_id=project_id,
    )
    await manager.broadcast_notification(token_data.schema_name, notification)
    
    await manager.broadcast_task_update(
        token_data.schema_name, project_id, task, action="update",
        request_id=get_request_id(request)
    )
    return task


@router.delete("/{task_id}")
async def remove(
    project_id: int,
    task_id: int,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    task = await get_task(db, task_id)
    success = await delete_task(db, task_id, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task:
        notification = await create_notification(
            db,
            type="task_deleted",
            title="任务已删除",
            message=f"任务 \"{task.title}\" 已删除",
            related_project_id=project_id,
        )
        await manager.broadcast_notification(token_data.schema_name, notification)
    
    await manager.broadcast_task_delete(
        token_data.schema_name, project_id, task_id,
        request_id=get_request_id(request)
    )
    return {"detail": "Deleted"}


@router.post("/bulk/move", response_model=List[TaskResponse])
async def bulk_move(
    project_id: int,
    data: BulkTaskMove,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    try:
        updated_tasks = await bulk_move_tasks(db, project_id, data.task_ids, data.new_status)
        if updated_tasks:
            await manager.broadcast_bulk_update(
                token_data.schema_name, project_id, updated_tasks, action="bulk_update",
                request_id=get_request_id(request)
            )
        return updated_tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail="Bulk move failed")


@router.post("/bulk/delete")
async def bulk_delete(
    project_id: int,
    data: BulkTaskDelete,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    try:
        result = await bulk_delete_tasks(db, project_id, data.task_ids)
        if result["deleted_count"] > 0:
            await manager.broadcast_bulk_delete(
                token_data.schema_name, project_id, result["deleted_ids"],
                request_id=get_request_id(request)
            )
            if result["updated_tasks"]:
                await manager.broadcast_bulk_update(
                    token_data.schema_name, project_id, result["updated_tasks"], action="bulk_update",
                    request_id=get_request_id(request)
                )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail="Bulk delete failed")
