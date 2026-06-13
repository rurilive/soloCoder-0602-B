import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { categoryApi } from '../services/api';

export default function Categories({ currentLedger }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const cats = await categoryApi.list({ ledger_id: currentLedger.id });
      setData(cats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentLedger]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, ledger_id: currentLedger.id };
    if (editItem) {
      await categoryApi.update(editItem.id, payload);
      message.success('更新成功');
    } else {
      await categoryApi.create(payload);
      message.success('添加成功');
    }
    setModalOpen(false);
    setEditItem(null);
    form.resetFields();
    fetchData();
  };

  const handleDelete = async (id) => {
    await categoryApi.delete(id);
    message.success('删除成功');
    fetchData();
  };

  const openEdit = (record) => {
    setEditItem(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openCreate = (type) => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ type });
    setModalOpen(true);
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100,
      render: (t) => <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>,
    },
    { title: '图标', dataIndex: 'icon', key: 'icon', width: 100 },
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

  const incomeData = data.filter((c) => c.type === 'income');
  const expenseData = data.filter((c) => c.type === 'expense');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate('income')}>添加收入分类</Button>
        <Button icon={<PlusOutlined />} onClick={() => openCreate('expense')}>添加支出分类</Button>
      </div>
      <h3 style={{ marginBottom: 12 }}>收入分类</h3>
      <Table columns={columns} dataSource={incomeData} rowKey="id" loading={loading} pagination={false} size="small" style={{ marginBottom: 24 }} />
      <h3 style={{ marginBottom: 12 }}>支出分类</h3>
      <Table columns={columns} dataSource={expenseData} rowKey="id" loading={loading} pagination={false} size="small" />
      <Modal title={editItem ? '编辑分类' : '添加分类'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditItem(null); }} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="income">收入</Select.Option>
              <Select.Option value="expense">支出</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="如: coffee, car, home" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
