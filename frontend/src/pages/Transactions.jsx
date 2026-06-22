import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Tag as AntTag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, DownloadOutlined, TagsOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { transactionApi, categoryApi, accountApi, tagApi, CURRENCY_SYMBOLS, CURRENCY_OPTIONS, formatCurrency, exportApi } from '../services/api';

const TAG_COLORS = ['#52c41a', '#1890ff', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'];

export default function Transactions({ currentLedger }) {
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();
  const [tagForm] = Form.useForm();
  const [filterMonth, setFilterMonth] = useState(dayjs());
  const [filterType, setFilterType] = useState();
  const [filterCategoryId, setFilterCategoryId] = useState();
  const [filterTagIds, setFilterTagIds] = useState([]);

  const fetchData = async () => {
    if (!currentLedger) return;
    setLoading(true);
    try {
      const params = {
        ledger_id: currentLedger.id,
        year: filterMonth.year(),
        month: filterMonth.month() + 1,
        type: filterType,
        category_id: filterCategoryId,
      };
      if (filterTagIds && filterTagIds.length > 0) {
        params.tag_ids = filterTagIds.join(',');
      }
      const [txs, cats, accs, tagList] = await Promise.all([
        transactionApi.list(params),
        categoryApi.list({ ledger_id: currentLedger.id }),
        accountApi.list({ ledger_id: currentLedger.id }),
        tagApi.list({ ledger_id: currentLedger.id }),
      ]);
      setData(txs);
      setCategories(cats);
      setAccounts(accs);
      setTags(tagList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentLedger, filterMonth, filterType, filterCategoryId, filterTagIds]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const selectedTagIds = values.tag_ids || [];
    const payload = {
      ...values,
      date: values.date.format('YYYY-MM-DD'),
      ledger_id: currentLedger.id,
      tag_ids: selectedTagIds,
    };
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
      const params = {
        ledger_id: currentLedger.id,
        year: filterMonth.year(),
        month: filterMonth.month() + 1,
        type: filterType,
        category_id: filterCategoryId,
      };
      if (filterTagIds && filterTagIds.length > 0) {
        params.tag_ids = filterTagIds.join(',');
      }
      await exportApi.transactions(params);
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
      tag_ids: (record.tags || []).map((t) => t.id),
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ type: 'expense', date: dayjs(), account_id: defaultAccount?.id, tag_ids: [] });
    setModalOpen(true);
  };

  const handleCreateTag = async () => {
    const values = await tagForm.validateFields();
    try {
      const newTag = await tagApi.create({ ...values, ledger_id: currentLedger.id });
      message.success('标签创建成功');
      setTags([...tags, newTag]);
      const currentTagIds = form.getFieldValue('tag_ids') || [];
      form.setFieldsValue({ tag_ids: [...currentTagIds, newTag.id] });
      setTagModalOpen(false);
      tagForm.resetFields();
    } catch (e) {
      message.error('创建失败: ' + e.message);
    }
  };

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c.name; });
  const accountMap = {};
  accounts.forEach((a) => { accountMap[a.id] = a; });
  const accountCurrencyMap = {};
  accounts.forEach((a) => { accountCurrencyMap[a.id] = a.currency; });
  const tagMap = {};
  tags.forEach((t) => { tagMap[t.id] = t; });

  const defaultAccount = accounts.find((a) => a.is_default) || accounts[0];

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  const selectedAccountId = Form.useWatch('account_id', form);

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (t) => <AntTag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</AntTag>,
    },
    { title: '分类', dataIndex: 'category_id', key: 'category_id', width: 100, render: (id) => catMap[id] || id },
    {
      title: '账户', dataIndex: 'account_id', key: 'account_id', width: 110,
      render: (id) => {
        const acc = accountMap[id];
        if (!acc) return id;
        return <span>{acc.name} <AntTag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{acc.currency}</AntTag></span>;
      },
    },
    {
      title: '标签', dataIndex: 'tags', key: 'tags', width: 200,
      render: (tagList) => {
        if (!tagList || tagList.length === 0) return <span style={{ color: '#999' }}>-</span>;
        return (
          <Space wrap size={4}>
            {tagList.map((t) => (
              <AntTag key={t.id} color={t.color} style={{ margin: 0 }}>{t.name}</AntTag>
            ))}
          </Space>
        );
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
          <Select
            mode="multiple"
            placeholder="筛选标签(任一匹配)"
            style={{ minWidth: 200, maxWidth: 360 }}
            allowClear
            value={filterTagIds}
            onChange={setFilterTagIds}
            maxTagCount="responsive"
            tagRender={(props) => {
              const { label, value, closable, onClose } = props;
              const tag = tags.find((t) => t.id === value);
              return (
                <AntTag
                  color={tag?.color}
                  closable={closable}
                  onClose={onClose}
                  style={{ marginInlineEnd: 4 }}
                >
                  {label}
                </AntTag>
              );
            }}
          >
            {tags.map((t) => (
              <Select.Option key={t.id} value={t.id} label={t.name}>
                <Space>
                  <AntTag color={t.color}>{t.name}</AntTag>
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Space>
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => { tagForm.resetFields(); setTagModalOpen(true); }}>
            新建标签
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加记录</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} />

      <Modal title={editItem ? '编辑记录' : '添加记录'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditItem(null); }} destroyOnClose width={520}>
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
          <Form.Item name="tag_ids" label="标签">
            <Select
              mode="multiple"
              placeholder="选择标签，可多选"
              allowClear
              maxTagCount="responsive"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div
                    style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', cursor: 'pointer', color: '#1890ff' }}
                    onClick={() => { tagForm.resetFields(); setTagModalOpen(true); }}
                  >
                    <PlusOutlined /> 新建标签
                  </div>
                </>
              )}
              tagRender={(props) => {
                const { label, value, closable, onClose } = props;
                const tag = tags.find((t) => t.id === value);
                return (
                  <AntTag
                    color={tag?.color}
                    closable={closable}
                    onClose={onClose}
                    style={{ marginInlineEnd: 4 }}
                  >
                    {label}
                  </AntTag>
                );
              }}
            >
              {tags.map((t) => (
                <Select.Option key={t.id} value={t.id} label={t.name}>
                  <Space>
                    <AntTag color={t.color}>{t.name}</AntTag>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建标签"
        open={tagModalOpen}
        onOk={handleCreateTag}
        onCancel={() => { setTagModalOpen(false); tagForm.resetFields(); }}
        destroyOnClose
        zIndex={2000}
        centered
        width={400}
      >
        <Form form={tagForm} layout="vertical">
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input placeholder="如：必需、可选、投资等" maxLength={20} />
          </Form.Item>
          <Form.Item name="color" label="标签颜色" rules={[{ required: true }]} initialValue={TAG_COLORS[0]}>
            <Select>
              {TAG_COLORS.map((c) => (
                <Select.Option key={c} value={c}>
                  <Space>
                    <span style={{
                      display: 'inline-block',
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: c,
                      verticalAlign: 'middle',
                    }} />
                    <span>{c}</span>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
