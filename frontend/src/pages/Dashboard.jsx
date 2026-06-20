import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Spin, Select, Space, Progress, List, Typography, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, RiseOutlined, BulbOutlined } from '@ant-design/icons';
import { Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import { ledgerApi, transactionApi, statisticsApi, accountApi, CURRENCY_SYMBOLS, CURRENCY_OPTIONS, formatCurrency, financialHealthApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;

export default function Dashboard({ currentLedger }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [expenseStats, setExpenseStats] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [displayCurrency, setDisplayCurrency] = useState(currentLedger?.base_currency || 'CNY');
  const [healthScore, setHealthScore] = useState(null);
  const [healthScoreExpanded, setHealthScoreExpanded] = useState(false);

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
        if (displayCurrency) {
          params.target_currency = displayCurrency;
        }
        const [s, txs, cats, accs, hs] = await Promise.all([
          statisticsApi.monthly(params),
          transactionApi.list({ ledger_id: currentLedger.id, year: now.year(), month: now.month() + 1 }),
          statisticsApi.categories({ ...params, type: 'expense' }),
          accountApi.list({ ledger_id: currentLedger.id }),
          financialHealthApi.getScore(currentLedger.id),
        ]);
        setSummary(s);
        setRecentTx(txs.slice(0, 5));
        setExpenseStats(cats);
        setAccounts(accs);
        setHealthScore(hs);
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

  const renderHealthCard = () => {
    if (!healthScore) return null;
    const { total_score, level, level_description, level_color, dimensions, overall_suggestions, months_analyzed } = healthScore;
    return (
      <Card
        style={{ marginBottom: 24, cursor: 'pointer', borderLeft: `4px solid ${level_color}` }}
        onClick={() => setHealthScoreExpanded(!healthScoreExpanded)}
        hoverable
      >
        <Row gutter={16} align="middle">
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ margin: 0, color: level_color }}>
                {total_score}
                <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>/ 100</Text>
              </Title>
              <Space direction="vertical" size={0} style={{ marginTop: 4 }}>
                <Tag color={level_color} style={{ fontSize: 14, padding: '2px 12px' }}>
                  <RiseOutlined /> {level}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  基于近{months_analyzed}个月数据分析
                </Text>
              </Space>
            </div>
          </Col>
          <Col span={16}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text style={{ fontSize: 15, fontWeight: 500 }}>{level_description}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {healthScoreExpanded ? '点击收起明细 ▲' : '点击查看各维度得分明细 ▼'}
              </Text>
              {!healthScoreExpanded && dimensions && dimensions.length > 0 && (
                <Row gutter={[8, 4]} style={{ marginTop: 8 }}>
                  {dimensions.slice(0, 5).map((d) => (
                    <Col span={12} key={d.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12, width: 80 }}>{d.name}</Text>
                        <Progress
                          percent={Math.round(d.score)}
                          size="small"
                          showInfo={false}
                          strokeColor={d.score >= 70 ? '#52c41a' : d.score >= 50 ? '#faad14' : '#f5222d'}
                          style={{ flex: 1 }}
                        />
                        <Text strong style={{ fontSize: 12, width: 36, textAlign: 'right' }}>
                          {d.score}
                        </Text>
                      </div>
                    </Col>
                  ))}
                </Row>
              )}
            </Space>
          </Col>
        </Row>
        {healthScoreExpanded && dimensions && (
          <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 20 }} onClick={(e) => e.stopPropagation()}>
            <Title level={5} style={{ marginBottom: 16 }}>
              各维度得分详情
            </Title>
            <Row gutter={[16, 16]}>
              {dimensions.map((d) => {
                const dimColor = d.score >= 70 ? '#52c41a' : d.score >= 50 ? '#faad14' : '#f5222d';
                return (
                  <Col span={12} key={d.key}>
                    <Card size="small" style={{ borderLeft: `3px solid ${dimColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Space>
                          <Text strong>{d.name}</Text>
                          <Tooltip title={`权重: ${(d.weight * 100).toFixed(0)}%`}>
                            <Tag style={{ margin: 0 }}>权重 {(d.weight * 100).toFixed(0)}%</Tag>
                          </Tooltip>
                        </Space>
                        <Text strong style={{ color: dimColor, fontSize: 16 }}>
                          {d.score}
                        </Text>
                      </div>
                      <Progress
                        percent={Math.round(d.score)}
                        showInfo={false}
                        strokeColor={dimColor}
                        style={{ marginBottom: 8 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                        {d.description}
                      </Text>
                      {d.suggestions && d.suggestions.length > 0 && (
                        <List
                          size="small"
                          dataSource={d.suggestions}
                          renderItem={(item) => (
                            <List.Item style={{ padding: '2px 0', border: 'none', fontSize: 12 }}>
                              <BulbOutlined style={{ color: '#faad14', marginRight: 6 }} />
                              <span>{item}</span>
                            </List.Item>
                          )}
                        />
                      )}
                    </Card>
                  </Col>
                );
              })}
            </Row>
            {overall_suggestions && overall_suggestions.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <Title level={5} style={{ marginBottom: 12 }}>
                  <BulbOutlined style={{ color: '#faad14' }} /> 综合改善建议
                </Title>
                <List
                  size="small"
                  dataSource={overall_suggestions}
                  renderItem={(item, idx) => (
                    <List.Item style={{ padding: '4px 0', border: 'none' }}>
                      <Space align="start">
                        <Tag color="blue" style={{ margin: 0 }}>{idx + 1}</Tag>
                        <Text>{item}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

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

      {renderHealthCard()}

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
