from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime, timezone


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
    token_version: int = Field(exclude=True, default=0)

    model_config = {
        "from_attributes": True
    }


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
    due_date: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def parse_due_date(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v
        if isinstance(v, str):
            if len(v) == 10:
                v = f"{v}T00:00:00Z"
            try:
                dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                raise ValueError(f"Invalid date format: {v}")
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(todo|in_progress|done)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    due_date: Optional[str] = None
    position: Optional[int] = None

    @field_validator("due_date")
    @classmethod
    def parse_due_date(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v
        if isinstance(v, str):
            if len(v) == 10:
                v = f"{v}T00:00:00Z"
            try:
                dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                raise ValueError(f"Invalid date format: {v}")
        return v


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
