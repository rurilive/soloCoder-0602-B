# 多租户任务管理系统

基于 Schema 隔离的多租户看板任务管理系统，每个公司（租户）拥有独立的数据空间。

## 技术栈

- **后端**: Python 3.10+ / FastAPI / SQLAlchemy 2.0 (async) / PostgreSQL
- **前端**: React 18 / Vite / react-beautiful-dnd / React Router 6
- **数据库**: PostgreSQL 16 (通过 Schema 实现租户隔离)

## 架构说明

### 多租户隔离策略

采用 **Schema-per-Tenant** 方案：

- `public` Schema：存储 `companies` 表，用于公司注册和认证
- `tenant_<id>` Schema：每个公司注册时自动创建，包含 `projects` 和 `tasks` 表
- 请求时通过 JWT 中的 `schema_name` 设置 `search_path`，实现数据隔离

### 数据库模型

**公共表 (public schema)**：
- `companies` - 公司账号信息

**租户表 (tenant_* schema)**：
- `projects` - 项目
- `tasks` - 任务（含状态和排序位置）

## 快速开始

### 前置条件

- Python 3.10+
- Node.js 18+
- PostgreSQL 16
- Docker & Docker Compose（可选，用于运行 PostgreSQL）
- [uv](https://github.com/astral-sh/uv)（Python 包管理器）

### 1. 启动 PostgreSQL

```bash
docker compose up -d
```

或手动配置 PostgreSQL，并设置环境变量：

```bash
export DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/dbname"
export SYNC_DATABASE_URL="postgresql://user:pass@host:5432/dbname"
```

### 2. 启动后端（端口 2221）

```bash
cd backend
uv venv .venv
uv pip install -r pyproject.toml
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 2221 --reload
```

### 3. 启动前端（端口 2222）

```bash
cd frontend
npm install
npx vite --host 0.0.0.0 --port 2222
```

### 4. 一键启动

```bash
./start.sh
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册公司 |
| POST | `/api/auth/login` | 登录获取 Token |
| GET | `/api/auth/me` | 获取当前公司信息 |
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/{id}` | 获取项目详情 |
| PUT | `/api/projects/{id}` | 更新项目 |
| DELETE | `/api/projects/{id}` | 删除项目 |
| GET | `/api/projects/{id}/tasks` | 获取任务列表 |
| POST | `/api/projects/{id}/tasks` | 创建任务 |
| PUT | `/api/projects/{id}/tasks/{tid}` | 更新任务 |
| PUT | `/api/projects/{id}/tasks/{tid}/reorder` | 拖拽排序 |
| DELETE | `/api/projects/{id}/tasks/{tid}` | 删除任务 |

所有 `/api/projects` 及子路由需要在 Header 中携带 `Authorization: Bearer <token>`。

## 项目结构

```
.
├── backend/
│   ├── pyproject.toml          # uv 项目配置
│   ├── start.sh                # 后端启动脚本
│   └── app/
│       ├── main.py             # FastAPI 应用入口
│       ├── config.py           # 配置常量
│       ├── database.py         # 数据库连接
│       ├── models.py           # SQLAlchemy 模型
│       ├── schemas.py          # Pydantic 模式
│       ├── crud.py             # 数据库操作
│       ├── auth.py             # JWT 认证与租户中间件
│       └── routers/
│           ├── auth.py         # 认证路由
│           ├── projects.py     # 项目路由
│           └── tasks.py        # 任务路由
├── frontend/
│   ├── package.json            # npm 依赖
│   ├── vite.config.js          # Vite 配置（含代理）
│   ├── index.html              # HTML 入口
│   └── src/
│       ├── main.jsx            # React 入口
│       ├── App.jsx             # 路由与布局
│       ├── App.css             # 全局样式
│       ├── api.js              # Axios API 客户端
│       └── components/
│           ├── Login.jsx       # 登录页
│           ├── Register.jsx    # 注册页
│           ├── ProjectList.jsx # 项目列表
│           ├── KanbanBoard.jsx # 看板（拖拽）
│           └── TaskCard.jsx    # 任务卡片
├── docker-compose.yml          # PostgreSQL 容器
├── start.sh                    # 一键启动脚本
├── .gitignore
└── README.md
```

## 看板功能

- 三列看板：**待办** / **进行中** / **已完成**
- 拖拽任务卡片在列间移动，自动更新状态
- 列内拖拽调整任务顺序
- 乐观更新 UI，拖拽即时响应
