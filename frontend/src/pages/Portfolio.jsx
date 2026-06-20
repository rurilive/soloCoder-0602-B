import { useState, useEffect, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  Space,
  Tag,
  Tooltip,
  message,
  Tabs,
  Divider,
  Descriptions,
  Popconfirm,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  StockOutlined,
  FundOutlined,
  DollarOutlined,
  GiftOutlined,
  SplitCellsOutlined,
  InfoCircleOutlined,
  UnorderedListOutlined,
  AccountBookOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { Area, Column } from '@ant-design/charts';
import dayjs from 'dayjs';
import {
  portfolioApi,
  accountApi,
  formatCurrency,
  CURRENCY_SYMBOLS,
} from '../services/api';

const { Text } = Typography;

const TX_TYPE_OPTIONS = [
  { value: 'buy', label: '买入', icon: <RiseOutlined style={{ color: '#52c41a' }} />, color: 'green' },
  { value: 'sell', label: '卖出', icon: <FallOutlined style={{ color: '#f5222d' }} />, color: 'red' },
  { value: 'dividend', label: '分红', icon: <GiftOutlined style={{ color: '#faad14' }} />, color: 'orange' },
  { value: 'split', label: '拆股', icon: <SplitCellsOutlined style={{ color: '#1890ff' }} />, color: 'blue' },
];

const SECURITY_TYPE_OPTIONS = [
  { value: 'stock', label: '股票' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: '基金' },
  { value: 'bond', label: '债券' },
  { value: 'crypto', label: '加密货币' },
  { value: 'other', label: '其他' },
];

const getTxTypeInfo = (type) => TX_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, color: 'default' };

function formatSignedAmount(value, currency = 'CNY') {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const sign = value > 0 ? '+' : '';
  return `${sign}${sym}${Number(value).toFixed(2)}`;
}

function formatPct(value) {
  const sign = value > 0 ? '+' : '';
  const color = value > 0 ? '#52c41a' : value < 0 ? '#f5222d' : '#999';
  return <span style={{ color }}>{sign}{Number(value).toFixed(2)}%</span>;
}

function formatGain(value, currency = 'CNY') {
  const color = value > 0 ? '#52c41a' : value < 0 ? '#f5222d' : '#999';
  return <span style={{ color, fontWeight: 500 }}>{formatSignedAmount(value, currency)}</span>;
}

