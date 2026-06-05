import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://taskmanager:taskmanager123@localhost:5432/taskmanager")
SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL", "postgresql://taskmanager:taskmanager123@localhost:5432/taskmanager")
SECRET_KEY = os.getenv("SECRET_KEY", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
