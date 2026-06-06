from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
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
    last_task = result.scalars().first()
    next_pos = (last_task.position + 1) if last_task else 0
    task = TenantTask(
        project_id=project_id,
        title=data.title,
        description=data.description or "",
        status=data.status or "todo",
        priority=data.priority or "medium",
        due_date=data.due_date,
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


async def update_task(db: AsyncSession, task_id: int, project_id: int, data: TaskUpdate) -> TenantTask | None:
    result = await db.execute(
        select(TenantTask)
        .where(TenantTask.id == task_id)
        .where(TenantTask.project_id == project_id)
        .with_for_update()
    )
    task = result.scalar_one_or_none()
    if not task:
        return None
    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.status is not None:
        task.status = data.status
    if data.priority is not None:
        task.priority = data.priority
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.position is not None:
        task.position = data.position
    await db.commit()
    await db.refresh(task)
    return task


async def reorder_task(db: AsyncSession, task_id: int, project_id: int, new_status: str, new_position: int) -> TenantTask | None:
    task_result = await db.execute(
        select(TenantTask)
        .where(TenantTask.id == task_id)
        .where(TenantTask.project_id == project_id)
        .with_for_update()
    )
    moving_task = task_result.scalar_one_or_none()
    if not moving_task:
        return None

    old_status = moving_task.status
    old_position = moving_task.position

    await db.execute(
        select(TenantTask)
        .where(TenantTask.project_id == project_id)
        .where(TenantTask.status.in_([old_status, new_status]))
        .with_for_update()
    )

    if old_status == new_status and old_position == new_position:
        return moving_task

    if old_status == new_status:
        if new_position < old_position:
            await db.execute(
                update(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status == new_status)
                .where(TenantTask.position >= new_position)
                .where(TenantTask.position < old_position)
                .values(position=TenantTask.position + 1)
            )
        else:
            await db.execute(
                update(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status == new_status)
                .where(TenantTask.position > old_position)
                .where(TenantTask.position <= new_position)
                .values(position=TenantTask.position - 1)
            )
    else:
        await db.execute(
            update(TenantTask)
            .where(TenantTask.project_id == project_id)
            .where(TenantTask.status == old_status)
            .where(TenantTask.position > old_position)
            .values(position=TenantTask.position - 1)
        )
        await db.execute(
            update(TenantTask)
            .where(TenantTask.project_id == project_id)
            .where(TenantTask.status == new_status)
            .where(TenantTask.position >= new_position)
            .values(position=TenantTask.position + 1)
        )

    moving_task.status = new_status
    moving_task.position = new_position
    await db.commit()
    await db.refresh(moving_task)
    return moving_task


async def delete_task(db: AsyncSession, task_id: int, project_id: int) -> bool:
    try:
        result = await db.execute(
            select(TenantTask)
            .where(TenantTask.id == task_id)
            .where(TenantTask.project_id == project_id)
            .with_for_update()
        )
        locked_task = result.scalar_one_or_none()
        if not locked_task:
            return False

        task_status = locked_task.status
        task_position = locked_task.position

        await db.execute(
            select(TenantTask)
            .where(TenantTask.project_id == project_id)
            .where(TenantTask.status == task_status)
            .with_for_update()
        )

        await db.execute(
            update(TenantTask)
            .where(TenantTask.project_id == project_id)
            .where(TenantTask.status == task_status)
            .where(TenantTask.position > task_position)
            .values(position=TenantTask.position - 1)
        )
        await db.delete(locked_task)
        await db.commit()
        return True
    except SQLAlchemyError:
        await db.rollback()
        return False


async def bulk_move_tasks(
    db: AsyncSession,
    project_id: int,
    task_ids: list[int],
    new_status: str,
) -> list[TenantTask]:
    try:
        async with db.begin_nested():
            result = await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.id.in_(task_ids))
                .order_by(TenantTask.status, TenantTask.position)
                .with_for_update()
            )
            tasks_to_move = result.scalars().all()
            if not tasks_to_move:
                return []

            affected_statuses = set(task.status for task in tasks_to_move)
            affected_statuses.add(new_status)

            await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status.in_(list(affected_statuses)))
                .with_for_update()
            )

            source_updates = {}
            for task in tasks_to_move:
                old_status = task.status
                if old_status not in source_updates:
                    source_updates[old_status] = []
                source_updates[old_status].append(task)

            moved_ids = {task.id for task in tasks_to_move}
            for old_status in source_updates:
                remaining_result = await db.execute(
                    select(TenantTask)
                    .where(TenantTask.project_id == project_id)
                    .where(TenantTask.status == old_status)
                    .where(~TenantTask.id.in_(list(moved_ids)))
                    .order_by(TenantTask.position)
                )
                remaining = remaining_result.scalars().all()
                for idx, task in enumerate(remaining):
                    task.position = idx

            dest_result = await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status == new_status)
                .where(~TenantTask.id.in_(list(moved_ids)))
                .order_by(TenantTask.position)
            )
            dest_tasks = dest_result.scalars().all()

            for idx, task in enumerate(tasks_to_move):
                task.status = new_status
                task.position = len(dest_tasks) + idx

            all_updated = []
            for old_status in source_updates:
                remaining_result = await db.execute(
                    select(TenantTask)
                    .where(TenantTask.project_id == project_id)
                    .where(TenantTask.status == old_status)
                )
                all_updated.extend(remaining_result.scalars().all())

            dest_updated_result = await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status == new_status)
                .order_by(TenantTask.position)
            )
            all_updated.extend(dest_updated_result.scalars().all())

            await db.commit()
            return all_updated
    except SQLAlchemyError:
        await db.rollback()
        raise


async def bulk_delete_tasks(
    db: AsyncSession,
    project_id: int,
    task_ids: list[int],
) -> dict:
    try:
        async with db.begin_nested():
            result = await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.id.in_(task_ids))
                .with_for_update()
            )
            tasks_to_delete = result.scalars().all()
            if not tasks_to_delete:
                return {"deleted_count": 0, "updated_tasks": []}

            affected_statuses = set(task.status for task in tasks_to_delete)

            await db.execute(
                select(TenantTask)
                .where(TenantTask.project_id == project_id)
                .where(TenantTask.status.in_(list(affected_statuses)))
                .with_for_update()
            )

            deleted_ids = {task.id for task in tasks_to_delete}
            for task in tasks_to_delete:
                await db.delete(task)

            updated_tasks = []
            for status in affected_statuses:
                remaining_result = await db.execute(
                    select(TenantTask)
                    .where(TenantTask.project_id == project_id)
                    .where(TenantTask.status == status)
                    .where(~TenantTask.id.in_(list(deleted_ids)))
                    .order_by(TenantTask.position)
                )
                remaining = remaining_result.scalars().all()
                for idx, task in enumerate(remaining):
                    task.position = idx
                updated_tasks.extend(remaining)

            await db.commit()
            return {
                "deleted_count": len(tasks_to_delete),
                "deleted_ids": list(deleted_ids),
                "updated_tasks": updated_tasks,
            }
    except SQLAlchemyError:
        await db.rollback()
        raise
