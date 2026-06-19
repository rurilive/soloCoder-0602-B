import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Tag,
  Space,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Divider,
  Tabs,
  Tooltip,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DollarOutlined,
  PayCircleOutlined,
  LineChartOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Line } from '@ant-design/charts';
import dayjs from 'dayjs';
import { loanApi, categoryApi, accountApi, formatCurrency } from '../services/api';

const amortizationOptions = [
  { value: 'equal_principal', label: '等额本金（每月本金固定，利息递减）' },
  { value: 'equal_payment', label: '等额本息（每月还款额固定）' },
];

const statusColors = {
  pending: 'default',
  overdue: 'red',
  paid: 'green',
};

const statusLabels = {
  pending: '待还款',
  overdue: '已逾期',
  paid: '已还款',
};

const repaymentTypeOptions = [
  { value: 'reduce_payment', label: '减少月供（期数不变）' },
  { value: 'reduce_term', label: '缩短期限（月供不变）' },
];

export default function LoanManagement({ currentLedger }) {
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [earlyRepaymentModalOpen, setEarlyRepaymentModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [remainingPrincipalData, setRemainingPrincipalData] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form] = Form.useForm();
  const [earlyForm] = Form.useForm();

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const fetchLoans = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const list = await loanApi.list({ ledger_id: currentLedger.id });
      setLoans(list);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanDetail = async (loanId) => {
    setDetailLoading(true);
    try {
      const detail = await loanApi.get(loanId);
      setSelectedLoan(detail);
      const curveData = await loanApi.getRemainingPrincipal(loanId);
      setRemainingPrincipalData(
        curveData.map((item) => ({
          ...item,
          period: `第${item.period_number}期`,
        }))
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!currentLedger) return;
    const list = await categoryApi.list({ ledger_id: currentLedger.id });
    setCategories(list);
  };

  const fetchAccounts = async () => {
    if (!currentLedger) return;
    const list = await accountApi.list({ ledger_id: currentLedger.id });
    setAccounts(list);
  };

  useEffect(() => {
    fetchLoans();
    fetchCategories();
    fetchAccounts();
  }, [currentLedger]);

  const handleCreateLoan = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      ledger_id: currentLedger.id,
      start_date: values.start_date.format('YYYY-MM-DD'),
    };
    try {
      const result = await loanApi.create(payload);
      message.success('贷款创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchLoans();
      setSelectedLoan(result);
      const curveData = await loanApi.getRemainingPrincipal(result.id);
      setRemainingPrincipalData(
        curveData.map((item) => ({
          ...item,
          period: `第${item.period_number}期`,
        }))
      );
    } catch (e) {
      message.error('创建失败: ' + e.message);
    }
  };

  const handleDeleteLoan = async (id) => {
    try {
      await loanApi.delete(id);
      message.success('删除成功');
      fetchLoans();
      if (selectedLoan?.id === id) {
        setSelectedLoan(null);
      }
    } catch (e) {
      message.error('删除失败: ' + e.message);
    }
  };

  const handleEarlyRepayment = async () => {
    const values = await earlyForm.validateFields();
    try {
      const result = await loanApi.earlyRepayment({
        loan_id: selectedLoan.id,
        period_number: values.period_number,
        amount: values.amount,
        repayment_type: values.repayment_type || 'reduce_payment',
      });
      message.success('提前还款成功，还款计划已重算');
      setEarlyRepaymentModalOpen(false);
      earlyForm.resetFields();
      setPreviewData(null);
      setSelectedLoan(result);
      const curveData = await loanApi.getRemainingPrincipal(result.id);
      setRemainingPrincipalData(
        curveData.map((item) => ({
          ...item,
          period: `第${item.period_number}期`,
        }))
      );
    } catch (e) {
      message.error('提前还款失败: ' + e.message);
    }
  };

  const handleGenerateTransaction = async (scheduleId) => {
    try {
      await loanApi.generateTransaction(selectedLoan.id, scheduleId);
      message.success('交易已生成');
      fetchLoanDetail(selectedLoan.id);
    } catch (e) {
      message.error('生成失败: ' + e.message);
    }
  };

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      amortization_type: 'equal_payment',
      repayment_day: 1,
      start_date: dayjs(),
    });
    setCreateModalOpen(true);
  };

  const fetchPreview = async (values) => {
    if (!selectedLoan || !values.period_number || !values.amount || values.amount <= 0) {
      setPreviewData(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await loanApi.previewEarlyRepayment({
        loan_id: selectedLoan.id,
        period_number: values.period_number,
        amount: values.amount,
        repayment_type: values.repayment_type || 'reduce_payment',
      });
      setPreviewData(data);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openEarlyRepaymentModal = () => {
    earlyForm.resetFields();
    earlyForm.setFieldsValue({
      repayment_type: 'reduce_payment',
    });
    setPreviewData(null);
    setEarlyRepaymentModalOpen(true);
  };

  const getPaidAmount = (schedule) => {
    return schedule.filter((s) => s.status === 'paid').reduce((sum, s) => sum + s.payment_amount, 0);
  };

  const getRemainingAmount = (schedule) => {
    return schedule.filter((s) => s.status !== 'paid').reduce((sum, s) => sum + s.payment_amount, 0);
  };

  const getOverdueCount = (schedule) => {
    return schedule.filter((s) => s.status === 'overdue').length;
  };

  const getDueUnprocessedCount = (schedule) => {
    const today = dayjs().format('YYYY-MM-DD');
    return schedule.filter((s) =>
      (s.status === 'pending' || s.status === 'overdue') &&
      !s.transaction_id &&
      s.due_date <= today
    ).length;
  };

  const handleGenerateOverdueTransactions = async () => {
    try {
      const result = await loanApi.generateOverdueTransactions(selectedLoan.id);
      if (result.failed_count > 0) {
        message.warning(`批量生成完成：成功 ${result.success_count} 笔，失败 ${result.failed_count} 笔`);
        if (result.failed_details && result.failed_details.length > 0) {
          console.error('失败详情:', result.failed_details);
        }
      } else {
        message.success(`批量生成完成，共生成 ${result.success_count} 笔交易`);
      }
      fetchLoanDetail(selectedLoan.id);
    } catch (e) {
      message.error('批量生成失败: ' + e.message);
    }
  };

  const loanColumns = [
    { title: '贷款名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '本金',
      dataIndex: 'principal',
      key: 'principal',
      width: 120,
      render: (v) => formatCurrency(v),
    },
    {
      title: '年利率',
      dataIndex: 'annual_rate',
      key: 'annual_rate',
      width: 100,
      render: (v) => `${v}%`,
    },
    {
      title: '期限',
      dataIndex: 'term_months',
      key: 'term_months',
      width: 100,
      render: (v) => `${v}个月`,
    },
    {
      title: '还款方式',
      dataIndex: 'amortization_type',
      key: 'amortization_type',
      width: 140,
      render: (v) => amortizationOptions.find((o) => o.value === v)?.label || v,
    },
    {
      title: '总利息',
      dataIndex: 'total_interest',
      key: 'total_interest',
      width: 120,
      render: (v) => formatCurrency(v),
    },
    {
      title: '总还款额',
      dataIndex: 'total_payment',
      key: 'total_payment',
      width: 120,
      render: (v) => formatCurrency(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v) => (
        <Tag color={v === 'active' ? 'blue' : v === 'paid_off' ? 'green' : 'default'}>
          {v === 'active' ? '进行中' : v === 'paid_off' ? '已结清' : v}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => fetchLoanDetail(record.id)}>
            查看详情
          </Button>
          <Popconfirm title="确定删除？删除将同时删除所有关联的还款计划和交易。" onConfirm={() => handleDeleteLoan(record.id)}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const scheduleColumns = [
    {
      title: '期次',
      dataIndex: 'period_number',
      key: 'period_number',
      width: 70,
      render: (v, record) => (
        <Space>
          <span>第{v}期</span>
          {record.is_early_repayment && <Tag color="orange">提前还款</Tag>}
        </Space>
      ),
    },
    { title: '还款日', dataIndex: 'due_date', key: 'due_date', width: 110 },
    {
      title: '应还本金',
      dataIndex: 'principal_amount',
      key: 'principal_amount',
      width: 110,
      render: (v) => formatCurrency(v),
    },
    {
      title: '应还利息',
      dataIndex: 'interest_amount',
      key: 'interest_amount',
      width: 110,
      render: (v) => formatCurrency(v),
    },
    {
      title: '本期还款额',
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      width: 120,
      render: (v) => formatCurrency(v),
    },
    {
      title: '提前还款额',
      dataIndex: 'early_repayment_amount',
      key: 'early_repayment_amount',
      width: 110,
      render: (v) => (v > 0 ? formatCurrency(v) : '-'),
    },
    {
      title: '剩余本金',
      dataIndex: 'remaining_principal',
      key: 'remaining_principal',
      width: 120,
      render: (v) => formatCurrency(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v, record) => {
        if (record.transaction_id) {
          return <Tag color="green">已生成交易</Tag>;
        }
        return <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>;
      },
    },
    {
      title: '关联交易',
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      width: 100,
      render: (v) => (v ? `#${v}` : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => {
        if (record.status === 'paid' || record.transaction_id) {
          return <span style={{ color: '#999' }}>已完成</span>;
        }
        return (
          <Button
            type="primary"
            size="small"
            onClick={() => handleGenerateTransaction(record.id)}
          >
            生成交易
          </Button>
        );
      },
    },
  ];

  const chartData = useMemo(() => {
    return remainingPrincipalData.map((item) => ({
      ...item,
      remaining_principal_display: formatCurrency(item.remaining_principal),
    }));
  }, [remainingPrincipalData]);

  const chartConfig = {
    data: chartData,
    xField: 'due_date',
    yField: 'remaining_principal',
    smooth: true,
    point: {
      size: 3,
      shape: 'circle',
    },
    lineStyle: {
      lineWidth: 2,
    },
    color: '#1677ff',
  };

  const scheduleRowClassName = (record) => {
    if (record.status === 'overdue') {
      return 'overdue-row';
    }
    return '';
  };

  return (
    <div>
      <style>{`
        .overdue-row td {
          background-color: #fff1f0 !important;
        }
        .overdue-row td:first-child {
          border-left: 3px solid #ff4d4f;
        }
      `}</style>

      {!selectedLoan ? (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建贷款
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchLoans}>
              刷新
            </Button>
          </div>

          <Table
            columns={loanColumns}
            dataSource={loans}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            size="small"
            onRow={(record) => ({
              onClick: () => fetchLoanDetail(record.id),
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <Button onClick={() => setSelectedLoan(null)}>
              ← 返回列表
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => fetchLoanDetail(selectedLoan.id)}>
              刷新
            </Button>
            {selectedLoan.status === 'active' && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={openEarlyRepaymentModal}
              >
                提前还款
              </Button>
            )}
            {selectedLoan.status === 'active' && getDueUnprocessedCount(selectedLoan.schedule) > 0 && (
              <Tooltip title={`将为 ${getDueUnprocessedCount(selectedLoan.schedule)} 笔到期未生成交易的还款计划批量生成支出交易`}>
                <Button
                  danger
                  icon={<ThunderboltOutlined />}
                  onClick={handleGenerateOverdueTransactions}
                >
                  一键生成逾期交易 ({getDueUnprocessedCount(selectedLoan.schedule)})
                </Button>
              </Tooltip>
            )}
          </div>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="贷款本金"
                  value={selectedLoan.principal}
                  precision={2}
                  prefix="¥"
                  styles={{ content: { color: '#1677ff' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="总利息"
                  value={selectedLoan.total_interest}
                  precision={2}
                  prefix="¥"
                  styles={{ content: { color: '#fa8c16' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="已还款"
                  value={getPaidAmount(selectedLoan.schedule)}
                  precision={2}
                  prefix="¥"
                  styles={{ content: { color: '#52c41a' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="待还款"
                  value={getRemainingAmount(selectedLoan.schedule)}
                  precision={2}
                  prefix="¥"
                  styles={{ content: { color: getOverdueCount(selectedLoan.schedule) > 0 ? '#ff4d4f' : '#666' } }}
                  suffix={getOverdueCount(selectedLoan.schedule) > 0 ? `(${getOverdueCount(selectedLoan.schedule)}期逾期)` : ''}
                />
              </Card>
            </Col>
          </Row>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={4} size="small">
              <Descriptions.Item label="贷款名称">{selectedLoan.name}</Descriptions.Item>
              <Descriptions.Item label="年利率">{selectedLoan.annual_rate}%</Descriptions.Item>
              <Descriptions.Item label="期限">{selectedLoan.term_months}个月</Descriptions.Item>
              <Descriptions.Item label="还款日">每月{selectedLoan.repayment_day}日</Descriptions.Item>
              <Descriptions.Item label="还款方式">
                {amortizationOptions.find((o) => o.value === selectedLoan.amortization_type)?.label}
              </Descriptions.Item>
              <Descriptions.Item label="开始日期">{selectedLoan.start_date}</Descriptions.Item>
              <Descriptions.Item label="总还款额">
                {formatCurrency(selectedLoan.total_payment)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={selectedLoan.status === 'active' ? 'blue' : 'green'}>
                  {selectedLoan.status === 'active' ? '进行中' : '已结清'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Tabs
            items={[
              {
                key: 'schedule',
                label: (
                  <span>
                    <CalendarOutlined /> 还款计划
                  </span>
                ),
                children: (
                  <div>
                    <Card
                      size="small"
                      style={{ marginBottom: 16 }}
                      title={
                        <span>
                          <InfoCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                          还款说明
                        </span>
                      }
                    >
                      <Row gutter={16}>
                        <Col span={12}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, background: '#fff1f0', borderLeft: '3px solid #ff4d4f', display: 'inline-block' }}></span>
                            <span>红色边框表示该期已逾期</span>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color="orange">提前还款</Tag>
                            <span>橙色标签表示该期有提前还款</span>
                          </div>
                        </Col>
                      </Row>
                    </Card>
                    <Table
                      columns={scheduleColumns}
                      dataSource={selectedLoan.schedule}
                      rowKey="id"
                      loading={detailLoading}
                      pagination={{ pageSize: 12 }}
                      size="small"
                      rowClassName={scheduleRowClassName}
                      scroll={{ x: 1100 }}
                    />
                  </div>
                ),
              },
              {
                key: 'chart',
                label: (
                  <span>
                    <LineChartOutlined /> 剩余本金曲线
                  </span>
                ),
                children: (
                  <Card size="small">
                    <div style={{ height: 400, padding: '20px 0' }}>
                      <Line {...chartConfig} />
                    </div>
                  </Card>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        title="新建贷款"
        open={createModalOpen}
        onOk={handleCreateLoan}
        onCancel={() => setCreateModalOpen(false)}
        destroyOnHidden
        width={700}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="贷款名称" rules={[{ required: true, message: '请输入贷款名称' }]}>
                <Input placeholder="例如：房贷、车贷" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="principal"
                label="贷款本金"
                rules={[{ required: true, message: '请输入贷款本金' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix="¥" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="annual_rate"
                label="年利率 (%)"
                rules={[{ required: true, message: '请输入年利率' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} suffix="%" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="term_months"
                label="贷款期限（月）"
                rules={[{ required: true, message: '请输入贷款期限' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} step={1} suffix="个月" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="amortization_type"
                label="还款方式"
                rules={[{ required: true, message: '请选择还款方式' }]}
              >
                <Select options={amortizationOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="repayment_day"
                label="每月还款日"
                rules={[{ required: true, message: '请选择还款日' }]}
              >
                <Select
                  options={Array.from({ length: 28 }, (_, i) => i + 1).map((d) => ({
                    label: `${d}日`,
                    value: d,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_date"
                label="开始日期"
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category_id"
                label="还款分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select
                  options={expenseCategories.map((c) => ({
                    label: c.name,
                    value: c.id,
                  }))}
                  placeholder="请选择支出分类"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="account_id"
                label="还款账户"
                rules={[{ required: true, message: '请选择账户' }]}
              >
                <Select
                  options={accounts.map((a) => ({
                    label: a.name,
                    value: a.id,
                  }))}
                  placeholder="请选择还款账户"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="提前还款"
        open={earlyRepaymentModalOpen}
        onOk={handleEarlyRepayment}
        onCancel={() => {
          setEarlyRepaymentModalOpen(false);
          setPreviewData(null);
        }}
        destroyOnHidden
        width={900}
        okText="确认提前还款"
        cancelText="取消"
      >
        <Form
          form={earlyForm}
          layout="vertical"
          onValuesChange={(_, allValues) => {
            fetchPreview(allValues);
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="period_number"
                label="提前还款期次"
                rules={[{ required: true, message: '请选择期次' }]}
                tooltip="选择从第几期开始提前还款"
              >
                <Select
                  options={selectedLoan?.schedule
                    .filter((s) => s.status !== 'paid')
                    .map((s) => ({
                      label: `第${s.period_number}期 (${s.due_date}) - 剩余本金: ${formatCurrency(s.remaining_principal)}`,
                      value: s.period_number,
                    }))}
                  placeholder="请选择期次"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="amount"
                label="提前还款金额"
                rules={[{ required: true, message: '请输入提前还款金额' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix="¥" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="repayment_type"
            label="还款方式"
            initialValue="reduce_payment"
            rules={[{ required: true, message: '请选择还款方式' }]}
          >
            <Select options={repaymentTypeOptions} />
          </Form.Item>

          {previewData && (
            <div>
              <Divider orientation="left">还款计划对比</Divider>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" style={{ background: '#f5f5f5' }}>
                    <Statistic
                      title="原月供"
                      value={previewData.original_monthly_payment}
                      precision={2}
                      prefix="¥"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
                    <Statistic
                      title="新月供"
                      value={previewData.new_monthly_payment}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Statistic
                      title="节省利息"
                      value={previewData.interest_saved}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                    <Statistic
                      title="剩余期数"
                      value={previewData.new_remaining_periods}
                      suffix={`期 (原${previewData.original_remaining_periods}期)`}
                      valueStyle={{ color: '#fa8c16' }}
                    />
                  </Card>
                </Col>
              </Row>

              <Card size="small" title="还款计划对比明细" style={{ maxHeight: 400, overflow: 'auto' }}>
                <Table
                  dataSource={previewData.diff_schedule}
                  rowKey="period_number"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: '期次',
                      dataIndex: 'period_number',
                      key: 'period_number',
                      width: 70,
                      render: (v, r) => {
                        const origPaid = r.original_payment === 0;
                        const newPaid = r.new_payment === 0;
                        if (origPaid && !newPaid) {
                          return <span style={{ color: '#52c41a' }}>第{v}期 <Tag color="green">新增</Tag></span>;
                        }
                        if (!origPaid && newPaid) {
                          return <span style={{ color: '#ff4d4f' }}>第{v}期 <Tag color="red">减少</Tag></span>;
                        }
                        return `第${v}期`;
                      },
                    },
                    { title: '还款日', dataIndex: 'due_date', key: 'due_date', width: 100 },
                    {
                      title: '原还款额',
                      dataIndex: 'original_payment',
                      key: 'original_payment',
                      width: 100,
                      render: (v) => v > 0 ? formatCurrency(v) : <span style={{ color: '#999' }}>-</span>,
                    },
                    {
                      title: '新还款额',
                      dataIndex: 'new_payment',
                      key: 'new_payment',
                      width: 100,
                      render: (v, r) => {
                        const diff = r.payment_diff;
                        const color = diff < 0 ? '#52c41a' : diff > 0 ? '#ff4d4f' : '#666';
                        return (
                          <Space direction="vertical" size={0}>
                            <span style={{ color, fontWeight: 'bold' }}>{formatCurrency(v)}</span>
                            {diff !== 0 && (
                              <span style={{ color, fontSize: 11 }}>
                                {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                              </span>
                            )}
                          </Space>
                        );
                      },
                    },
                    {
                      title: '原本金',
                      dataIndex: 'original_principal',
                      key: 'original_principal',
                      width: 90,
                      render: (v) => v > 0 ? formatCurrency(v) : <span style={{ color: '#999' }}>-</span>,
                    },
                    {
                      title: '新本金',
                      dataIndex: 'new_principal',
                      key: 'new_principal',
                      width: 90,
                      render: (v) => formatCurrency(v),
                    },
                    {
                      title: '原利息',
                      dataIndex: 'original_interest',
                      key: 'original_interest',
                      width: 90,
                      render: (v) => v > 0 ? formatCurrency(v) : <span style={{ color: '#999' }}>-</span>,
                    },
                    {
                      title: '新利息',
                      dataIndex: 'new_interest',
                      key: 'new_interest',
                      width: 90,
                      render: (v) => formatCurrency(v),
                    },
                    {
                      title: '剩余本金',
                      dataIndex: 'new_remaining',
                      key: 'new_remaining',
                      width: 100,
                      render: (v) => formatCurrency(v),
                    },
                  ]}
                />
              </Card>
            </div>
          )}

          {previewLoading && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              正在计算还款计划...
            </div>
          )}

          <Card
            size="small"
            type="inner"
            style={{ background: '#fffbe6', borderColor: '#ffe58f', marginTop: 16 }}
          >
            <p style={{ margin: 0, color: '#d48806' }}>
              <InfoCircleOutlined style={{ marginRight: 6 }} />
              提前还款后，系统将从指定月份起重新计算剩余还款计划。已还款部分不受影响。
              {previewData && (
                <span>
                  <br />
                  <strong>本次提前还款</strong>：{formatCurrency(previewData.new_schedule[0]?.early_repayment_amount || 0)}，
                  <strong>节省总利息</strong>：{formatCurrency(previewData.interest_saved)}，
                  <strong>减少总还款</strong>：{formatCurrency(previewData.payment_saved)}
                </span>
              )}
            </p>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
