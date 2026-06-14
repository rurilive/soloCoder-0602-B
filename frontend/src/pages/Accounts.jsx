import { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Popconfirm, Tag, Table, message, Statistic, Switch } from 'antd';
import { PlusOutlined, SwapOutlined, WalletOutlined, BankOutlined, PayCircleOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { accountApi, transferApi } from '../services/api';

const ACCOUNT_TYPE_MAP = {
  cash: { label: '现金', color: '#52c41a', icon: <WalletOutlined /> },
  bank: { label: '银行卡', color: '#1677ff', icon: <BankOutlined /> },
  ewallet: { label: '电子钱包', color: '#722ed1', icon: <PayCircleOutlined /> },
  other: { label: '其他', color: '#fa8c16', icon: <WalletOutlined /> },
};

export default function Accounts({ currentLedger }) {
  const [accounts, setAccounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [accountForm] = Form.useForm();
  const [transferForm] = Form.useForm();

  const fetchData = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const [accs, txfs] = await Promise.all([
        accountApi.list({ ledger_id: currentLedger.id }),
        transferApi.list({ ledger_id: currentLedger.id }),
      ]);
      setAccounts(accs);
      setTransfers(txfs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentLedger]);

  const handleAccountSubmit = async () => {
    const values = await accountForm.validateFields();
    const payload = { ...values, ledger_id: currentLedger.id };
    if (editItem) {
      await accountApi.update(editItem.id, payload);
      message.success('更新成功');
    } else {
      await accountApi.create(payload);
      message.success('添加成功');
    }
    setAccountModalOpen(false);
    setEditItem(null);
    accountForm.resetFields();
    fetchData();
  };

  const handleDelete = async (id) => {
    try {
      const result = await accountApi.delete(id);
      if (result.can_delete === false) {
        Modal.confirm({
          title: '确认删除',
          content: result.message + '。删除后关联交易的账户信息将被清除，关联转账记录将被删除。是否继续？',
          okText: '强制删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            await accountApi.delete(id, true);
            message.success('删除成功');
            fetchData();
          },
        });
      } else {
        message.success('删除成功');
        fetchData();
      }
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const handleTransferSubmit = async () => {
    const values = await transferForm.validateFields();
    const payload = {
      ...values,
      date: values.date.format('YYYY-MM-DD'),
      ledger_id: currentLedger.id,
    };
    try {
      await transferApi.create(payload);
      message.success('转账成功');
      setTransferModalOpen(false);
      transferForm.resetFields();
      fetchData();
    } catch (err) {
      message.error(err.message || '转账失败');
    }
  };

  const handleTransferDelete = async (id) => {
    await transferApi.delete(id);
    message.success('删除成功');
    fetchData();
  };

  const openEditAccount = (record) => {
    setEditItem(record);
    accountForm.setFieldsValue({
      name: record.name,
      type: record.type,
      icon: record.icon,
      initial_balance: record.initial_balance,
      is_default: record.is_default,
    });
    setAccountModalOpen(true);
  };

  const openCreateAccount = () => {
    setEditItem(null);
    accountForm.resetFields();
    accountForm.setFieldsValue({ type: 'cash', icon: 'wallet', initial_balance: 0, is_default: false });
    setAccountModalOpen(true);
  };

  const openTransfer = () => {
    transferForm.resetFields();
    transferForm.setFieldsValue({ date: dayjs() });
    setTransferModalOpen(true);
  };

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const transferColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '转出', key: 'from', width: 120,
      render: (_, r) => <span style={{ color: '#cf1322' }}>{r.from_account_name}</span>,
    },
    {
      title: '转入', key: 'to', width: 120,
      render: (_, r) => <span style={{ color: '#3f8600' }}>{r.to_account_name}</span>,
    },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v) => <span style={{ fontWeight: 'bold' }}>¥{v.toFixed(2)}</span>,
    },
    { title: '备注', dataIndex: 'note', key: 'note' },
    {
      title: '操作', key: 'action', width: 80,
      render: (_, record) => (
        <Popconfirm title="确定删除此转账记录？" onConfirm={() => handleTransferDelete(record.id)}>
          <Button type="link" size="small" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Statistic title="总资产" value={totalBalance} prefix="¥" valueStyle={{ color: '#1677ff', fontSize: 28 }} />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAccount}>新增账户</Button>
          <Button icon={<SwapOutlined />} onClick={openTransfer} disabled={accounts.length < 2}>转账</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {accounts.map((account) => {
          const typeInfo = ACCOUNT_TYPE_MAP[account.type] || ACCOUNT_TYPE_MAP.other;
          return (
            <Col key={account.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                style={{ borderTop: `3px solid ${typeInfo.color}` }}
                actions={[
                  <EditOutlined key="edit" onClick={() => openEditAccount(account)} />,
                  <Popconfirm
                    key="delete"
                    title="确定删除此账户？"
                    onConfirm={() => handleDelete(account.id)}
                  >
                    <DeleteOutlined style={{ color: '#ff4d4f' }} />
                  </Popconfirm>,
                ]}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 24, color: typeInfo.color, marginRight: 8 }}>{typeInfo.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {account.name}
                      {account.is_default && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>默认</Tag>}
                    </div>
                    <Tag color={typeInfo.color} style={{ marginTop: 2 }}>{typeInfo.label}</Tag>
                  </div>
                </div>
                <Statistic
                  value={account.balance}
                  prefix="¥"
                  precision={2}
                  valueStyle={{ color: account.balance >= 0 ? '#3f8600' : '#cf1322', fontSize: 22 }}
                />
                {account.initial_balance !== 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                    初始余额: ¥{account.initial_balance.toFixed(2)}
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {transfers.length > 0 && (
        <Card title="转账记录" style={{ marginBottom: 16 }}>
          <Table columns={transferColumns} dataSource={transfers} rowKey="id" pagination={{ pageSize: 10 }} size="small" />
        </Card>
      )}

      <Modal
        title={editItem ? '编辑账户' : '新增账户'}
        open={accountModalOpen}
        onOk={handleAccountSubmit}
        onCancel={() => { setAccountModalOpen(false); setEditItem(null); }}
        destroyOnClose
      >
        <Form form={accountForm} layout="vertical">
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
            <Input placeholder="如：招商银行卡" />
          </Form.Item>
          <Form.Item name="type" label="账户类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="cash">现金</Select.Option>
              <Select.Option value="bank">银行卡</Select.Option>
              <Select.Option value="ewallet">电子钱包</Select.Option>
              <Select.Option value="other">其他</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Select>
              <Select.Option value="wallet">钱包</Select.Option>
              <Select.Option value="credit-card">银行卡</Select.Option>
              <Select.Option value="money-collect">现金</Select.Option>
              <Select.Option value="alipay-circle">支付宝</Select.Option>
              <Select.Option value="pay-circle">微信</Select.Option>
              <Select.Option value="bank">银行</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="initial_balance" label="初始余额" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="¥" disabled={!!editItem} />
          </Form.Item>
          <Form.Item name="is_default" label="设为默认账户" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="转账"
        open={transferModalOpen}
        onOk={handleTransferSubmit}
        onCancel={() => setTransferModalOpen(false)}
        destroyOnClose
        width={480}
      >
        <Form form={transferForm} layout="vertical">
          <Form.Item name="from_account_id" label="转出账户" rules={[{ required: true, message: '请选择转出账户' }]}>
            <Select placeholder="选择转出账户">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} (¥{a.balance.toFixed(2)})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="to_account_id" label="转入账户" rules={[{ required: true, message: '请选择转入账户' }]}>
            <Select placeholder="选择转入账户">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} (¥{a.balance.toFixed(2)})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="转账金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item name="date" label="转账日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input placeholder="转账原因或备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
