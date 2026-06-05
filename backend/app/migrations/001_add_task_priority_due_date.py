"""
Migration 001: Add priority and due_date columns to tasks table
Run with: python -m app.migrations.001_add_task_priority_due_date
"""
import asyncio
from sqlalchemy import text, inspect
from app.config import SYNC_DATABASE_URL
from app.database import sync_engine, AsyncSessionLocal
from app.models import Company


def get_all_tenant_schemas():
    """Get all tenant schema names from public.companies table"""
    from sqlalchemy.orm import Session
    with Session(sync_engine) as session:
        result = session.execute(text("SELECT schema_name FROM public.companies"))
        return [row[0] for row in result.fetchall()]


def column_exists(schema_name: str, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    inspector = inspect(sync_engine)
    columns = inspector.get_columns(table_name, schema=schema_name)
    return any(col["name"] == column_name for col in columns)


def migrate_schema(schema_name: str):
    """Migrate a single tenant schema"""
    from sqlalchemy.orm import Session
    with Session(sync_engine) as session:
        session.execute(text(f"SET search_path TO {schema_name}, public"))

        has_priority = column_exists(schema_name, "tasks", "priority")
        has_due_date = column_exists(schema_name, "tasks", "due_date")

        if not has_priority:
            print(f"  Adding priority column to {schema_name}.tasks...")
            session.execute(text(
                f"ALTER TABLE {schema_name}.tasks ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'medium'"
            ))
        else:
            print(f"  priority column already exists in {schema_name}.tasks")

        if not has_due_date:
            print(f"  Adding due_date column to {schema_name}.tasks...")
            session.execute(text(
                f"ALTER TABLE {schema_name}.tasks ADD COLUMN due_date TIMESTAMPTZ"
            ))
        else:
            print(f"  due_date column already exists in {schema_name}.tasks")

        session.commit()
        print(f"  Schema {schema_name} migrated successfully")


def main():
    print("Starting migration 001: Add priority and due_date to tasks")
    print("=" * 60)

    schemas = get_all_tenant_schemas()
    print(f"Found {len(schemas)} tenant schemas: {schemas}")

    for schema in schemas:
        print(f"\nMigrating schema: {schema}")
        try:
            migrate_schema(schema)
        except Exception as e:
            print(f"  ERROR migrating {schema}: {e}")

    print("\n" + "=" * 60)
    print("Migration completed!")


if __name__ == "__main__":
    main()
