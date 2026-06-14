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
  Tabs,
  Card,
  Row,
  Col,
  Descriptions,
  Switch,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { recurringApi, categoryApi, accountApi } from '../services/api';

const frequencyOptions = [
  { value: 'monthly', label: '每月' },
  { value: 'weekly', label: '每周' },
  { value: 'yearly', label: '每年' },
];

const weekOptions = [
  { value: 0, label: '周一' },
  { value: 1, label: '周二' },
  { value: 2, label: '周三' },
  { value: 3, label: '周四' },
  { value: 4, label: '周五' },
  { value: 5, label: '周六' },
  { value: 6, label: '周日' },
];

const typeOptions = [
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
];

export default function Recurring({ currentLedger }) {
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [previewDates, setPreviewDates] = useState([]);
  const [form] = Form.useForm();

  const frequency = Form.useWatch('frequency', form);
  const startDate = Form.useWatch('start_date', form);
  const dayOfMonth = Form.useWatch('day_of_month', form);
  const dayOfWeek = Form.useWatch('day_of_week', form);
  const selectedType = Form.useWatch('type', form);

  const fetchRules = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const list = await recurringApi.listRules({ ledger_id: currentLedger.id });
      setRules(list);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const list = await recurringApi.listLogs({ limit: 100 });
      setLogs(list);
    } finally {
      setLogsLoading(false);
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

  const defaultAccount = accounts.find((a) => a.is_default) || accounts[0];

  useEffect(() => {
    fetchRules();
    fetchLogs();
    fetchCategories();
    fetchAccounts();
  }, [currentLedger]);

  useEffect(() => {
    const updatePreview = async () => {
      if (!frequency || !startDate) {
        setPreviewDates([]);
        return;
      }
      try {
        const payload = {
          frequency,
          start_date: startDate.format('YYYY-MM-DD'),
        };
        if (frequency === 'monthly' && dayOfMonth != null) {
          payload.day_of_month = dayOfMonth;
        }
        if (frequency === 'weekly' && dayOfWeek != null) {
          payload.day_of_week = dayOfWeek;
        }
        if (frequency === 'yearly' && dayOfMonth != null) {
          payload.day_of_month = dayOfMonth;
        }
        const dates = await recurringApi.previewDates(payload);
        setPreviewDates(dates);
      } catch (e) {
        setPreviewDates([]);
      }
    };
    updatePreview();
  }, [frequency, startDate, dayOfMonth, dayOfWeek]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      ledger_id: currentLedger.id,
      start_date: values.start_date.format('YYYY-MM-DD'),
      end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : '',
    };
    if (editItem) {
      await recurringApi.updateRule(editItem.id, payload);
      message.success('更新成功');
    } else {
      await recurringApi.createRule(payload);
      message.success('添加成功');
    }
    setModalOpen(false);
    setEditItem(null);
    form.resetFields();
    setPreviewDates([]);
    fetchRules();
  };

  const handleDelete = async (id) => {
    await recurringApi.deleteRule(id);
    message.success('删除成功');
    fetchRules();
  };

  const handleToggleActive = async (record, checked) => {
    await recurringApi.updateRule(record.id, { is_active: checked ? 1 : 0 });
    message.success(checked ? '已启用' : '已停用');
    fetchRules();
  };

  const handleGenerate = async () => {
    try {
      const result = await recurringApi.generate();
      message.success(
        `执行完成：共 ${result.total_rules} 条规则，生成 ${result.generated_count} 条，跳过 ${result.skipped_count} 条`
      );
      fetchRules();
      fetchLogs();
      if (result.details && result.details.length > 0) {
        Modal.info({
          title: '执行详情',
          width: 600,
          content: (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {result.details.map((d, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                  {d}
                </div>
              ))}
            </div>
          ),
        });
      }
    } catch (e) {
      message.error('执行失败: ' + e.message);
    }
  };

  const openEdit = (record) => {
    setEditItem(record);
    form.setFieldsValue({
      ...record,
      account_id: record.account_id ?? defaultAccount?.id,
      start_date: record.start_date ? dayjs(record.start_date) : null,
      end_date: record.end_date ? dayjs(record.end_date) : null,
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({
      frequency: 'monthly',
      type: 'expense',
      start_date: dayjs(),
      account_id: defaultAccount?.id,
    });
    setPreviewDates([]);
    setModalOpen(true);
  };

  const filteredCategories = useMemo(() => {
    if (!selectedType) return categories;
    return categories.filter((c) => c.type === selectedType);
  }, [categories, selectedType]);

  const ruleColumns = [
    { title: '规则名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (t) => (
        <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (v, r) => (
        <span style={{ color: r.type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {r.type === 'income' ? '+' : '-'}¥{v.toFixed(2)}
        </span>
      ),
    },
    {
      title: '频率',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 90,
      render: (f, r) => {
        const label = frequencyOptions.find((o) => o.value === f)?.label || f;
        let extra = '';
        if (f === 'monthly' && r.day_of_month) extra = ` (${r.day_of_month}日)`;
        if (f === 'weekly' && r.day_of_week != null) {
          extra = ` (${weekOptions.find((o) => o.value === r.day_of_week)?.label})`;
        }
        if (f === 'yearly' && r.day_of_month) extra = ` (${r.day_of_month}日)`;
        return label + extra;
      },
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      key: 'category_id',
      width: 100,
      render: (id) => categories.find((c) => c.id === id)?.name || '-',
    },
    {
      title: '账户',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 140,
      render: (id) => {
        const acc = accounts.find((a) => a.id === id);
        return acc ? acc.name : '-';
      },
    },
    { title: '起始日', dataIndex: 'start_date', key: 'start_date', width: 110 },
    { title: '结束日', dataIndex: 'end_date', key: 'end_date', width: 110, render: (v) => v || '-' },
    {
      title: '下次执行',
      dataIndex: 'next_date',
      key: 'next_date',
      width: 110,
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v, r) => (
        <Switch checked={v === 1} onChange={(c) => handleToggleActive(r, c)} size="small" />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Tooltip title="查看执行日期">
            <Button
              type="link"
              size="small"
              icon={<CalendarOutlined />}
              onClick={async () => {
                const dates = await recurringApi.previewRuleDates(record.id, 5);
                Modal.info({
                  title: `${record.name} - 未来5次执行日期`,
                  content: dates.map((d, i) => (
                    <div key={i} style={{ padding: '6px 0' }}>
                      第 {i + 1} 次：<Tag color="blue">{d}</Tag>
                    </div>
                  )),
                });
              }}
            >
              预览
            </Button>
          </Tooltip>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const logColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '规则',
      dataIndex: 'rule_id',
      key: 'rule_id',
      width: 120,
      render: (id) => rules.find((r) => r.id === id)?.name || `规则#${id}`,
    },
    { title: '生成日期', dataIndex: 'generated_date', key: 'generated_date', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={s === 'success' ? 'green' : 'red'}>{s}</Tag>,
    },
    { title: '关联交易ID', dataIndex: 'transaction_id', key: 'transaction_id', width: 110, render: (v) => v || '-' },
    { title: '详情', dataIndex: 'message', key: 'message' },
    { title: '执行时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
  ];

  return (
    <div>
      <Tabs
        items={[
          {
            key: 'rules',
            label: '规则列表',
            children: (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    新建规则
                  </Button>
                  <Button
                    icon={<PlayCircleOutlined />}
                    onClick={handleGenerate}
                  >
                    立即执行生成
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={fetchRules}>
                    刷新
                  </Button>
                </div>
                <Table
                  columns={ruleColumns}
                  dataSource={rules}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              </div>
            ),
          },
          {
            key: 'logs',
            label: '执行历史',
            children: (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <Button icon={<ReloadOutlined />} onClick={fetchLogs}>
                    刷新
                  </Button>
                </div>
                <Table
                  columns={logColumns}
                  dataSource={logs}
                  rowKey="id"
                  loading={logsLoading}
                  pagination={{ pageSize: 20 }}
                  size="small"
                />
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editItem ? '编辑周期规则' : '新建周期规则'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditItem(null);
          form.resetFields();
          setPreviewDates([]);
        }}
        destroyOnClose
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
                <Input placeholder="例如：房租、工资" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select
                  options={typeOptions}
                  onChange={() => {
                    form.setFieldsValue({ category_id: undefined });
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="amount"
                label="金额"
                rules={[{ required: true, message: '请输入金额' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category_id"
                label="分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select
                  options={filteredCategories.map((c) => ({
                    label: c.name,
                    value: c.id,
                  }))}
                  placeholder="请先选择类型"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="account_id"
                label="账户"
                rules={[{ required: true, message: '请选择账户' }]}
              >
                <Select
                  options={accounts.map((a) => ({
                    label: `${a.name} (¥${a.balance.toFixed(2)})`,
                    value: a.id,
                  }))}
                  placeholder="请选择账户"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="frequency"
                label="频率"
                rules={[{ required: true, message: '请选择频率' }]}
              >
                <Select options={frequencyOptions} />
              </Form.Item>
            </Col>
            {frequency === 'monthly' && (
              <Col span={8}>
                <Form.Item name="day_of_month" label="每月几日" rules={[{ required: true }]}>
                  <InputNumber min={1} max={31} style={{ width: '100%' }} placeholder="1-31" />
                </Form.Item>
              </Col>
            )}
            {frequency === 'weekly' && (
              <Col span={8}>
                <Form.Item name="day_of_week" label="每周几" rules={[{ required: true }]}>
                  <Select options={weekOptions} />
                </Form.Item>
              </Col>
            )}
            {frequency === 'yearly' && (
              <Col span={8}>
                <Form.Item name="day_of_month" label="每年该月几日" rules={[{ required: true }]}>
                  <InputNumber min={1} max={31} style={{ width: '100%' }} placeholder="1-31" />
                </Form.Item>
              </Col>
            )}
            <Col span={frequency && frequency !== 'monthly' && frequency !== 'weekly' && frequency !== 'yearly' ? 16 : frequency ? 8 : 16}>
              <Form.Item
                name="start_date"
                label="起始日期"
                rules={[{ required: true, message: '请选择起始日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="end_date" label="结束日期（可选）">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选，用于生成交易时的备注" />
          </Form.Item>

          {previewDates.length > 0 && (
            <Card
              size="small"
              title={
                <span>
                  <InfoCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                  未来 5 次执行日期预览
                </span>
              }
              style={{ background: '#f6ffed', borderColor: '#b7eb8f', marginBottom: 0 }}
            >
              <Descriptions column={5} size="small">
                {previewDates.map((d, i) => (
                  <Descriptions.Item key={i} label={`第${i + 1}次`}>
                    <Tag color="blue">{d}</Tag>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          )}
        </Form>
      </Modal>
    </div>
  );
}
