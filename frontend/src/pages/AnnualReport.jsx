import { useState, useEffect, useRef } from 'react';
import {
  Card, Row, Col, Statistic, Spin, Space, Button, message, Progress,
  Table, Tag, Typography, Divider, Select,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined,
  DollarOutlined, FundOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { Pie, Line } from '@ant-design/charts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import dayjs from 'dayjs';
import { statisticsApi, formatCurrency } from '../services/api';

const { Title } = Typography;

export default function AnnualReport({ currentLedger }) {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(dayjs().year());
  const [data, setData] = useState(null);
  const reportRef = useRef(null);

  const baseCurrency = currentLedger?.base_currency || 'CNY';

  useEffect(() => {
    if (!currentLedger) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = { ledger_id: currentLedger.id, year };
        const result = await statisticsApi.annual(params);
        setData(result);
      } catch (e) {
        message.error('加载年度报告失败: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentLedger, year]);

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      message.loading({ content: '正在生成PDF...', key: 'pdf-export', duration: 0 });

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${currentLedger?.name || '年度报告'}_${year}.pdf`);
      message.success({ content: 'PDF导出成功', key: 'pdf-export' });
    } catch (e) {
      message.error({ content: 'PDF导出失败: ' + e.message, key: 'pdf-export' });
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;
  if (!data) return null;

  const yearOptions = [];
  for (let y = dayjs().year() + 1; y >= dayjs().year() - 5; y--) {
    yearOptions.push({ label: `${y}年`, value: y });
  }

  const incomePieData = data.income_categories.map((c) => ({
    type: '收入',
    name: c.category_name,
    value: c.amount,
  }));

  const expensePieData = data.expense_categories.map((c) => ({
    type: '支出',
    name: c.category_name,
    value: c.amount,
  }));

  const combinedPieData = [...incomePieData, ...expensePieData];

  const pieConfig = {
    data: combinedPieData,
    angleField: 'value',
    colorField: 'name',
    seriesField: 'type',
    radius: 0.9,
    innerRadius: 0.6,
    legend: { position: 'right' },
    label: {
      text: (d) => `${d.name}: ${formatCurrency(d.value, data.base_currency)}`,
      style: { fontSize: 11 },
    },
  };

  const cashFlowData = data.monthly_cash_flow.map((m) => ({
    month: m.label,
    收入: m.income,
    支出: m.expense,
    净现金流: m.net_cash_flow,
  }));

  const lineConfig = {
    data: cashFlowData,
    xField: 'month',
    yField: ['收入', '支出', '净现金流'],
    smooth: true,
    legend: { position: 'top' },
    point: { size: 4, shape: 'circle' },
  };

  const healthScoreData = data.health_score_history.map((h) => ({
    month: `${h.month}月`,
    score: h.score,
  }));

  const healthLineConfig = {
    data: healthScoreData,
    xField: 'month',
    yField: 'score',
    smooth: true,
    point: { size: 4, shape: 'circle' },
    color: '#1677ff',
    yAxis: { min: 0, max: 100 },
    label: {
      style: { fill: '#aaa', fontSize: 10 },
    },
  };

  const budgetColumns = [
    {
      title: '分类',
      dataIndex: 'category_name',
      key: 'category_name',
      render: (text, record) => (
        <Space>
          <span>{record.category_icon}</span>
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '预算金额',
      dataIndex: 'budget_amount',
      key: 'budget_amount',
      render: (v) => v > 0 ? formatCurrency(v, data.base_currency) : '-',
    },
    {
      title: '实际支出',
      dataIndex: 'spent_amount',
      key: 'spent_amount',
      render: (v) => formatCurrency(v, data.base_currency),
    },
    {
      title: '剩余',
      dataIndex: 'remaining',
      key: 'remaining',
      render: (v, record) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>
          {record.budget_amount > 0 ? formatCurrency(v, data.base_currency) : '-'}
        </span>
      ),
    },
    {
      title: '执行率',
      key: 'execution',
      render: (_, record) => {
        if (record.budget_amount <= 0) return <Tag>未设预算</Tag>;
        const pct = Math.min(record.execution_rate, 150);
        const color = record.is_overbudget ? '#cf1322' : pct > 80 ? '#faad14' : '#3f8600';
        return (
          <Progress
            percent={pct}
            size="small"
            strokeColor={color}
            format={() => `${record.execution_rate.toFixed(1)}%`}
          />
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Select
            value={year}
            onChange={setYear}
            style={{ width: 140 }}
            options={yearOptions}
          />
          <Tag color="blue">币种: {baseCurrency}</Tag>
        </Space>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleExportPDF}>
          导出PDF
        </Button>
      </div>

      <div ref={reportRef} style={{ padding: 4, background: '#fff' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8 }}>{year}年度财务报告</Title>
          <div style={{ color: '#666' }}>账本：{currentLedger?.name} | 币种：{data.base_currency}</div>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="年度总收入"
                value={data.total_income}
                prefix={<ArrowUpOutlined />}
                suffix={data.base_currency}
                valueStyle={{ color: '#3f8600' }}
                precision={2}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="年度总支出"
                value={data.total_expense}
                prefix={<ArrowDownOutlined />}
                suffix={data.base_currency}
                valueStyle={{ color: '#cf1322' }}
                precision={2}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="年度结余"
                value={data.net_balance}
                suffix={data.base_currency}
                valueStyle={{ color: data.net_balance >= 0 ? '#3f8600' : '#cf1322' }}
                precision={2}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="储蓄率"
                value={data.savings_rate}
                suffix="%"
                valueStyle={{ color: data.savings_rate >= 20 ? '#3f8600' : data.savings_rate >= 0 ? '#faad14' : '#cf1322' }}
                precision={1}
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>交易笔数: {data.transaction_count}</div>
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={12}>
            <Card title="收支分类对比">
              {combinedPieData.length > 0 ? (
                <Pie {...pieConfig} />
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="月度现金流趋势">
              <Line {...lineConfig} />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} md={12}>
            <Card title={
              <Space>
                <FundOutlined />
                投资收益摘要
              </Space>
            }>
              <Row gutter={[8, 16]}>
                <Col span={12}>
                  <Statistic
                    title="已实现收益"
                    value={data.investment_summary.total_realized_gain}
                    prefix={<DollarOutlined />}
                    valueStyle={{ color: data.investment_summary.total_realized_gain >= 0 ? '#3f8600' : '#cf1322', fontSize: 18 }}
                    precision={2}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="未实现收益"
                    value={data.investment_summary.total_unrealized_gain}
                    valueStyle={{ color: data.investment_summary.total_unrealized_gain >= 0 ? '#3f8600' : '#cf1322', fontSize: 18 }}
                    precision={2}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="分红收入"
                    value={data.investment_summary.total_dividends}
                    valueStyle={{ color: '#3f8600', fontSize: 18 }}
                    precision={2}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="总收益率"
                    value={data.investment_summary.total_return_pct}
                    suffix="%"
                    valueStyle={{ color: data.investment_summary.total_return_pct >= 0 ? '#3f8600' : '#cf1322', fontSize: 18 }}
                    precision={2}
                  />
                </Col>
                <Col span={12}>
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 12, color: '#999' }}>持仓成本</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {formatCurrency(data.investment_summary.total_cost_basis, data.base_currency)}
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 12, color: '#999' }}>当前市值</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {formatCurrency(data.investment_summary.total_market_value, data.base_currency)}
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={
              <Space>
                <FileTextOutlined />
                税务摘要
              </Space>
            }>
              {data.tax_summary && (
                <Row gutter={[8, 16]}>
                  <Col span={12}>
                    <Statistic
                      title="短期资本利得"
                      value={data.tax_summary.short_gain_total}
                      valueStyle={{ fontSize: 16 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="长期资本利得"
                      value={data.tax_summary.long_gain_total}
                      valueStyle={{ fontSize: 16 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="短期资本税"
                      value={data.tax_summary.short_tax}
                      valueStyle={{ color: '#cf1322', fontSize: 16 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="长期资本税"
                      value={data.tax_summary.long_tax}
                      valueStyle={{ color: '#cf1322', fontSize: 16 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="分红税"
                      value={data.tax_summary.dividend_tax_total}
                      valueStyle={{ color: '#cf1322', fontSize: 16 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="总税额"
                      value={data.tax_summary.total_tax}
                      valueStyle={{ color: '#cf1322', fontSize: 16, fontWeight: 700 }}
                      precision={2}
                    />
                  </Col>
                  <Col span={24}>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>实际税率</span>
                      <Tag color="red" style={{ fontSize: 14 }}>
                        {data.tax_summary.effective_tax_rate}%
                      </Tag>
                    </div>
                  </Col>
                </Row>
              )}
            </Card>
          </Col>
        </Row>

        <Card
          title={
            <Space>
              <span>预算 vs 实际对比</span>
              <Tag color={data.budget_summary.overall_execution_rate > 100 ? 'red' : 'blue'}>
                整体执行率: {data.budget_summary.overall_execution_rate}%
              </Tag>
            </Space>
          }
          style={{ marginBottom: 24 }}
          extra={
            <Space>
              <span style={{ color: '#666' }}>
                总预算: {formatCurrency(data.budget_summary.total_budget, data.base_currency)}
              </span>
              <span style={{ color: '#666' }}>
                已支出: {formatCurrency(data.budget_summary.total_spent, data.base_currency)}
              </span>
              {data.budget_summary.overbudget_count > 0 && (
                <Tag color="red">{data.budget_summary.overbudget_count}项超支</Tag>
              )}
            </Space>
          }
        >
          <Table
            dataSource={data.budget_summary.items.filter(i => i.budget_amount > 0 || i.spent_amount > 0)}
            columns={budgetColumns}
            rowKey="category_id"
            pagination={false}
            size="small"
          />
        </Card>

        <Card title="财务健康评分年度变化">
          {healthScoreData.some(h => h.score > 0) ? (
            <Line {...healthLineConfig} />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
          )}
          <Row gutter={16} style={{ marginTop: 16 }}>
            {data.health_score_history.map((h) => (
              <Col key={h.month} xs={8} sm={6} md={4} lg={2} style={{ marginBottom: 8 }}>
                <div style={{ textAlign: 'center', padding: 8, borderRadius: 6, background: `${h.level_color}10` }}>
                  <div style={{ fontSize: 12, color: '#666' }}>{h.month}月</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: h.level_color }}>
                    {h.score > 0 ? h.score : '-'}
                  </div>
                  <div style={{ fontSize: 11, color: h.level_color }}>
                    {h.level}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      </div>
    </div>
  );
}
