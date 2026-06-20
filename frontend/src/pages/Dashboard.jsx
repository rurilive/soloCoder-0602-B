import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Spin, Select, Space, Progress, List, Typography, Tooltip, Alert } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, RiseOutlined, BulbOutlined, WarningOutlined, InfoCircleOutlined, LineChartOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Pie, Line } from '@ant-design/charts';
import dayjs from 'dayjs';
import { transactionApi, statisticsApi, accountApi, CURRENCY_OPTIONS, formatCurrency, financialHealthApi, predictionApi, anomalyApi } from '../services/api';

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
  const [predictionData, setPredictionData] = useState(null);
  const [predictionExpanded, setPredictionExpanded] = useState(true);
  const [anomalyData, setAnomalyData] = useState(null);
  const [anomalyExpanded, setAnomalyExpanded] = useState(true);

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
        const [s, txs, cats, accs, hs, pred, anom] = await Promise.all([
          statisticsApi.monthly(params),
          transactionApi.list({ ledger_id: currentLedger.id, year: now.year(), month: now.month() + 1 }),
          statisticsApi.categories({ ...params, type: 'expense' }),
          accountApi.list({ ledger_id: currentLedger.id }),
          financialHealthApi.getScore(currentLedger.id),
          predictionApi.getCashFlow({
            ledger_id: currentLedger.id,
            historical_months: 6,
            predicted_months: 6,
            target_currency: displayCurrency || currentLedger.base_currency,
          }),
          anomalyApi.detect(currentLedger.id),
        ]);
        setSummary(s);
        setRecentTx(txs.slice(0, 5));
        setExpenseStats(cats);
        setAccounts(accs);
        setHealthScore(hs);
        setPredictionData(pred);
        setAnomalyData(anom);
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

  const renderCashFlowPrediction = () => {
    if (!predictionData) return null;

    const { combined_data, warning, model_description, base_currency } = predictionData;

    const chartData = [];
    combined_data.forEach((point) => {
      const base = {
        month: point.label,
        year: point.year,
        month_num: point.month,
        is_actual: point.is_actual,
        net_cash_flow: point.net_cash_flow,
        is_negative: point.net_cash_flow < 0,
      };
      chartData.push({ ...base, type: '收入', value: point.income, series_type: point.is_actual ? '实际' : '预测' });
      chartData.push({ ...base, type: '支出', value: point.expense, series_type: point.is_actual ? '实际' : '预测' });
      chartData.push({ ...base, type: '净现金流', value: point.net_cash_flow, series_type: point.is_actual ? '实际' : '预测' });
    });

    const lineConfig = {
      data: chartData,
      xField: 'month',
      yField: 'value',
      seriesField: 'type',
      isGroup: true,
      color: ['#52c41a', '#f5222d', '#1890ff'],
      lineStyle: (d) => {
        if (d.series_type === '预测') {
          return { lineDash: [4, 4] };
        }
        return {};
      },
      point: {
        size: 4,
        shape: (d) => {
          return d.series_type === '预测' ? 'circle' : 'diamond';
        },
        style: (d) => {
          if (d.type === '净现金流' && d.value < 0 && !d.is_actual) {
            return { fill: '#f5222d', stroke: '#f5222d', lineWidth: 2, r: 6 };
          }
          return {};
        },
      },
      tooltip: {
        showCrosshairs: true,
        shared: true,
        customContent: (title, items) => {
          if (!items || items.length === 0) return '';
          const firstItem = items[0]?.data;
          const monthData = combined_data.find(p => p.label === title);

          let content = `<div style="padding: 8px 12px;">`;
          content += `<div style="font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; padding-bottom: 4px;">${title} ${firstItem?.is_actual ? '(实际)' : '(预测)'}</div>`;

          items.forEach(item => {
            const color = item.color;
            const value = Number(item.value);
            const displayValue = formatCurrency(Math.abs(value), base_currency);
            const sign = value >= 0 ? '+' : '-';
            content += `<div style="display: flex; justify-content: space-between; gap: 24px; margin: 4px 0;">`;
            content += `<span style="display: flex; align-items: center; gap: 6px;">`;
            content += `<span style="display: inline-block; width: 8px; height: 8px; background: ${color}; border-radius: 50%;"></span>`;
            content += `${item.name} ${item.data?.series_type === '预测' ? '(预测)' : ''}`;
            content += `</span>`;
            content += `<span style="font-weight: 600; color: ${value >= 0 ? (item.name === '支出' ? '#f5222d' : '#52c41a') : '#f5222d'}">${sign}${displayValue}</span>`;
            content += `</div>`;
          });

          if (monthData && !monthData.is_actual && monthData.confidence_level !== undefined) {
            content += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #f0f0f0;">`;
            content += `<div style="font-size: 12px; color: #888; margin-bottom: 4px;">置信度: ${(monthData.confidence_level * 100).toFixed(0)}%</div>`;
            content += `<div style="font-size: 12px; color: #888;">净现金流区间: ${formatCurrency(monthData.net_lower, base_currency)} ~ ${formatCurrency(monthData.net_upper, base_currency)}</div>`;
            if (monthData.income_lower !== null) {
              content += `<div style="font-size: 12px; color: #888;">收入区间: ${formatCurrency(monthData.income_lower, base_currency)} ~ ${formatCurrency(monthData.income_upper, base_currency)}</div>`;
            }
            if (monthData.expense_lower !== null) {
              content += `<div style="font-size: 12px; color: #888;">支出区间: ${formatCurrency(monthData.expense_lower, base_currency)} ~ ${formatCurrency(monthData.expense_upper, base_currency)}</div>`;
            }
            content += `</div>`;
          }

          content += `</div>`;
          return content;
        },
      },
      axis: {
        x: { label: { autoRotate: true, autoHide: true } },
        y: {
          label: {
            formatter: (v) => formatCurrency(v, base_currency),
          },
        },
      },
      legend: {
        position: 'top',
      },
    };

    return (
      <Card
        style={{ marginBottom: 24, cursor: 'pointer', borderLeft: `4px solid ${warning?.has_warning ? '#f5222d' : '#1890ff'}` }}
        onClick={() => setPredictionExpanded(!predictionExpanded)}
        hoverable
      >
        <Row gutter={16} align="middle">
          <Col span={24}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <LineChartOutlined style={{ fontSize: 20, color: warning?.has_warning ? '#f5222d' : '#1890ff' }} />
                <Title level={4} style={{ margin: 0 }}>
                  现金流预测
                </Title>
                {warning?.has_warning && (
                  <Tag color="red" style={{ marginLeft: 8 }}>
                    <WarningOutlined /> 存在风险
                  </Tag>
                )}
                <Tag color="blue">
                  历史{predictionData.historical_months}个月 + 预测{predictionData.predicted_months}个月
                </Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {predictionExpanded ? '点击收起 ▲' : '点击展开查看详情 ▼'}
              </Text>
            </div>
          </Col>
        </Row>

        {predictionExpanded && (
          <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 20 }} onClick={(e) => e.stopPropagation()}>
            {warning?.has_warning && (
              <Alert
                message={`现金流风险预警：预测${warning.consecutive_negative_months}个月连续负现金流`}
                description={
                  <div>
                    <Paragraph style={{ marginBottom: 8 }}>
                      <WarningOutlined style={{ color: '#f5222d', marginRight: 8 }} />
                      从 <strong>{warning.first_negative_month}</strong> 到 <strong>{warning.last_negative_month}</strong> 预测将持续出现负现金流。
                    </Paragraph>
                    <List
                      size="small"
                      dataSource={warning.suggestions}
                      renderItem={(item) => (
                        <List.Item style={{ padding: '2px 0', border: 'none' }}>
                          <BulbOutlined style={{ color: '#faad14', marginRight: 6 }} />
                          <span>{item}</span>
                        </List.Item>
                      )}
                    />
                  </div>
                }
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            {!warning?.has_warning && warning?.suggestions && warning.suggestions.length > 0 && (
              <Alert
                message="财务状况健康"
                description={
                  <List
                    size="small"
                    dataSource={warning.suggestions}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '2px 0', border: 'none' }}>
                        <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 6 }} />
                        <span>{item}</span>
                      </List.Item>
                    )}
                  />
                }
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Card title="收支与净现金流趋势" size="small" style={{ marginBottom: 16 }}>
              <div style={{ height: 400 }}>
                <Line {...lineConfig} />
              </div>
            </Card>

            <Row gutter={16}>
              <Col span={12}>
                <Card title="预测月份详情" size="small">
                  <List
                    size="small"
                    dataSource={predictionData.predicted_data}
                    renderItem={(item) => {
                      const isNegative = item.net_cash_flow < 0;
                      return (
                        <List.Item
                          style={{
                            padding: '8px 12px',
                            backgroundColor: isNegative ? '#fff2f0' : 'transparent',
                            borderRadius: 4,
                            marginBottom: 4,
                            border: isNegative ? '1px solid #ffccc7' : 'none',
                          }}
                        >
                          <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <Space>
                                <Text strong>{item.label}</Text>
                                {isNegative && (
                                  <Tag color="red" style={{ margin: 0 }}>
                                    <WarningOutlined /> 风险
                                  </Tag>
                                )}
                              </Space>
                              <Text strong style={{ color: isNegative ? '#f5222d' : '#52c41a' }}>
                                净: {formatCurrency(item.net_cash_flow, base_currency)}
                              </Text>
                            </div>
                            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                              <Text type="secondary">
                                收入: {formatCurrency(item.income, base_currency)}
                                {item.income_lower !== null && ` (${formatCurrency(item.income_lower, base_currency)} ~ ${formatCurrency(item.income_upper, base_currency)})`}
                              </Text>
                              <Text type="secondary">
                                支出: {formatCurrency(item.expense, base_currency)}
                                {item.expense_lower !== null && ` (${formatCurrency(item.expense_lower, base_currency)} ~ ${formatCurrency(item.expense_upper, base_currency)})`}
                              </Text>
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2 }}>
                              <Tag color="blue" style={{ margin: 0, padding: '0 4px', fontSize: 11 }}>
                                置信度 {(item.confidence_level * 100).toFixed(0)}%
                              </Tag>
                            </div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card title="模型说明" size="small">
                  <Paragraph style={{ fontSize: 13, marginBottom: 12 }}>
                    {model_description}
                  </Paragraph>
                  <Title level={5} style={{ marginBottom: 8 }}>图例说明</Title>
                  <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 2, background: '#52c41a' }}></div>
                      <span>收入（实线为实际，虚线为预测）</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 2, background: '#f5222d' }}></div>
                      <span>支出（实线为实际，虚线为预测）</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 2, background: '#1890ff' }}></div>
                      <span>净现金流（实线为实际，虚线为预测）</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <WarningOutlined style={{ color: '#f5222d' }} />
                      <span>净现金流为负的风险月份</span>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Card>
    );
  };

  const renderAnomalyPanel = () => {
    if (!anomalyData || anomalyData.anomaly_count === 0) return null;

    const { anomalies, amount_anomaly_count, frequency_anomaly_count, time_anomaly_count, total_transactions } = anomalyData;

    const anomalyTypeLabel = {
      amount: '金额异常',
      frequency: '频率异常',
      time: '时间异常',
    };

    const anomalyTypeColor = {
      amount: 'orange',
      frequency: 'blue',
      time: 'purple',
    };

    const anomalyBgColor = {
      amount: '#fff7e6',
      frequency: '#e6f7ff',
      time: '#f9f0ff',
    };

    const getRowBgColor = (record) => {
      if (record.anomaly_types.includes('amount')) return anomalyBgColor.amount;
      if (record.anomaly_types.includes('frequency')) return anomalyBgColor.frequency;
      if (record.anomaly_types.includes('time')) return anomalyBgColor.time;
      return undefined;
    };

    const anomalyColumns = [
      {
        title: '日期', dataIndex: 'date', key: 'date', width: 110,
      },
      {
        title: '描述', dataIndex: 'description', key: 'description', ellipsis: true,
      },
      {
        title: '金额', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
        render: (v, r) => (
          <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 500 }}>
            {r.type === 'income' ? '+' : '-'}{formatCurrency(v, baseCurrency)}
          </span>
        ),
      },
      {
        title: '异常类型', dataIndex: 'anomaly_types', key: 'anomaly_types', width: 200,
        render: (types) => (
          <Space size={4}>
            {types.map((t) => (
              <Tag key={t} color={anomalyTypeColor[t]}>{anomalyTypeLabel[t]}</Tag>
            ))}
          </Space>
        ),
      },
      {
        title: '异常分数', dataIndex: 'total_score', key: 'total_score', width: 100, align: 'center',
        sorter: (a, b) => a.total_score - b.total_score,
        defaultSortOrder: 'descend',
        render: (v) => (
          <Text strong style={{ color: v >= 5 ? '#f5222d' : v >= 3 ? '#fa8c16' : '#faad14' }}>
            {v.toFixed(2)}
          </Text>
        ),
      },
    ];

    return (
      <Card
        style={{ marginBottom: 24, cursor: 'pointer', borderLeft: '4px solid #722ed1' }}
        onClick={() => setAnomalyExpanded(!anomalyExpanded)}
        hoverable
      >
        <Row gutter={16} align="middle">
          <Col span={24}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <SafetyCertificateOutlined style={{ fontSize: 20, color: '#722ed1' }} />
                <Title level={4} style={{ margin: 0 }}>
                  智能异常交易检测
                </Title>
                <Tag color="red">{anomalies.length}笔异常</Tag>
                <Tag color="orange">金额异常 {amount_anomaly_count}</Tag>
                <Tag color="blue">频率异常 {frequency_anomaly_count}</Tag>
                <Tag color="purple">时间异常 {time_anomaly_count}</Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {anomalyExpanded ? '点击收起 ▲' : '点击展开查看详情 ▼'}
              </Text>
            </div>
          </Col>
        </Row>

        {anomalyExpanded && (
          <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 20 }} onClick={(e) => e.stopPropagation()}>
            {amount_anomaly_count >= 3 && (
              <Alert
                message="金额异常风险提示"
                description={`检测到 ${amount_anomaly_count} 笔金额异常交易，可能存在异常支出或未授权交易，请仔细核实这些交易的合理性。`}
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}
            <Table
              columns={anomalyColumns}
              dataSource={anomalies}
              rowKey="transaction_id"
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔异常交易` }}
              rowClassName={(record) => {
                if (record.anomaly_types.includes('amount')) return 'anomaly-row-amount';
                if (record.anomaly_types.includes('frequency')) return 'anomaly-row-frequency';
                if (record.anomaly_types.includes('time')) return 'anomaly-row-time';
                return '';
              }}
              onRow={(record) => ({
                style: { backgroundColor: getRowBgColor(record) },
              })}
            />
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

      {renderCashFlowPrediction()}

      {renderAnomalyPanel()}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card><Statistic title="本月收入" value={summary?.total_income || 0} prefix={<ArrowUpOutlined />} suffix={displayCurrency} styles={{ content: { color: '#3f8600' } }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="本月支出" value={summary?.total_expense || 0} prefix={<ArrowDownOutlined />} suffix={displayCurrency} styles={{ content: { color: '#cf1322' } }} precision={2} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="本月结余" value={summary?.balance || 0} prefix={<WalletOutlined />} suffix={displayCurrency} styles={{ content: { color: summary?.balance >= 0 ? '#3f8600' : '#cf1322' } }} precision={2} /></Card>
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
