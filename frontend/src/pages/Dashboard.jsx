import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Spin, Select, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, WalletOutlined } from '@ant-design/icons';
import { Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import { ledgerApi, transactionApi, statisticsApi, accountApi, CURRENCY_SYMBOLS, CURRENCY_OPTIONS, formatCurrency } from '../services/api';

export default function Dashboard({ currentLedger }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [expenseStats, setExpenseStats] = useState([]);
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
    const now = dayjs();
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = { ledger_id: currentLedger.id, year: now.year(), month: now.month() + 1 };
        if (displayCurrency && displayCurrency !== baseCurrency) {
          params.target_currency = displayCurrency;
        }
        const [s, txs, cats, accs] = await Promise.all([
          statisticsApi.monthly(params),
          transactionApi.list({ ledger_id: currentLedger.id, year: now.year(), month: now.month() + 1 }),
          statisticsApi.categories({ ...params, type: 'expense' }),
          accountApi.list({ ledger_id: currentLedger.id }),
        ]);
        setSummary(s);
        setRecentTx(txs.slice(0, 5));
        setExpenseStats(cats);
        setAccounts(accs);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentLedger, displayCurrency]);

  if (loading) return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;

  const accountMap = {};
  accounts.forEach((a) => { accountMap[a.id] = a; });

  const pieConfig = {
    data: expenseStats.map((s) => ({ name: s.category_name, value: s.amount })),
    angleField: 'value',
    colorField: 'name',
    radius: 0.9,
    label: { type: 'outer', content: '{name} {percentage}' },
    interactions: [{ type: 'pie-legend-active' }, { type: 'element-active' }],
  };

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (t) => <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>,
    },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: (v, r) => {
        const acc = accountMap[r.account_id];
        const cur = acc?.currency || baseCurrency;
        return (
          <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322' }}>
            {r.type === 'income' ? '+' : '-'}{formatCurrency(v, cur)}
          </span>
        );
      },
    },
  ];

  const curSym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <span style={{ color: '#666' }}>显示币种:</span>
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
          <Card><Statistic title="本月收入" value={summary?.total_income || 0} prefix={<ArrowUpOutlined />} suffix={displayCurrency} valueStyle={{ color: '#3f8600' }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="本月支出" value={summary?.total_expense || 0} prefix={<ArrowDownOutlined />} suffix={displayCurrency} valueStyle={{ color: '#cf1322' }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="本月结余" value={summary?.balance || 0} prefix={<WalletOutlined />} suffix={displayCurrency} valueStyle={{ color: summary?.balance >= 0 ? '#3f8600' : '#cf1322' }} precision={2} /></Card>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="支出分类占比">
            {expenseStats.length > 0 ? <Pie {...pieConfig} /> : <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近记录">
            <Table columns={columns} dataSource={recentTx} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
