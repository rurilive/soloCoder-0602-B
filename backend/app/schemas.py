from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


VALID_STATUSES = ("todo", "in_progress", "done")
VALID_PRIORITIES = ("low", "medium", "high")


class CompanyRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=6)


class CompanyLogin(BaseModel):
    email: EmailStr
    password: str


class CompanyResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    company_id: int
    schema_name: str
    token_version: int


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: Optional[str] = Field("todo", pattern="^(todo|in_progress|done)$")
    priority: Optional[str] = Field("medium", pattern="^(low|medium|high)$")
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(todo|in_progress|done)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    due_date: Optional[datetime] = None
    position: Optional[int] = None


class TaskResponse(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    status: str
    priority: str
    due_date: Optional[datetime]
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskReorder(BaseModel):
    task_id: int
    new_status: str = Field(..., pattern="^(todo|in_progress|done)$")
    new_position: int


class BulkTaskMove(BaseModel):
    task_ids: list[int]
    new_status: str = Field(..., pattern="^(todo|in_progress|done)$")


class BulkTaskDelete(BaseModel):
    task_ids: list[int]
