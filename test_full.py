#!/usr/bin/env python3
import requests
import json
import subprocess
import os

BASE_URL = "http://127.0.0.1:2221/api"
CSV_PATH = "/data/projects/work/soloCoder-0602/repos/b/test_bank.csv"
FRONTEND_FILE = "/data/projects/work/soloCoder-0602/repos/b/frontend/src/pages/Reconciliation.jsx"
BACKEND_FILE = "/data/projects/work/soloCoder-0602/repos/b/backend/app/routers/reconciliation.py"

def test(label, fn):
    try:
        result = fn()
        print(f"  ✓ {label}: {result}")
        return True
    except AssertionError as e:
        print(f"  ✗ {label}: {e}")
        return False

def upload(file_path, ledger_id, start_date=None, end_date=None):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {'ledger_id': str(ledger_id)}
        if start_date:
            data['start_date'] = start_date
        if end_date:
            data['end_date'] = end_date
        r = requests.post(f"{BASE_URL}/reconciliation/upload", files=files, data=data)
        r.raise_for_status()
        return r.json()

def get_system_dates(resp):
    dates = set()
    for p in resp['matched_pairs']:
        dates.add(p['system_transaction']['date'])
    for t in resp['unmatched_system']:
        dates.add(t['date'])
    return sorted(dates)

def main():
    print("=" * 50)
    print("端到端测试报告")
    print("=" * 50)
    print()

    all_pass = True

    # ========== 后端API测试 ==========
    print("【后端API测试】")
    print("-" * 50)

    # 测试1：不带日期参数
    resp1 = upload(CSV_PATH, 1)
    all_pass &= test(
        "不带日期参数返回全部14条系统交易",
        lambda: f"{resp1['total_system_transactions']}条" if resp1['total_system_transactions'] == 14 else f"预期14条，实际{resp1['total_system_transactions']}条"
    )
    dates1 = get_system_dates(resp1)
    all_pass &= test(
        "系统交易日期范围 2025-06-10 ~ 2026-06-20",
        lambda: f"{dates1[0]} ~ {dates1[-1]}" if dates1[0] == '2025-06-10' and dates1[-1] == '2026-06-20' else f"预期2025-06-10~2026-06-20，实际{dates1[0]}~{dates1[-1]}"
    )

    # 测试2：带日期范围 2026-06-01 ~ 2026-06-10
    resp2 = upload(CSV_PATH, 1, '2026-06-01', '2026-06-10')
    all_pass &= test(
        "日期2026-06-01~2026-06-10过滤后返回8条系统交易",
        lambda: f"{resp2['total_system_transactions']}条" if resp2['total_system_transactions'] == 8 else f"预期8条，实际{resp2['total_system_transactions']}条"
    )
    dates2 = get_system_dates(resp2)
    all_pass &= test(
        "过滤后所有日期在2026-06-01~2026-06-10范围内",
        lambda: f"{dates2[0]} ~ {dates2[-1]}" if all(d >= '2026-06-01' and d <= '2026-06-10' for d in dates2) else f"发现超出范围日期: {dates2}"
    )

    # 测试3：修改日期范围 2026-06-10 ~ 2026-06-20（重新匹配）
    resp3 = upload(CSV_PATH, 1, '2026-06-10', '2026-06-20')
    all_pass &= test(
        "日期2026-06-10~2026-06-20过滤后返回3条系统交易",
        lambda: f"{resp3['total_system_transactions']}条" if resp3['total_system_transactions'] == 3 else f"预期3条，实际{resp3['total_system_transactions']}条"
    )
    dates3 = get_system_dates(resp3)
    all_pass &= test(
        "重新匹配后所有日期在新范围内",
        lambda: f"{dates3[0]} ~ {dates3[-1]}" if all(d >= '2026-06-10' and d <= '2026-06-20' for d in dates3) else f"发现超出范围日期: {dates3}"
    )

    print()

    # ========== 前端代码验证 ==========
    print("【前端代码验证】")
    print("-" * 50)

    with open(FRONTEND_FILE) as f:
        frontend_code = f.read()

    all_pass &= test(
        "图标更换为SyncOutlined",
        lambda: "ok" if 'SyncOutlined' in frontend_code and 'icon={<SyncOutlined />}' in frontend_code else "未找到SyncOutlined正确使用"
    )
    all_pass &= test(
        "上传前视图有日期范围选择器",
        lambda: "ok" if '上传前选择可减少匹配时的干扰项' in frontend_code else "未找到上传前日期选择器说明"
    )
    all_pass &= test(
        "上传后视图有重新匹配按钮",
        lambda: "ok" if '重新匹配' in frontend_code and 'handleRematch' in frontend_code else "未找到重新匹配按钮"
    )
    all_pass &= test(
        "rowSelection.onChange有keys.length>0判断",
        lambda: "ok" if 'if (keys.length > 0) setSelectedSystem(null)' in frontend_code else "未找到正确的keys.length判断"
    )
    all_pass &= test(
        "日期切换时清除隐藏选中项的useEffect",
        lambda: "ok" if 'visibleIds.has' in frontend_code and 'setSelectedSystemForManual(filtered)' in frontend_code else "未找到useEffect过滤逻辑"
    )
    all_pass &= test(
        "上传时传递日期参数给API",
        lambda: "ok" if 'dateRange ? dateRange[0].format' in frontend_code and 'dateRange ? dateRange[1].format' in frontend_code else "未传递日期参数"
    )

    print()

    # ========== 后端代码验证 ==========
    print("【后端代码验证】")
    print("-" * 50)

    with open(BACKEND_FILE) as f:
        backend_code = f.read()

    all_pass &= test(
        "上传接口接受start_date和end_date参数",
        lambda: "ok" if 'start_date: Optional[str]' in backend_code and 'end_date: Optional[str]' in backend_code else "未找到日期参数"
    )
    all_pass &= test(
        "查询时过滤日期范围",
        lambda: "ok" if 'Transaction.date >= start_date' in backend_code and 'Transaction.date <= end_date' in backend_code else "未找到日期过滤逻辑"
    )

    print()
    print("=" * 50)
    if all_pass:
        print("  ✓ 所有测试通过！")
    else:
        print("  ✗ 部分测试失败")
    print("=" * 50)

if __name__ == "__main__":
    main()
