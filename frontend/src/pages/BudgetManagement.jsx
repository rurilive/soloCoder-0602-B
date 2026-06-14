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
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
  BulbOutlined,
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

  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);

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
      if (editItem.budget_id != null) {
        await budgetApi.update(editItem.budget_id, { amount: values.amount });
      } else {
        await budgetApi.create(payload);
      }
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

  const handleSuggest = async () => {
    if (!currentLedger) return;
    setSuggestLoading(true);
    try {
      const data = await budgetApi.suggest({
        ledger_id: currentLedger.id,
        year,
        month,
      });
      setSuggestions(data.suggestions);
      const defaultSelected = data.suggestions
        .filter((s) => !s.has_existing_budget && s.suggested_amount > 0)
        .map((s) => s.category_id);
      setSelectedCategoryIds(defaultSelected);
      setSuggestModalOpen(true);
    } catch (err) {
      message.error(err.message || '获取建议失败');
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleSuggestConfirm = async () => {
    if (selectedCategoryIds.length === 0) {
      message.warning('请至少选择一个分类');
      return;
    }
    const items = suggestions
      .filter((s) => selectedCategoryIds.includes(s.category_id))
      .map((s) => ({
        category_id: s.category_id,
        amount: s.suggested_amount,
      }));
    setConfirmLoading(true);
    try {
      const result = await budgetApi.batchCreate({
        ledger_id: currentLedger.id,
        year,
        month,
        items,
      });
      message.success(`成功创建 ${result.created_count} 条预算${result.skipped_count > 0 ? `，跳过 ${result.skipped_count} 条已有预算` : ''}`);
      setSuggestModalOpen(false);
      fetchProgress();
      fetchBudgets();
    } catch (err) {
      message.error(err.message || '批量创建失败');
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const selectAll = () => {
    const allIds = suggestions
      .filter((s) => !s.has_existing_budget)
      .map((s) => s.category_id);
    setSelectedCategoryIds(allIds);
  };

  const clearSelection = () => {
    setSelectedCategoryIds([]);
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
      amount: item.budget_amount > 0 ? item.budget_amount : undefined,
    });
    setModalOpen(true);
  };

  const existingCategoryIds = budgets.map((b) => b.category_id);

  const availableCategories = editItem && editItem.budget_id != null
    ? categories.filter((c) => c.id === editItem.category_id)
    : categories.filter((c) => !existingCategoryIds.includes(c.id));

  const budgetedItems = (progress?.items || []).filter((i) => i.has_budget);
  const unbudgetedItems = (progress?.items || []).filter((i) => !i.has_budget);

  const renderBudgetedItem = (item) => {
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
            <Button type="link" size="small" onClick={() => openEdit(item)}>
              编辑
            </Button>
            <Popconfirm title="确定删除此预算？" onConfirm={() => handleDelete(item.budget_id)}>
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
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
  };

  const renderUnbudgetedItem = (item) => (
    <div
      key={item.category_id}
      style={{
        padding: '10px 16px',
        borderRadius: 8,
        border: '1px dashed #d9d9d9',
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <span style={{ fontWeight: 500, fontSize: 14, color: '#666' }}>
            {item.category_name}
          </span>
          <Tag color="default">未设预算</Tag>
          {item.spent > 0 && (
            <span style={{ color: '#ff4d4f', fontSize: 13 }}>
              本月已花 ¥{item.spent.toFixed(2)}
            </span>
          )}
        </Space>
        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => openEdit(item)}
        >
          设置预算
        </Button>
      </div>
    </div>
  );

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
        <Button icon={<BulbOutlined />} onClick={handleSuggest}>
          智能建议
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchProgress}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {progress && progress.items.length > 0 ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col flex="1">
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
              <Col flex="1">
                <Card size="small">
                  <Statistic
                    title="已设预算分类支出"
                    value={progress.total_spent}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col flex="1">
                <Tooltip title="这些分类尚未设置月度预算，支出不受预算控制">
                  <Card size="small">
                    <Statistic
                      title="未设预算分类支出"
                      value={progress.unbudgeted_spent || 0}
                      prefix={<DollarOutlined />}
                      precision={2}
                      valueStyle={{ color: '#d48806' }}
                    />
                  </Card>
                </Tooltip>
              </Col>
              <Col flex="1">
                <Card size="small">
                  <Statistic
                    title="预算内剩余"
                    value={progress.total_remaining}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{ color: progress.total_remaining >= 0 ? '#52c41a' : '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col flex="1">
                <Card size="small">
                  <Statistic
                    title="超支分类"
                    value={progress.overbudget_count}
                    prefix={progress.overbudget_count > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
                    valueStyle={{ color: progress.overbudget_count > 0 ? '#ff4d4f' : '#52c41a' }}
                    suffix={`/ ${budgetedItems.length}`}
                  />
                </Card>
              </Col>
            </Row>

            <Card title={`已设预算 (${budgetedItems.length})`} size="small">
              {budgetedItems.length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {budgetedItems.map(renderBudgetedItem)}
                </Space>
              ) : (
                <Empty description="暂无已设置的预算" style={{ padding: 20 }} />
              )}
            </Card>

            {unbudgetedItems.length > 0 && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Card
                  title={
                    <span style={{ color: '#888' }}>
                      未设预算 ({unbudgetedItems.length})
                    </span>
                  }
                  size="small"
                  style={{ borderStyle: 'dashed' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {unbudgetedItems.map(renderUnbudgetedItem)}
                  </Space>
                </Card>
              </>
            )}
          </>
        ) : (
          !loading && (
            <Empty
              description={`该账本暂无支出分类，请先创建支出分类`}
              style={{ padding: 60 }}
            />
          )
        )}
      </Spin>

      <Modal
        title={editItem ? (editItem.budget_id != null ? '编辑预算' : '设置预算') : '新建预算'}
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
              disabled={!!(editItem && editItem.budget_id != null)}
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

      <Modal
        title={
          <Space>
            <BulbOutlined style={{ color: '#faad14' }} />
            <span>智能预算建议</span>
          </Space>
        }
        open={suggestModalOpen}
        onOk={handleSuggestConfirm}
        onCancel={() => setSuggestModalOpen(false)}
        okText="确认创建"
        cancelText="取消"
        width={600}
        confirmLoading={confirmLoading}
      >
        <Spin spinning={suggestLoading}>
          {suggestions.length > 0 ? (
            <>
              <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                根据近 <Tag color="blue">{suggestions[0]?.months_available || 0} 个月</Tag> 的支出数据，为您推荐以下预算额度：
              </div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                <Button size="small" onClick={selectAll}>全选可创建</Button>
                <Button size="small" onClick={clearSelection}>清空</Button>
                <span style={{ color: '#999', fontSize: 12, lineHeight: '24px' }}>
                  已选 {selectedCategoryIds.length} 项
                </span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {suggestions.map((s) => {
                    const isSelected = selectedCategoryIds.includes(s.category_id);
                    const isDisabled = s.has_existing_budget;
                    return (
                      <div
                        key={s.category_id}
                        onClick={() => !isDisabled && toggleCategory(s.category_id)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: 6,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          background: isSelected ? '#e6f4ff' : '#fafafa',
                          border: `1px solid ${isSelected ? '#91caff' : '#f0f0f0'}`,
                          opacity: isDisabled ? 0.5 : 1,
                        }}
                      >
                        <Space>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => {}}
                            style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                          />
                          <span style={{ fontWeight: 500 }}>{s.category_name}</span>
                          {isDisabled && <Tag color="default" style={{ marginLeft: 8 }}>已有预算</Tag>}
                        </Space>
                        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
                          <span style={{ fontWeight: 600, color: '#1677ff', fontSize: 16 }}>
                            ¥{s.suggested_amount.toFixed(2)}
                          </span>
                          <span style={{ color: '#999', fontSize: 11 }}>
                            月均 · {s.months_available} 个月数据
                          </span>
                        </Space>
                      </div>
                    );
                  })}
                </Space>
              </div>
            </>
          ) : (
            <Empty description="暂无建议数据" style={{ padding: 40 }} />
          )}
        </Spin>
      </Modal>
    </div>
  );
}
