"""
Migration 002: Add custom_fields and notifications tables, custom_field_values to tasks
Run with: python -m app.migrations.002_add_custom_fields_and_notifications
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


def table_exists(schema_name: str, table_name: str) -> bool:
    """Check if a table exists in a schema"""
    inspector = inspect(sync_engine)
    return table_name in inspector.get_table_names(schema=schema_name)


def column_exists(schema_name: str, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    inspector = inspect(sync_engine)
    if not table_exists(schema_name, table_name):
        return False
    columns = inspector.get_columns(table_name, schema=schema_name)
    return any(col["name"] == column_name for col in columns)


def migrate_schema(schema_name: str):
    """Migrate a single tenant schema"""
    from sqlalchemy.orm import Session
    with Session(sync_engine) as session:
        session.execute(text(f"SET search_path TO {schema_name}, public"))

        if not table_exists(schema_name, "custom_fields"):
            print(f"  Creating custom_fields table in {schema_name}...")
            session.execute(text(f"""
                CREATE TABLE {schema_name}.custom_fields (
                    id SERIAL PRIMARY KEY,
                    project_id INTEGER NOT NULL REFERENCES {schema_name}.projects(id) ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    field_type VARCHAR(20) NOT NULL,
                    required BOOLEAN NOT NULL DEFAULT FALSE,
                    options JSONB,
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))
            session.execute(text(f"""
                CREATE INDEX idx_custom_fields_project_id ON {schema_name}.custom_fields(project_id)
            """))
        else:
            print(f"  custom_fields table already exists in {schema_name}")

        if not table_exists(schema_name, "notifications"):
            print(f"  Creating notifications table in {schema_name}...")
            session.execute(text(f"""
                CREATE TABLE {schema_name}.notifications (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    message TEXT NOT NULL,
                    related_task_id INTEGER REFERENCES {schema_name}.tasks(id) ON DELETE CASCADE,
                    related_project_id INTEGER REFERENCES {schema_name}.projects(id) ON DELETE CASCADE,
                    read BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))
            session.execute(text(f"""
                CREATE INDEX idx_notifications_read ON {schema_name}.notifications(read)
            """))
            session.execute(text(f"""
                CREATE INDEX idx_notifications_created_at ON {schema_name}.notifications(created_at DESC)
            """))
        else:
            print(f"  notifications table already exists in {schema_name}")

        if not column_exists(schema_name, "tasks", "custom_field_values"):
            print(f"  Adding custom_field_values column to {schema_name}.tasks...")
            session.execute(text(f"""
                ALTER TABLE {schema_name}.tasks ADD COLUMN custom_field_values JSONB NOT NULL DEFAULT '{{}}'::jsonb
            """))
        else:
            print(f"  custom_field_values column already exists in {schema_name}.tasks")

        session.commit()
        print(f"  Schema {schema_name} migrated successfully")


def main():
    print("Starting migration 002: Add custom_fields and notifications tables")
    print("=" * 70)

    schemas = get_all_tenant_schemas()
    print(f"Found {len(schemas)} tenant schemas: {schemas}")

    for schema in schemas:
        print(f"\nMigrating schema: {schema}")
        try:
            migrate_schema(schema)
        except Exception as e:
            print(f"  ERROR migrating {schema}: {e}")

    print("\n" + "=" * 70)
    print("Migration completed!")


if __name__ == "__main__":
    main()