export default function Portfolio({ currentLedger }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);
  const [securities, setSecurities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [secModalOpen, setSecModalOpen] = useState(false);
  const [txForm] = Form.useForm();
  const [secForm] = Form.useForm();
  const [txType, setTxType] = useState('buy');
  const [taxSummary, setTaxSummary] = useState(null);
  const [taxDetails, setTaxDetails] = useState(null);
  const [taxYear, setTaxYear] = useState(dayjs().year());
  const [taxLoading, setTaxLoading] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('holdings');

  const fetchAll = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const [sum, sec, acc] = await Promise.all([
        portfolioApi.getSummary(currentLedger.id),
        portfolioApi.listSecurities(currentLedger.id),
        accountApi.list({ ledger_id: currentLedger.id }),
      ]);
      setSummary(sum);
      setSecurities(sec);
      setAccounts(acc);
    } catch (e) {
      message.error(e.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!currentLedger) return;
    setHistoryLoading(true);
    try {
      const h = await portfolioApi.getHistory(currentLedger.id, 90);
      setHistory(h);
    } catch (e) {
      message.error(e.message || '加载历史数据失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchTaxData = async () => {
    if (!currentLedger) return;
    setTaxLoading(true);
    try {
      const [sum, det] = await Promise.all([
        portfolioApi.getTaxSummary(currentLedger.id, taxYear),
        portfolioApi.getTaxDetails(currentLedger.id, taxYear),
      ]);
      setTaxSummary(sum);
      setTaxDetails(det);
    } catch (e) {
      message.error(e.message || '加载税务数据失败');
    } finally {
      setTaxLoading(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === 'tax') {
      fetchTaxData();
    }
  }, [currentLedger, taxYear, activeMainTab]);

  useEffect(() => {
    fetchAll();
    fetchHistory();
  }, [currentLedger]);

  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment' || true),
    [accounts]
  );

  const handleCreateTx = async (values) => {
    try {
      const payload = {
        ...values,
        ledger_id: currentLedger.id,
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      };
      if (values.type !== 'split') {
        if (values.type !== 'dividend') {
          if (!values.quantity || values.quantity <= 0) {
            message.error('数量必须大于0');
            return;
          }
          if (!values.price || values.price <= 0) {
            message.error('价格必须大于0');
            return;
          }
        }
        if (values.type === 'dividend') {
          if (values.reinvest) {
            if (!values.quantity || values.quantity <= 0 || !values.price || values.price <= 0) {
              message.error('分红再投资需要填写数量和价格');
              return;
            }
          }
          if (!values.dividend_amount || values.dividend_amount <= 0) {
            message.error('分红金额必须大于0');
            return;
          }
        }
      } else {
        if (!values.split_ratio || values.split_ratio <= 0) {
          message.error('拆股比例必须大于0');
          return;
        }
      }
      await portfolioApi.createTransaction(payload);
      message.success('交易记录创建成功');
      setTxModalOpen(false);
      txForm.resetFields();
      setTxType('buy');
      fetchAll();
      fetchHistory();
    } catch (e) {
      message.error(e.message || '创建交易失败');
    }
  };

  const handleCreateSecurity = async (values) => {
    try {
      await portfolioApi.createSecurity({ ...values, ledger_id: currentLedger.id });
      message.success('证券创建成功');
      setSecModalOpen(false);
      secForm.resetFields();
      fetchAll();
    } catch (e) {
      message.error(e.message || '创建证券失败');
    }
  };

  const chartData = useMemo(() => {
    if (!history?.points?.length) return [];
    const result = [];
    for (const p of history.points) {
      const date = p.date;
      result.push({ date, type: '总市值', value: Number(p.total_value.toFixed(2)) });
      for (const [sym, val] of Object.entries(p.by_security)) {
        if (val > 0) {
          result.push({ date, type: sym, value: Number(val.toFixed(2)) });
        }
      }
    }
    return result;
  }, [history]);

  const chartConfig = {
    data: chartData,
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    isStack: true,
    smooth: true,
    color: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9845'],
    legend: { position: 'top', color: { maxWidth: 300, itemWidth: 80 } },
  };

  const holdingsColumns = [
    {
      title: '代码/名称',
      dataIndex: 'symbol',
      key: 'symbol',
      fixed: 'left',
      width: 180,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.symbol}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.name}</div>
          <Tag style={{ marginTop: 4 }} color="blue">
            {SECURITY_TYPE_OPTIONS.find((t) => t.value === r.type)?.label || r.type}
          </Tag>
        </div>
      ),
    },
    {
      title: '持仓数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right',
      render: (v) => <strong>{Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>,
    },
    {
      title: '成本价',
      dataIndex: 'avg_cost',
      key: 'avg_cost',
      width: 120,
      align: 'right',
      render: (v, r) => <span>{formatCurrency(v, r.currency)}</span>,
    },
    {
      title: '现价',
      dataIndex: 'current_price',
      key: 'current_price',
      width: 120,
      align: 'right',
      render: (v, r) => <span>{formatCurrency(v, r.currency)}</span>,
    },
    {
      title: '市值',
      dataIndex: 'market_value',
      key: 'market_value',
      width: 150,
      align: 'right',
      render: (v, r) => {
        const mv = r.converted_market_value ?? v;
        const cur = r.converted_market_value != null ? summary?.base_currency : r.currency;
        return <strong>{formatCurrency(mv, cur)}</strong>;
      },
    },
    {
      title: '总成本',
      dataIndex: 'cost_basis',
      key: 'cost_basis',
      width: 150,
      align: 'right',
      render: (v, r) => {
        const cb = r.converted_cost_basis ?? v;
        const cur = r.converted_cost_basis != null ? summary?.base_currency : r.currency;
        return <span>{formatCurrency(cb, cur)}</span>;
      },
    },
    {
      title: '未实现收益',
      dataIndex: 'unrealized_gain',
      key: 'unrealized_gain',
      width: 150,
      align: 'right',
      render: (v, r) => {
        const ug = r.converted_unrealized_gain ?? v;
        const cur = r.converted_unrealized_gain != null ? summary?.base_currency : r.currency;
        return (
          <div>
            <div>{formatGain(ug, cur)}</div>
            <div style={{ fontSize: 12 }}>{formatPct(r.unrealized_gain_pct)}</div>
          </div>
        );
      },
    },
    {
      title: '已实现收益',
      dataIndex: 'realized_gain',
      key: 'realized_gain',
      width: 130,
      align: 'right',
      render: (v, r) => formatGain(v, r.currency),
    },
    {
      title: '累计分红',
      dataIndex: 'dividends_received',
      key: 'dividends_received',
      width: 130,
      align: 'right',
      render: (v, r) => formatCurrency(v, r.currency),
    },
  ];

  const expandedRowRender = (record) => {
    const lotColumns = [
      { title: '批次ID', dataIndex: 'id', key: 'id', width: 80 },
      {
        title: '买入日期',
        dataIndex: 'buy_date',
        key: 'buy_date',
        width: 120,
      },
      {
        title: '原始数量',
        dataIndex: 'original_quantity',
        key: 'original_quantity',
        width: 120,
        align: 'right',
        render: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }),
      },
      {
        title: '剩余数量',
        dataIndex: 'quantity_remaining',
        key: 'quantity_remaining',
        width: 120,
        align: 'right',
        render: (v) => (
          <span style={{ color: v > 0 ? '#52c41a' : '#999', fontWeight: v > 0 ? 500 : 400 }}>
            {Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        ),
      },
      {
        title: '成本单价',
        dataIndex: 'cost_basis_per_share',
        key: 'cost_basis_per_share',
        width: 140,
        align: 'right',
        render: (v) => formatCurrency(v, record.currency),
      },
      {
        title: '剩余成本',
        key: 'remaining_cost',
        width: 150,
        align: 'right',
        render: (_, r) => formatCurrency(r.quantity_remaining * r.cost_basis_per_share, record.currency),
      },
      {
        title: '状态',
        dataIndex: 'is_closed',
        key: 'is_closed',
        width: 90,
        render: (v) => (
          <Tag color={v ? 'default' : 'green'}>{v ? '已平仓' : '持有中'}</Tag>
        ),
      },
    ];

    const txColumns = [
      { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
      {
        title: '类型',
        dataIndex: 'type',
        key: 'type',
        width: 90,
        render: (t) => {
          const info = getTxTypeInfo(t);
          return <Tag color={info.color}>{info.icon} {info.label}</Tag>;
        },
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 100,
        align: 'right',
        render: (v) => v > 0 ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-',
      },
      {
        title: '价格',
        dataIndex: 'price',
        key: 'price',
        width: 110,
        align: 'right',
        render: (v, r) => v > 0 ? formatCurrency(v, record.currency) : '-',
      },
      {
        title: '金额',
        dataIndex: 'amount',
        key: 'amount',
        width: 130,
        align: 'right',
        render: (v, r) => v !== 0 ? formatCurrency(v, record.currency) : (r.dividend_amount ? formatCurrency(r.dividend_amount, record.currency) : '-'),
      },
      {
        title: '手续费',
        dataIndex: 'fee',
        key: 'fee',
        width: 90,
        align: 'right',
        render: (v) => v > 0 ? formatCurrency(v, record.currency) : '-',
      },
      {
        title: '拆股比例',
        dataIndex: 'split_ratio',
        key: 'split_ratio',
        width: 90,
        align: 'right',
        render: (v) => v ? `1:${v}` : '-',
      },
      {
        title: '已实现收益',
        dataIndex: 'realized_gain',
        key: 'realized_gain',
        width: 120,
        align: 'right',
        render: (v) => v !== 0 ? formatGain(v, record.currency) : '-',
      },
      {
        title: '备注',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
    ];

    return (
      <div style={{ padding: '8px 24px', background: '#fafafa' }}>
        <Tabs
          items={[
            {
              key: 'lots',
              label: (
                <span>
                  <UnorderedListOutlined /> 持仓批次 ({record.lots.filter((l) => !l.is_closed).length}个持有中 / 共{record.lots.length})
                </span>
              ),
              children: (
                <Table
                  size="small"
                  columns={lotColumns}
                  dataSource={record.lots}
                  rowKey="id"
                  pagination={false}
                />
              ),
            },
            {
              key: 'txs',
              label: (
                <span>
                  <StockOutlined /> 交易历史 ({record.transactions.length})
                </span>
              ),
              children: (
                <Table
                  size="small"
                  columns={txColumns}
                  dataSource={record.transactions}
                  rowKey="id"
                  pagination={false}
                />
              ),
            },
          ]}
        />
      </div>
    );
  };

  const baseCur = summary?.base_currency || 'CNY';
  const summaryItems = [
    {
      title: '总持仓市值',
      value: summary?.total_market_value ?? 0,
      icon: <StockOutlined />,
      color: '#1890ff',
      prefix: CURRENCY_SYMBOLS[baseCur],
    },
    {
      title: '总成本',
      value: summary?.total_cost_basis ?? 0,
      icon: <FundOutlined />,
      color: '#722ed1',
      prefix: CURRENCY_SYMBOLS[baseCur],
    },
    {
      title: '总未实现收益',
      value: summary?.total_unrealized_gain ?? 0,
      icon: summary?.total_unrealized_gain >= 0 ? <RiseOutlined /> : <FallOutlined />,
      color: summary?.total_unrealized_gain >= 0 ? '#52c41a' : '#f5222d',
      prefix: summary?.total_unrealized_gain >= 0 ? `+${CURRENCY_SYMBOLS[baseCur]}` : `-${CURRENCY_SYMBOLS[baseCur]}`,
      valueStyle: { color: summary?.total_unrealized_gain >= 0 ? '#52c41a' : '#f5222d' },
      suffix: <span style={{ fontSize: 14, marginLeft: 8 }}>{formatPct(summary?.total_unrealized_gain_pct || 0)}</span>,
    },
    {
      title: '已实现收益 + 分红',
      value: (summary?.total_realized_gain || 0) + (summary?.total_dividends || 0),
      icon: <DollarOutlined />,
      color: '#fa8c16',
      prefix: ((summary?.total_realized_gain || 0) + (summary?.total_dividends || 0)) >= 0
        ? `+${CURRENCY_SYMBOLS[baseCur]}`
        : `-${CURRENCY_SYMBOLS[baseCur]}`,
      valueStyle: {
        color: ((summary?.total_realized_gain || 0) + (summary?.total_dividends || 0)) >= 0 ? '#52c41a' : '#f5222d'
      },
    },
  ];

  const monthlyTaxChartData = useMemo(() => {
    if (!taxSummary?.monthly_calendar) return [];
    const result = [];
    for (const m of taxSummary.monthly_calendar) {
      if (m.short_gain !== 0 || m.long_gain !== 0 || m.dividend_income !== 0 || m.total_tax !== 0) {
        result.push({ month: `${m.month}月`, type: '短期收益', value: m.short_gain });
        result.push({ month: `${m.month}月`, type: '长期收益', value: m.long_gain });
        result.push({ month: `${m.month}月`, type: '分红收入', value: m.dividend_income });
        result.push({ month: `${m.month}月`, type: '应纳税额', value: m.total_tax });
      }
    }
    return result;
  }, [taxSummary]);

  const monthlyTaxChartConfig = {
    data: monthlyTaxChartData,
    xField: 'month',
    yField: 'value',
    seriesField: 'type',
    isGroup: true,
    color: ['#f5222d', '#52c41a', '#faad14', '#1890ff'],
    legend: { position: 'top' },
  };

  const taxDetailColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '证券',
      key: 'security',
      width: 160,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.symbol}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.name}</div>
        </div>
      ),
    },
    {
      title: '卖出数量',
      dataIndex: 'sell_quantity',
      key: 'sell_quantity',
      width: 100,
      align: 'right',
      render: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    },
    {
      title: '收入',
      dataIndex: 'proceeds',
      key: 'proceeds',
      width: 120,
      align: 'right',
      render: (v) => formatCurrency(v, baseCur),
    },
    {
      title: '成本',
      dataIndex: 'total_cost',
      key: 'total_cost',
      width: 120,
      align: 'right',
      render: (v) => formatCurrency(v, baseCur),
    },
    {
      title: '已实现收益',
      dataIndex: 'realized_gain',
      key: 'realized_gain',
      width: 120,
      align: 'right',
      render: (v) => formatGain(v, baseCur),
    },
    {
      title: '短期收益',
      dataIndex: 'taxable_gain_short',
      key: 'taxable_gain_short',
      width: 120,
      align: 'right',
      render: (v) => (
        <span style={{ color: v > 0 ? '#f5222d' : '#999' }}>{formatCurrency(v, baseCur)}</span>
      ),
    },
    {
      title: '长期收益',
      dataIndex: 'taxable_gain_long',
      key: 'taxable_gain_long',
      width: 120,
      align: 'right',
      render: (v) => (
        <span style={{ color: v > 0 ? '#52c41a' : '#999' }}>{formatCurrency(v, baseCur)}</span>
      ),
    },
    {
      title: '资本利得税',
      dataIndex: 'tax_amount',
      key: 'tax_amount',
      width: 120,
      align: 'right',
      render: (v) => <span style={{ color: '#f5222d', fontWeight: 500 }}>{formatCurrency(v, baseCur)}</span>,
    },
    {
      title: '批次明细',
      key: 'lots',
      width: 80,
      render: (_, r) => (
        <Tooltip
          title={
            <div>
              {r.lots.map((l, i) => (
                <div key={i} style={{ marginBottom: 4, borderBottom: '1px solid #444', paddingBottom: 4 }}>
                  <div>买入日: {l.buy_date} → 卖出日: {l.sell_date}</div>
                  <div>持有{l.holding_days}天
                    <Tag color={l.gain_type === 'short' ? 'red' : 'green'} style={{ marginLeft: 4, fontSize: 11 }}>
                      {l.gain_type === 'short' ? '短期' : '长期'}
                    </Tag>
                  </div>
                  <div>数量: {Number(l.quantity_sold).toFixed(2)} | 成本: {formatCurrency(l.cost_sold, baseCur)} | 收入: {formatCurrency(l.proceeds_sold, baseCur)}</div>
                  <div>收益: {formatGain(l.gain, baseCur)}</div>
                </div>
              ))}
            </div>
          }
        >
          <Tag color="blue" style={{ cursor: 'pointer' }}>{r.lots.length}批</Tag>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxModalOpen(true)}>
          录入交易
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setSecModalOpen(true)}>
          添加证券
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchAll(); fetchHistory(); if (activeMainTab === 'tax') fetchTaxData(); }} loading={loading}>
          刷新
        </Button>
        <Tag color="purple">
          <InfoCircleOutlined /> 成本方法：{summary?.cost_method === 'fifo' ? 'FIFO 先进先出' : '加权平均'}
        </Tag>
        <Tag color="blue">
          基准币种：{baseCur}
        </Tag>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {summaryItems.map((item, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card>
              <Statistic
                title={
                  <span style={{ color: '#666', fontSize: 13 }}>
                    <span style={{ color: item.color, marginRight: 6 }}>{item.icon}</span>
                    {item.title}
                  </span>
                }
                value={Math.abs(item.value)}
                precision={2}
                prefix={item.prefix}
                valueStyle={{ ...item.valueStyle, fontSize: 22 }}
                suffix={item.suffix}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        activeKey={activeMainTab}
        onChange={setActiveMainTab}
        items={[
          {
            key: 'holdings',
            label: <span><StockOutlined /> 持仓明细</span>,
            children: (
              <Card style={{ marginBottom: 16 }}>
                <Table
                  loading={loading}
                  columns={holdingsColumns}
                  dataSource={summary?.holdings || []}
                  rowKey="security_id"
                  pagination={false}
                  scroll={{ x: 1400 }}
                  expandable={{
                    expandedRowRender,
                    expandedRowKeys: expandedKeys,
                    onExpandedRowsChange: setExpandedKeys,
                  }}
                  rowClassName={(r) => r.quantity <= 0 ? 'ant-table-row-disabled' : ''}
                />
              </Card>
            ),
          },
          {
            key: 'trend',
            label: <span><FundOutlined /> 市值趋势</span>,
            children: (
              <Card loading={historyLoading}>
                {chartData.length > 0 ? (
                  <div style={{ width: '100%', height: 360, position: 'relative' }}>
                    <Area {...chartConfig} style={{ width: '100%', height: '100%' }} />
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                    暂无历史数据
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'tax',
            label: <span><AccountBookOutlined /> 税务中心</span>,
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col>
                    <Space>
                      <CalendarOutlined />
                      <span style={{ fontWeight: 500 }}>年度：</span>
                      <Select
                        value={taxYear}
                        onChange={setTaxYear}
                        style={{ width: 100 }}
                        options={Array.from({ length: 5 }, (_, i) => {
                          const y = dayjs().year() - i;
                          return { value: y, label: `${y}年` };
                        })}
                      />
                    </Space>
                  </Col>
                </Row>

                {taxSummary && (
                  <>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      <Col xs={24} sm={12} lg={6}>
                        <Card>
                          <Statistic
                            title={<span style={{ color: '#666', fontSize: 13 }}><span style={{ color: '#f5222d', marginRight: 6 }}><RiseOutlined /></span>短期已实现收益</span>}
                            value={taxSummary.short_gain_total}
                            precision={2}
                            prefix={CURRENCY_SYMBOLS[baseCur]}
                            valueStyle={{ color: taxSummary.short_gain_total >= 0 ? '#f5222d' : '#52c41a', fontSize: 20 }}
                            suffix={<Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>税率20%</Tag>}
                          />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                            成本 {formatCurrency(taxSummary.short_cost_total, baseCur)} / 收入 {formatCurrency(taxSummary.short_proceeds_total, baseCur)}
                          </div>
                        </Card>
                      </Col>
                      <Col xs={24} sm={12} lg={6}>
                        <Card>
                          <Statistic
                            title={<span style={{ color: '#666', fontSize: 13 }}><span style={{ color: '#52c41a', marginRight: 6 }}><RiseOutlined /></span>长期已实现收益</span>}
                            value={taxSummary.long_gain_total}
                            precision={2}
                            prefix={CURRENCY_SYMBOLS[baseCur]}
                            valueStyle={{ color: taxSummary.long_gain_total >= 0 ? '#52c41a' : '#f5222d', fontSize: 20 }}
                            suffix={<Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>税率10%</Tag>}
                          />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                            成本 {formatCurrency(taxSummary.long_cost_total, baseCur)} / 收入 {formatCurrency(taxSummary.long_proceeds_total, baseCur)}
                          </div>
                        </Card>
                      </Col>
                      <Col xs={24} sm={12} lg={6}>
                        <Card>
                          <Statistic
                            title={<span style={{ color: '#666', fontSize: 13 }}><span style={{ color: '#faad14', marginRight: 6 }}><GiftOutlined /></span>分红税后收入</span>}
                            value={taxSummary.dividend_income_total - taxSummary.dividend_tax_total}
                            precision={2}
                            prefix={CURRENCY_SYMBOLS[baseCur]}
                            valueStyle={{ fontSize: 20 }}
                          />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                            税前 {formatCurrency(taxSummary.dividend_income_total, baseCur)} / 代扣税 <span style={{ color: '#f5222d' }}>{formatCurrency(taxSummary.dividend_tax_total, baseCur)}</span>
                          </div>
                        </Card>
                      </Col>
                      <Col xs={24} sm={12} lg={6}>
                        <Card>
                          <Statistic
                            title={<span style={{ color: '#666', fontSize: 13 }}><span style={{ color: '#1890ff', marginRight: 6 }}><DollarOutlined /></span>预估应纳税额合计</span>}
                            value={taxSummary.total_tax}
                            precision={2}
                            prefix={CURRENCY_SYMBOLS[baseCur]}
                            valueStyle={{ color: '#f5222d', fontSize: 20 }}
                          />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                            资本利得税 {formatCurrency(taxSummary.total_capital_tax, baseCur)} / 分红税 {formatCurrency(taxSummary.dividend_tax_total, baseCur)}
                            <Divider type="vertical" />
                            有效税率 <span style={{ fontWeight: 600, color: '#1890ff' }}>{taxSummary.effective_tax_rate}%</span>
                          </div>
                        </Card>
                      </Col>
                    </Row>

                    <Card
                      title={<span><AccountBookOutlined /> 已实现收益分类明细</span>}
                      style={{ marginBottom: 16 }}
                    >
                      <Table
                        loading={taxLoading}
                        columns={taxDetailColumns}
                        dataSource={taxDetails?.details || []}
                        rowKey="transaction_id"
                        pagination={false}
                        scroll={{ x: 1200 }}
                        size="small"
                      />
                    </Card>

                    <Card
                      title={<span><CalendarOutlined /> 月度税务日历 ({taxYear}年)</span>}
                    >
                      {monthlyTaxChartData.length > 0 ? (
                        <div style={{ width: '100%', height: 360, position: 'relative' }}>
                          <Column {...monthlyTaxChartConfig} style={{ width: '100%', height: '100%' }} />
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                          本年度暂无税务数据
                        </div>
                      )}
                    </Card>
                  </>
                )}

                {!taxSummary && !taxLoading && (
                  <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                    <AccountBookOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                    暂无税务数据，请选择年度查看
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={
          <Space>
            <PlusOutlined /> 录入投资交易
          </Space>
        }
        open={txModalOpen}
        onCancel={() => { setTxModalOpen(false); txForm.resetFields(); setTxType('buy'); }}
        footer={null}
        width={560}
      >
        <Form
          form={txForm}
          layout="vertical"
          onFinish={handleCreateTx}
          initialValues={{
            type: 'buy',
            date: dayjs(),
            fee: 0,
            reinvest: false,
          }}
        >
          <Form.Item
            label="交易类型"
            name="type"
            rules={[{ required: true, message: '请选择交易类型' }]}
          >
            <Select
              options={TX_TYPE_OPTIONS.map((t) => ({
                value: t.value,
                label: <span>{t.icon} {t.label}</span>,
              }))}
              onChange={(v) => setTxType(v)}
            />
          </Form.Item>

          <Form.Item
            label="证券"
            name="security_id"
            rules={[{ required: true, message: '请选择证券' }]}
          >
            <Select
              showSearch
              placeholder="搜索或选择证券"
              optionFilterProp="label"
              options={securities.map((s) => ({
                value: s.id,
                label: `${s.symbol} - ${s.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="账户"
            name="account_id"
            rules={[{ required: true, message: '请选择账户' }]}
          >
            <Select
              options={investmentAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.currency})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="日期"
            name="date"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          {txType !== 'split' && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="数量"
                    name="quantity"
                    rules={txType === 'dividend' ? [] : [{ required: true, message: '请输入数量' }]}
                    extra={txType === 'dividend' ? '分红再投资时必填' : ''}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} step={1} precision={4} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={txType === 'buy' ? '买入价' : txType === 'sell' ? '卖出价' : '再投资价格'}
                    name="price"
                    rules={txType === 'dividend' ? [] : [{ required: true, message: '请输入价格' }]}
                    extra={txType === 'dividend' ? '分红再投资时必填' : ''}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={4} />
                  </Form.Item>
                </Col>
              </Row>

              {txType !== 'dividend' && (
                <Form.Item
                  label="手续费"
                  name="fee"
                >
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
                </Form.Item>
              )}
            </>
          )}

          {txType === 'split' && (
            <Form.Item
              label={
                <Space>
                  拆股比例（每1股拆为N股）
                  <Tooltip title="例如：1拆2填 2.0；1拆3填 3.0；并股2合1填 0.5">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
              name="split_ratio"
              rules={[{ required: true, message: '请输入拆股比例' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={0.1} precision={4} placeholder="例如: 2.0 表示每1股拆为2股" />
            </Form.Item>
          )}

          {txType === 'dividend' && (
            <>
              <Form.Item
                label="分红金额"
                name="dividend_amount"
                rules={[{ required: true, message: '请输入分红金额' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
              </Form.Item>
              <Form.Item
                label={
                  <Space>
                    分红再投资
                    <Tooltip title="勾选后将同时生成一笔买入交易">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                name="reinvest"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </>
          )}

          <Form.Item label="备注" name="description">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setTxModalOpen(false); txForm.resetFields(); setTxType('buy'); }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认录入
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <PlusOutlined /> 添加证券
          </Space>
        }
        open={secModalOpen}
        onCancel={() => { setSecModalOpen(false); secForm.resetFields(); }}
        footer={null}
        width={480}
      >
        <Form
          form={secForm}
          layout="vertical"
          onFinish={handleCreateSecurity}
          initialValues={{ type: 'stock', currency: currentLedger?.base_currency || 'CNY', current_price: 0 }}
        >
          <Form.Item
            label="证券代码"
            name="symbol"
            rules={[{ required: true, message: '请输入证券代码' }]}
          >
            <Input placeholder="如: 600519, AAPL, 510300" />
          </Form.Item>
          <Form.Item
            label="证券名称"
            name="name"
            rules={[{ required: true, message: '请输入证券名称' }]}
          >
            <Input placeholder="如: 贵州茅台, 苹果公司" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select options={SECURITY_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="币种" name="currency" rules={[{ required: true }]}>
                <Select
                  options={Object.keys(CURRENCY_SYMBOLS).map((c) => ({
                    value: c,
                    label: `${c} ${CURRENCY_SYMBOLS[c]}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="当前价格"
            name="current_price"
            rules={[{ required: true, message: '请输入当前价格' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={4} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setSecModalOpen(false); secForm.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit">添加</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
