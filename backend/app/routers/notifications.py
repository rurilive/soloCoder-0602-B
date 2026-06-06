from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from app.schemas import NotificationResponse, NotificationMarkRead
from app.crud import (
    get_notifications, get_notification, mark_notification_read,
    mark_all_notifications_read, get_unread_notification_count
)
from app.auth import get_tenant_db, get_current_user
from app.schemas import TokenData
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    return await get_notifications(db, limit=limit, unread_only=unread_only)


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    count = await get_unread_notification_count(db)
    return {"unread_count": count}


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get(
    notification_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    notification = await get_notification(db, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: int,
    data: NotificationMarkRead,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    notification = await mark_notification_read(db, notification_id, read=data.read)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.put("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    count = await mark_all_notifications_read(db)
    return {"marked_count": count}
