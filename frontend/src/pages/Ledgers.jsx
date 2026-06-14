import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ledgerApi, CURRENCY_OPTIONS, CURRENCY_NAMES, CURRENCY_SYMBOLS } from '../services/api';

export default function Ledgers({ currentLedger, onSwitch }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const ledgers = await ledgerApi.list();
      setData(ledgers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editItem) {
      await ledgerApi.update(editItem.id, values);
      message.success('更新成功');
    } else {
      await ledgerApi.create(values);
      message.success('添加成功');
    }
    setModalOpen(false);
    setEditItem(null);
    form.resetFields();
    fetchData();
  };

  const handleDelete = async (id) => {
    await ledgerApi.delete(id);
    message.success('删除成功');
    if (currentLedger?.id === id) onSwitch(null);
    fetchData();
  };

  const openEdit = (record) => {
    setEditItem(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ type: 'personal', base_currency: 'CNY' });
    setModalOpen(true);
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 120,
      render: (t) => {
        const map = { personal: '个人', family: '家庭', travel: '旅行' };
        const colorMap = { personal: 'blue', family: 'green', travel: 'orange' };
        return <Tag color={colorMap[t] || 'default'}>{map[t] || t}</Tag>;
      },
    },
    {
      title: '本位币', dataIndex: 'base_currency', key: 'base_currency', width: 100,
      render: (c) => <Tag color="purple">{CURRENCY_SYMBOLS[c]} {c}</Tag>,
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '操作', key: 'action', width: 220,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => onSwitch(record)} disabled={currentLedger?.id === record.id}>
            {currentLedger?.id === record.id ? '当前' : '切换'}
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？关联数据也会被删除" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建账本</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={false} />
      <Modal title={editItem ? '编辑账本' : '新建账本'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditItem(null); }} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="personal">个人</Select.Option>
              <Select.Option value="family">家庭</Select.Option>
              <Select.Option value="travel">旅行</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="base_currency" label="本位币" rules={[{ required: true, message: '请选择本位币' }]}>
            <Select options={CURRENCY_OPTIONS} placeholder="选择本位币" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
