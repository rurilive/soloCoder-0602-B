import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Tag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { transactionApi, categoryApi, accountApi } from '../services/api';

export default function Transactions({ currentLedger }) {
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();
  const [filterMonth, setFilterMonth] = useState(dayjs());

  const fetchData = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const [txs, cats, accs] = await Promise.all([
        transactionApi.list({ ledger_id: currentLedger.id, year: filterMonth.year(), month: filterMonth.month() + 1 }),
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

  useEffect(() => { fetchData(); }, [currentLedger, filterMonth]);

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

  const openEdit = (record) => {
    setEditItem(record);
    form.setFieldsValue({ ...record, date: dayjs(record.date) });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    const defaultAcc = accounts.find((a) => a.is_default);
    form.setFieldsValue({ type: 'expense', date: dayjs(), account_id: defaultAcc?.id });
    setModalOpen(true);
  };

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c.name; });

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (t) => <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>,
    },
    { title: '分类', dataIndex: 'category_id', key: 'category_id', width: 100, render: (id) => catMap[id] || id },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v, r) => (
        <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {r.type === 'income' ? '+' : '-'}¥{v.toFixed(2)}
        </span>
      ),
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <DatePicker picker="month" value={filterMonth} onChange={setFilterMonth} allowClear={false} />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加记录</Button>
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
          <Form.Item name="account_id" label="账户">
            <Select allowClear placeholder="请选择账户">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} (¥{a.balance.toFixed(2)})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} prefix="¥" />
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
