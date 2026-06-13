# 💰 个人记账应用 (BookKeeper)

一个功能完整的个人记账应用，支持多账本管理、收支记录、分类管理和月度统计报表。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python + FastAPI | 高性能异步REST API框架 |
| 数据库 | SQLite + SQLAlchemy | 零配置轻量级数据库 |
| 前端 | React + Vite + Ant Design | 现代化UI组件库 |
| 图表 | @ant-design/charts | 收支趋势图与分类饼图 |
| 包管理 | uv (Python) / npm (JS) | 快速依赖管理 |

## 项目结构

```
b/
├── backend/                    # 后端服务
│   ├── pyproject.toml          # Python依赖配置
│   ├── app/
│   │   ├── main.py             # FastAPI入口与生命周期
│   │   ├── database.py         # 数据库连接配置
│   │   ├── models.py           # SQLAlchemy数据模型
│   │   ├── schemas.py          # Pydantic请求/响应模型
│   │   └── routers/
│   │       ├── ledgers.py      # 账本CRUD接口
│   │       ├── categories.py   # 分类CRUD接口
│   │       ├── transactions.py # 收支记录CRUD接口
│   │       └── statistics.py   # 统计分析接口
│   └── data/                   # SQLite数据库文件目录
├── frontend/                   # 前端应用
│   ├── package.json
│   ├── vite.config.js          # Vite配置(端口2222 + API代理)
│   └── src/
│       ├── App.jsx             # 主布局与路由
│       ├── services/api.js     # API调用封装
│       └── pages/
│           ├── Dashboard.jsx   # 仪表盘(收支概览+饼图)
│           ├── Transactions.jsx# 收支记录管理
│           ├── Categories.jsx  # 分类管理
│           ├── MonthlyReport.jsx# 月度报表(趋势图+分类统计)
│           └── Ledgers.jsx     # 账本管理
├── start.sh                    # 一键启动脚本
├── stop.sh                     # 一键停止脚本
└── .gitignore
```

## 快速开始

### 前置条件

- Python >= 3.11
- Node.js >= 18
- [uv](https://docs.astral.sh/uv/) (Python包管理器)

### 安装与启动

**一键启动：**

```bash
./start.sh
```

**手动启动：**

```bash
# 1. 安装后端依赖
cd backend
uv sync

# 2. 启动后端 (端口2221)
uv run uvicorn app.main:app --host 0.0.0.0 --port 2221

# 3. 安装前端依赖
cd ../frontend
npm install

# 4. 启动前端 (端口2222)
npx vite --host 0.0.0.0 --port 2222
```

**停止服务：**

```bash
./stop.sh
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:2222 |
| 后端API | http://localhost:2221 |
| API文档 | http://localhost:2221/docs |

## 功能说明

### 多账本管理
- 创建个人、家庭、旅行等不同类型的账本
- 一键切换当前活跃账本
- 所有数据按账本隔离

### 收支记录
- 按月筛选记录
- 支持收入/支出两种类型
- 关联分类，记录描述和日期
- 新增、编辑、删除操作

### 分类管理
- 按账本独立管理分类
- 区分收入分类和支出分类
- 支持自定义图标标识

### 仪表盘
- 当月收支概览（总收入、总支出、结余）
- 支出分类占比饼图
- 最近交易记录列表

### 月度报表
- 每日收支趋势柱状图
- 收入/支出分类占比饼图
- 可切换月份查看历史数据

## API接口

### 账本 `/api/ledgers/`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ledgers/` | 获取账本列表 |
| GET | `/api/ledgers/{id}` | 获取单个账本 |
| POST | `/api/ledgers/` | 创建账本 |
| PUT | `/api/ledgers/{id}` | 更新账本 |
| DELETE | `/api/ledgers/{id}` | 删除账本 |

### 分类 `/api/categories/`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories/?ledger_id=&type=` | 获取分类列表(支持筛选) |
| POST | `/api/categories/` | 创建分类 |
| PUT | `/api/categories/{id}` | 更新分类 |
| DELETE | `/api/categories/{id}` | 删除分类 |

### 收支记录 `/api/transactions/`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/transactions/?ledger_id=&month=&type=` | 获取记录列表(支持筛选) |
| POST | `/api/transactions/` | 创建记录 |
| PUT | `/api/transactions/{id}` | 更新记录 |
| DELETE | `/api/transactions/{id}` | 删除记录 |

### 统计 `/api/statistics/`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/statistics/monthly?ledger_id=&year=&month=` | 月度收支汇总 |
| GET | `/api/statistics/categories?ledger_id=&year=&month=&type=` | 分类统计 |

## 数据库

使用 SQLite，数据库文件存储在 `backend/data/bookkeeper.db`。

首次启动时自动初始化并创建示例数据：
- 2个示例账本（个人账本、家庭账本）
- 14个预设分类（工资、兼职、餐饮、交通等）
- 12条示例交易记录

## 开发说明

- 前端开发时，Vite会自动将`/api`请求代理到后端`2221`端口
- 后端启用CORS，支持跨域开发
- 修改后端代码后需重启服务，前端支持HMR热更新
