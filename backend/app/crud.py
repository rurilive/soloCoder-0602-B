from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import TenantProject, TenantTask
from app.schemas import ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate


async def create_project(db: AsyncSession, data: ProjectCreate) -> TenantProject:
    project = TenantProject(name=data.name, description=data.description or "")
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def get_projects(db: AsyncSession):
    result = await db.execute(select(TenantProject).order_by(TenantProject.created_at.desc()))
    return result.scalars().all()


async def get_project(db: AsyncSession, project_id: int) -> TenantProject | None:
    result = await db.execute(select(TenantProject).where(TenantProject.id == project_id))
    return result.scalar_one_or_none()


async def update_project(db: AsyncSession, project_id: int, data: ProjectUpdate) -> TenantProject | None:
    project = await get_project(db, project_id)
    if not project:
        return None
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: int) -> bool:
    project = await get_project(db, project_id)
    if not project:
        return False
    await db.delete(project)
    await db.commit()
    return True


async def create_task(db: AsyncSession, project_id: int, data: TaskCreate) -> TenantTask | None:
    project = await get_project(db, project_id)
    if not project:
        return None
    result = await db.execute(
        select(TenantTask)
        .where(TenantTask.project_id == project_id)
        .where(TenantTask.status == (data.status or "todo"))
        .order_by(TenantTask.position.desc())
    )
    last_task = result.scalar_one_or_none()
    next_pos = (last_task.position + 1) if last_task else 0
    task = TenantTask(
        project_id=project_id,
        title=data.title,
        description=data.description or "",
        status=data.status or "todo",
        position=next_pos,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_tasks_by_project(db: AsyncSession, project_id: int):
    result = await db.execute(
        select(TenantTask)
        .where(TenantTask.project_id == project_id)
        .order_by(TenantTask.status, TenantTask.position)
    )
    return result.scalars().all()


async def get_task(db: AsyncSession, task_id: int) -> TenantTask | None:
    result = await db.execute(select(TenantTask).where(TenantTask.id == task_id))
    return result.scalar_one_or_none()


async def update_task(db: AsyncSession, task_id: int, data: TaskUpdate) -> TenantTask | None:
    task = await get_task(db, task_id)
    if not task:
        return None
    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.status is not None:
        task.status = data.status
    if data.position is not None:
        task.position = data.position
    await db.commit()
    await db.refresh(task)
    return task


async def reorder_task(db: AsyncSession, task_id: int, new_status: str, new_position: int) -> TenantTask | None:
    task = await get_task(db, task_id)
    if not task:
        return None
    old_status = task.status
    old_position = task.position

    if old_status == new_status and old_position == new_position:
        return task

    if old_status == new_status:
        if new_position < old_position:
            await db.execute(
                update(TenantTask)
                .where(TenantTask.status == new_status)
                .where(TenantTask.position >= new_position)
                .where(TenantTask.position < old_position)
                .values(position=TenantTask.position + 1)
            )
        else:
            await db.execute(
                update(TenantTask)
                .where(TenantTask.status == new_status)
                .where(TenantTask.position > old_position)
                .where(TenantTask.position <= new_position)
                .values(position=TenantTask.position - 1)
            )
    else:
        await db.execute(
            update(TenantTask)
            .where(TenantTask.status == old_status)
            .where(TenantTask.position > old_position)
            .values(position=TenantTask.position - 1)
        )
        await db.execute(
            update(TenantTask)
            .where(TenantTask.status == new_status)
            .where(TenantTask.position >= new_position)
            .values(position=TenantTask.position + 1)
        )

    task.status = new_status
    task.position = new_position
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task_id: int) -> bool:
    task = await get_task(db, task_id)
    if not task:
        return False
    await db.execute(
        update(TenantTask)
        .where(TenantTask.status == task.status)
        .where(TenantTask.position > task.position)
        .values(position=TenantTask.position - 1)
    )
    await db.delete(task)
    await db.commit()
    return True
