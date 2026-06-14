import { useState, useEffect } from 'react';
import { Card, Row, Col, DatePicker, Statistic, Spin, Select, Space, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import { statisticsApi, transactionApi, accountApi, CURRENCY_OPTIONS, formatCurrency } from '../services/api';

export default function MonthlyReport({ currentLedger }) {
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());
  const [summary, setSummary] = useState(null);
  const [expenseStats, setExpenseStats] = useState([]);
  const [incomeStats, setIncomeStats] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [displayCurrency, setDisplayCurrency] = useState(null);

  const baseCurrency = currentLedger?.base_currency || 'CNY';

  useEffect(() => {
    if (currentLedger) {
      setDisplayCurrency(currentLedger.base_currency || 'CNY');
    }
  }, [currentLedger]);

  useEffect(() => {
    if (!currentLedger) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const y = month.year();
        const m = month.month() + 1;
        const params = { ledger_id: currentLedger.id, year: y, month: m };
        if (displayCurrency && displayCurrency !== baseCurrency) {
          params.target_currency = displayCurrency;
        }
        const [s, eCats, iCats, txs, accs] = await Promise.all([
          statisticsApi.monthly(params),
          statisticsApi.categories({ ...params, type: 'expense' }),
          statisticsApi.categories({ ...params, type: 'income' }),
          transactionApi.list({ ledger_id: currentLedger.id, year: y, month: m }),
          accountApi.list({ ledger_id: currentLedger.id }),
        ]);
        setSummary(s);
        setExpenseStats(eCats);
        setIncomeStats(iCats);
        setAccounts(accs);

        const accountMap = {};
        accs.forEach((a) => { accountMap[a.id] = a; });

        const dailyMap = {};
        const daysInMonth = month.daysInMonth();
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${month.format('YYYY-MM')}-${String(d).padStart(2, '0')}`;
          dailyMap[key] = { date: `${d}日`, income: 0, expense: 0 };
        }
        txs.forEach((tx) => {
          if (dailyMap[tx.date]) {
            if (tx.type === 'income') dailyMap[tx.date].income += tx.amount;
            else dailyMap[tx.date].expense += tx.amount;
          }
        });
        setDailyData(Object.values(dailyMap));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentLedger, month, displayCurrency]);

  if (loading) return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;

  const columnConfig = {
    data: dailyData,
    xField: 'date',
    yField: 'value',
    colorField: 'type',
    group: true,
    legend: { color: { position: 'top' } },
  };

  const transformedColumnData = dailyData.flatMap((d) => [
    { date: d.date, value: d.income, type: '收入' },
    { date: d.date, value: d.expense, type: '支出' },
  ]);

  const expensePieConfig = {
    data: expenseStats.map((s) => ({ name: s.category_name, value: s.amount })),
    angleField: 'value',
    colorField: 'name',
    radius: 0.9,
    label: { type: 'outer', content: '{name} {percentage}' },
  };

  const incomePieConfig = {
    data: incomeStats.map((s) => ({ name: s.category_name, value: s.amount })),
    angleField: 'value',
    colorField: 'name',
    radius: 0.9,
    label: { type: 'outer', content: '{name} {percentage}' },
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <DatePicker picker="month" value={month} onChange={setMonth} allowClear={false} />
          <Select
            value={displayCurrency}
            onChange={setDisplayCurrency}
            style={{ width: 180 }}
            options={CURRENCY_OPTIONS}
          />
          {displayCurrency !== baseCurrency && (
            <Tag color="blue">已从{baseCurrency}折算</Tag>
          )}
        </Space>
      </div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card><Statistic title="总收入" value={summary?.total_income || 0} prefix={<ArrowUpOutlined />} suffix={displayCurrency} valueStyle={{ color: '#3f8600' }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="总支出" value={summary?.total_expense || 0} prefix={<ArrowDownOutlined />} suffix={displayCurrency} valueStyle={{ color: '#cf1322' }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="结余" value={summary?.balance || 0} suffix={displayCurrency} valueStyle={{ color: (summary?.balance || 0) >= 0 ? '#3f8600' : '#cf1322' }} precision={2} /></Card>
        </Col>
      </Row>
      <Card title="每日收支趋势" style={{ marginBottom: 24 }}>
        <Column {...columnConfig} data={transformedColumnData} />
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="支出分类占比">
            {expenseStats.length > 0 ? <Pie {...expensePieConfig} /> : <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="收入分类占比">
            {incomeStats.length > 0 ? <Pie {...incomePieConfig} /> : <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
