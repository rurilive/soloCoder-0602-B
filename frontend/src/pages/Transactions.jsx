import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Tag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { transactionApi, categoryApi, accountApi, CURRENCY_SYMBOLS, CURRENCY_OPTIONS, formatCurrency, exportApi } from '../services/api';

export default function Transactions({ currentLedger }) {
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();
  const [filterMonth, setFilterMonth] = useState(dayjs());
  const [filterType, setFilterType] = useState();
  const [filterCategoryId, setFilterCategoryId] = useState();

  const fetchData = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const [txs, cats, accs] = await Promise.all([
        transactionApi.list({
          ledger_id: currentLedger.id,
          year: filterMonth.year(),
          month: filterMonth.month() + 1,
          type: filterType,
          category_id: filterCategoryId,
        }),
        categoryApi.list({ ledger_id: currentLedger.id }),
        accountApi.list({ ledger_id: currentLedger.id }),
      ]);
      setData(txs);
      setCategories(cats);
      setAccounts(accs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentLedger, filterMonth, filterType, filterCategoryId]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, date: values.date.format('YYYY-MM-DD'), ledger_id: currentLedger.id };
    if (editItem) {
      await transactionApi.update(editItem.id, payload);
      message.success('更新成功');
    } else {
      await transactionApi.create(payload);
      message.success('添加成功');
    }
    setModalOpen(false);
    setEditItem(null);
    form.resetFields();
    fetchData();
  };

  const handleDelete = async (id) => {
    await transactionApi.delete(id);
    message.success('删除成功');
    fetchData();
  };

  const handleExport = async () => {
    if (!currentLedger) return;
    try {
      message.loading({ content: '正在导出...', key: 'export' });
      await exportApi.transactions({
        ledger_id: currentLedger.id,
        year: filterMonth.year(),
        month: filterMonth.month() + 1,
        type: filterType,
        category_id: filterCategoryId,
      });
      message.success({ content: '导出成功', key: 'export' });
    } catch (e) {
      message.error({ content: '导出失败: ' + e.message, key: 'export' });
    }
  };

  const openEdit = (record) => {
    setEditItem(record);
    form.setFieldsValue({
      ...record,
      date: dayjs(record.date),
      account_id: record.account_id ?? defaultAccount?.id,
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ type: 'expense', date: dayjs(), account_id: defaultAccount?.id });
    setModalOpen(true);
  };

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c.name; });
  const accountMap = {};
  accounts.forEach((a) => { accountMap[a.id] = a; });
  const accountCurrencyMap = {};
  accounts.forEach((a) => { accountCurrencyMap[a.id] = a.currency; });

  const defaultAccount = accounts.find((a) => a.is_default) || accounts[0];

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  const selectedAccountId = Form.useWatch('account_id', form);

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (t) => <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>,
    },
    { title: '分类', dataIndex: 'category_id', key: 'category_id', width: 100, render: (id) => catMap[id] || id },
    {
      title: '账户', dataIndex: 'account_id', key: 'account_id', width: 110,
      render: (id) => {
        const acc = accountMap[id];
        if (!acc) return id;
        return <span>{acc.name} <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{acc.currency}</Tag></span>;
      },
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v, r) => {
        const cur = accountCurrencyMap[r.account_id] || 'CNY';
        return (
          <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
            {r.type === 'income' ? '+' : '-'}{formatCurrency(v, cur)}
          </span>
        );
      },
    },
    {
      title: '操作', key: 'action', width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const selectedType = Form.useWatch('type', form);
  const selectedAccountObj = accounts.find((a) => a.id === selectedAccountId);
  const selectedCurrency = selectedAccountObj?.currency || 'CNY';

  const filterCategories = filterType
    ? categories.filter((c) => c.type === filterType)
    : categories;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space wrap>
          <DatePicker picker="month" value={filterMonth} onChange={setFilterMonth} allowClear={false} />
          <Select
            placeholder="筛选类型"
            style={{ width: 120 }}
            allowClear
            value={filterType}
            onChange={(v) => { setFilterType(v); setFilterCategoryId(undefined); }}
          >
            <Select.Option value="income">收入</Select.Option>
            <Select.Option value="expense">支出</Select.Option>
          </Select>
          <Select
            placeholder="筛选分类"
            style={{ width: 140 }}
            allowClear
            value={filterCategoryId}
            onChange={setFilterCategoryId}
            showSearch
            optionFilterProp="label"
          >
            {filterCategories.map((c) => (
              <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
            ))}
          </Select>
        </Space>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加记录</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} />
      <Modal title={editItem ? '编辑记录' : '添加记录'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditItem(null); }} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="income">收入</Select.Option>
              <Select.Option value="expense">支出</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="category_id" label="分类" rules={[{ required: true }]}>
            <Select>
              {(selectedType === 'income' ? incomeCats : expenseCats).map((c) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="account_id" label="账户" rules={[{ required: true, message: '请选择账户' }]}>
            <Select placeholder="请选择账户">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} ({a.currency} {formatCurrency(a.balance, a.currency)})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label={`金额 (${selectedCurrency})`} rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} prefix={CURRENCY_SYMBOLS[selectedCurrency]} />
          </Form.Item>
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
