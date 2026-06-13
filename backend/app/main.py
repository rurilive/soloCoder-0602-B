from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal, Base
from app.models import Ledger, Category, Transaction
from app.routers import ledgers, categories, transactions, statistics


def seed_db():
    db = SessionLocal()
    if db.query(Ledger).first():
        db.close()
        return

    personal = Ledger(name="个人账本", type="personal", description="日常个人收支")
    family = Ledger(name="家庭账本", type="family", description="家庭共同收支")
    db.add_all([personal, family])
    db.commit()
    db.refresh(personal)
    db.refresh(family)

    cats_personal = [
        Category(name="工资", type="income", icon="money-collect", ledger_id=personal.id),
        Category(name="兼职", type="income", icon="laptop", ledger_id=personal.id),
        Category(name="奖金", type="income", icon="gift", ledger_id=personal.id),
        Category(name="餐饮", type="expense", icon="coffee", ledger_id=personal.id),
        Category(name="交通", type="expense", icon="car", ledger_id=personal.id),
        Category(name="购物", type="expense", icon="shopping", ledger_id=personal.id),
        Category(name="娱乐", type="expense", icon="smile", ledger_id=personal.id),
        Category(name="居住", type="expense", icon="home", ledger_id=personal.id),
    ]
    cats_family = [
        Category(name="工资", type="income", icon="money-collect", ledger_id=family.id),
        Category(name="投资", type="income", icon="fund", ledger_id=family.id),
        Category(name="餐饮", type="expense", icon="coffee", ledger_id=family.id),
        Category(name="教育", type="expense", icon="read", ledger_id=family.id),
        Category(name="医疗", type="expense", icon="medicine-box", ledger_id=family.id),
        Category(name="居住", type="expense", icon="home", ledger_id=family.id),
    ]
    db.add_all(cats_personal + cats_family)
    db.commit()

    sample_txs = [
        Transaction(amount=15000, type="income", description="6月工资", category_id=1, ledger_id=personal.id, date="2026-06-01"),
        Transaction(amount=2000, type="income", description="自由职业收入", category_id=2, ledger_id=personal.id, date="2026-06-05"),
        Transaction(amount=800, type="expense", description="日常餐饮", category_id=4, ledger_id=personal.id, date="2026-06-02"),
        Transaction(amount=200, type="expense", description="地铁公交", category_id=5, ledger_id=personal.id, date="2026-06-03"),
        Transaction(amount=1500, type="expense", description="网购衣服", category_id=6, ledger_id=personal.id, date="2026-06-06"),
        Transaction(amount=300, type="expense", description="电影聚会", category_id=7, ledger_id=personal.id, date="2026-06-08"),
        Transaction(amount=3000, type="expense", description="房租", category_id=8, ledger_id=personal.id, date="2026-06-01"),
        Transaction(amount=25000, type="income", description="家庭工资", category_id=9, ledger_id=family.id, date="2026-06-01"),
        Transaction(amount=5000, type="income", description="理财收益", category_id=10, ledger_id=family.id, date="2026-06-10"),
        Transaction(amount=2000, type="expense", description="家庭餐饮", category_id=11, ledger_id=family.id, date="2026-06-02"),
        Transaction(amount=3000, type="expense", description="孩子补习", category_id=12, ledger_id=family.id, date="2026-06-05"),
        Transaction(amount=500, type="expense", description="体检", category_id=13, ledger_id=family.id, date="2026-06-07"),
    ]
    db.add_all(sample_txs)
    db.commit()
    db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_db()
    yield


app = FastAPI(title="BookKeeper API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ledgers.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(statistics.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
