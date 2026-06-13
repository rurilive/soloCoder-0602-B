import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Progress,
  Button,
  Modal,
  Form,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  message,
  Statistic,
  DatePicker,
  Tag,
  Empty,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { budgetApi, categoryApi } from '../services/api';

function getProgressColor(ratio) {
  if (ratio < 0) return '#ff4d4f';
  if (ratio < 0.2) return '#ff4d4f';
  if (ratio < 0.5) return '#faad14';
  return '#52c41a';
}

const overbudgetKeyframes = `
@keyframes overbudgetBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

export default function BudgetManagement({ currentLedger }) {
  const [progress, setProgress] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [form] = Form.useForm();

  const year = selectedMonth.year();
  const month = selectedMonth.month() + 1;

  const fetchProgress = useCallback(async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const data = await budgetApi.progress({
        ledger_id: currentLedger.id,
        year,
        month,
      });
      setProgress(data);
    } finally {
      setLoading(false);
    }
  }, [currentLedger, year, month]);

  const fetchBudgets = useCallback(async () => {
    if (!currentLedger) return;
    const list = await budgetApi.list({
      ledger_id: currentLedger.id,
      year,
      month,
    });
    setBudgets(list);
  }, [currentLedger, year, month]);

  const fetchCategories = useCallback(async () => {
    if (!currentLedger) return;
    const list = await categoryApi.list({ ledger_id: currentLedger.id, type: 'expense' });
    setCategories(list);
  }, [currentLedger]);

  useEffect(() => {
    fetchProgress();
    fetchBudgets();
    fetchCategories();
  }, [fetchProgress, fetchBudgets, fetchCategories]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      category_id: values.category_id,
      ledger_id: currentLedger.id,
      amount: values.amount,
      year,
      month,
    };
    if (editItem) {
      await budgetApi.update(editItem.id, { amount: values.amount });
      message.success('预算更新成功');
    } else {
      await budgetApi.create(payload);
      message.success('预算创建成功');
    }
    setModalOpen(false);
    setEditItem(null);
    form.resetFields();
    fetchProgress();
    fetchBudgets();
  };

  const handleDelete = async (id) => {
    await budgetApi.delete(id);
    message.success('预算删除成功');
    fetchProgress();
    fetchBudgets();
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    form.setFieldsValue({
      category_id: item.category_id,
      amount: item.amount,
    });
    setModalOpen(true);
  };

  const existingCategoryIds = budgets.map((b) => b.category_id);

  const availableCategories = editItem
    ? categories
    : categories.filter((c) => !existingCategoryIds.includes(c.id));

  return (
    <div>
      <style>{overbudgetKeyframes}</style>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <DatePicker
          picker="month"
          value={selectedMonth}
          onChange={(d) => d && setSelectedMonth(d)}
          style={{ width: 180 }}
          allowClear={false}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建预算
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchProgress}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {progress && progress.items.length > 0 ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="总预算"
                    value={progress.total_budget}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{ color: '#1677ff' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="已支出"
                    value={progress.total_spent}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="剩余"
                    value={progress.total_remaining}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{ color: progress.total_remaining >= 0 ? '#52c41a' : '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="超支分类"
                    value={progress.overbudget_count}
                    prefix={progress.overbudget_count > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
                    valueStyle={{ color: progress.overbudget_count > 0 ? '#ff4d4f' : '#52c41a' }}
                    suffix={`/ ${progress.items.length}`}
                  />
                </Card>
              </Col>
            </Row>

            <Card title="各分类预算进度" size="small">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {progress.items.map((item) => {
                  const percent = item.budget_amount > 0
                    ? Math.min(Math.round((item.spent / item.budget_amount) * 100), 100)
                    : 0;
                  const color = getProgressColor(item.remaining_ratio);
                  const isOver = item.is_overbudget;

                  return (
                    <div
                      key={item.category_id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: isOver ? '2px solid #ff4d4f' : '1px solid #f0f0f0',
                        background: isOver ? '#fff2f0' : '#fafafa',
                        animation: isOver ? 'overbudgetBlink 1.5s ease-in-out infinite' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Space>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>
                            {item.category_name}
                          </span>
                          {isOver && (
                            <Tag color="error" icon={<ExclamationCircleOutlined />}>
                              超支
                            </Tag>
                          )}
                        </Space>
                        <Space size="large">
                          <span style={{ color: '#999', fontSize: 13 }}>
                            预算 ¥{item.budget_amount.toFixed(2)}
                          </span>
                          <span style={{ color: '#ff4d4f', fontSize: 13 }}>
                            已花 ¥{item.spent.toFixed(2)}
                          </span>
                          <span style={{ color: item.remaining >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13, fontWeight: 600 }}>
                            {item.remaining >= 0 ? '剩余' : '超支'} ¥{Math.abs(item.remaining).toFixed(2)}
                          </span>
                        </Space>
                      </div>
                      <Progress
                        percent={percent}
                        strokeColor={color}
                        trailColor="#f0f0f0"
                        size="small"
                        format={() => `${percent}%`}
                      />
                    </div>
                  );
                })}
              </Space>
            </Card>

            <Card title="预算列表" size="small" style={{ marginTop: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {budgets.map((b) => {
                  const cat = categories.find((c) => c.id === b.category_id);
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #f0f0f0',
                      }}
                    >
                      <Space>
                        <Tag color="blue">{cat?.name || `分类#${b.category_id}`}</Tag>
                        <span style={{ fontWeight: 600 }}>¥{b.amount.toFixed(2)}</span>
                      </Space>
                      <Space>
                        <Button type="link" size="small" onClick={() => openEdit(b)}>
                          编辑
                        </Button>
                        <Popconfirm title="确定删除此预算？" onConfirm={() => handleDelete(b.id)}>
                          <Button type="link" size="small" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  );
                })}
              </Space>
            </Card>
          </>
        ) : (
          !loading && (
            <Empty
              description={`暂无${year}年${month}月预算，请点击「新建预算」设置`}
              style={{ padding: 60 }}
            />
          )
        )}
      </Spin>

      <Modal
        title={editItem ? '编辑预算' : '新建预算'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditItem(null);
          form.resetFields();
        }}
        destroyOnClose
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="category_id"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select
              disabled={!!editItem}
              options={availableCategories.map((c) => ({
                label: c.name,
                value: c.id,
              }))}
              placeholder="选择支出分类"
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="预算额度"
            rules={[{ required: true, message: '请输入预算额度' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.01} step={100} prefix="¥" precision={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
