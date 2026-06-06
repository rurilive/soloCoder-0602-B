from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List
from app.schemas import CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse
from app.crud import (
    create_custom_field, get_custom_fields_by_project, get_custom_field,
    update_custom_field, delete_custom_field
)
from app.auth import get_tenant_db, get_current_user
from app.schemas import TokenData
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects/{project_id}/custom-fields", tags=["custom-fields"])


@router.post("", response_model=CustomFieldResponse)
async def create(
    project_id: int,
    data: CustomFieldCreate,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    field = await create_custom_field(db, project_id, data)
    if not field:
        raise HTTPException(status_code=404, detail="Project not found")
    return field


@router.get("", response_model=List[CustomFieldResponse])
async def list_all(
    project_id: int,
    db: AsyncSession = Depends(get_tenant_db),
):
    return await get_custom_fields_by_project(db, project_id)


@router.get("/{field_id}", response_model=CustomFieldResponse)
async def get(
    project_id: int,
    field_id: int,
    db: AsyncSession = Depends(get_tenant_db),
):
    field = await get_custom_field(db, field_id, project_id)
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return field


@router.put("/{field_id}", response_model=CustomFieldResponse)
async def update(
    project_id: int,
    field_id: int,
    data: CustomFieldUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    field = await update_custom_field(db, field_id, project_id, data)
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return field


@router.delete("/{field_id}")
async def remove(
    project_id: int,
    field_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    token_data: TokenData = Depends(get_current_user),
):
    success = await delete_custom_field(db, field_id, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return {"detail": "Deleted"}
