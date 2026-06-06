from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, event
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    schema_name = Column(String(100), unique=True, nullable=False)
    token_version = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TenantProject(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TenantTask(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="todo", nullable=False)
    priority = Column(String(20), default="medium", nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("TenantProject", backref="tasks")


TENANT_TABLES = [TenantProject, TenantTask]
