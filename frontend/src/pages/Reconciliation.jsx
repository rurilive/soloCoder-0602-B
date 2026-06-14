import { useState, useRef, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  Upload,
  Select,
  Space,
  Tag,
  Statistic,
  Modal,
  message,
  Checkbox,
  Tabs,
  Typography,
  Divider,
  Tooltip,
} from 'antd';
import {
  UploadOutlined,
  ImportOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UnorderedListOutlined,
  BankOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import {
  reconciliationApi,
  accountApi,
  categoryApi,
  formatCurrency,
} from '../services/api';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option, OptGroup } = Select;
const { TabPane } = Tabs;

export default function Reconciliation({ currentLedger }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState(null);
  const [incomeCategoryId, setIncomeCategoryId] = useState(null);

  const [uploaded, setUploaded] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedBankRows, setSelectedBankRows] = useState([]);
  const [activeTab, setActiveTab] = useState('matched');

  const [manualMode, setManualMode] = useState(false);
  const [selectedBank, setSelectedBank] = useState(null);
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [selectedBankForManual, setSelectedBankForManual] = useState([]);
  const [selectedSystemForManual, setSelectedSystemForManual] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [unmatchedBank, setUnmatchedBank] = useState([]);
  const [unmatchedSystem, setUnmatchedSystem] = useState([]);

  const fileInputRef = useRef(null);

  const fetchRefData = async () => {
    if (!currentLedger) return;
    const [accs, cats] = await Promise.all([
      accountApi.list({ ledger_id: currentLedger.id }),
      categoryApi.list({ ledger_id: currentLedger.id }),
    ]);
    setAccounts(accs);
    setCategories(cats);
    const defaultAcc = accs.find((a) => a.is_default) || accs[0];
    if (defaultAcc) setSelectedAccount(defaultAcc.id);
    const defaultExp = cats.find((c) => c.type === 'expense' && c.is_default)
      || cats.find((c) => c.type === 'expense');
    if (defaultExp) setExpenseCategoryId(defaultExp.id);
    const defaultInc = cats.find((c) => c.type === 'income' && c.is_default)
      || cats.find((c) => c.type === 'income');
    if (defaultInc) setIncomeCategoryId(defaultInc.id);
  };

  useEffect(() => { fetchRefData(); }, [currentLedger]);

  const handleUpload = async (file) => {
    if (!currentLedger) {
      message.error('请先选择账本');
      return false;
    }
    if (!selectedAccount) {
      message.error('请先选择默认账户');
      return false;
    }
    setLoading(true);
    try {
      const result = await reconciliationApi.upload(file, currentLedger.id);
      setUploadResult(result);
      setMatchedPairs(result.matched_pairs);
      setUnmatchedBank(result.unmatched_bank);
      setUnmatchedSystem(result.unmatched_system);
      setUploaded(true);
      setSelectedBankRows([]);
      message.success(
        `解析成功：共 ${result.total_bank_records} 条银行记录，自动匹配 ${result.matched_count} 对`
      );
    } catch (e) {
      message.error(e.message || '上传失败');
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleImport = async () => {
    if (!selectedBankRows.length) {
      message.warning('请先选择要导入的记录');
      return;
    }
    if (!selectedAccount) {
      message.error('请选择账户');
      return;
    }

    const selectedRecords = unmatchedBank.filter((r) => selectedBankRows.includes(r.row_index));
    const hasExpense = selectedRecords.some((r) => r.type === 'expense');
    const hasIncome = selectedRecords.some((r) => r.type === 'income');

    if (hasExpense && !expenseCategoryId) {
      message.error('选中的记录包含支出，请选择支出分类');
      return;
    }
    if (hasIncome && !incomeCategoryId) {
      message.error('选中的记录包含收入，请选择收入分类');
      return;
    }

    Modal.confirm({
      title: '确认导入',
      content: (
        <div>
          <p>将导入 <Text strong>{selectedBankRows.length}</Text> 条记录为新交易：</p>
          <ul>
            {hasExpense && (
              <li>支出记录：使用支出分类（支出分类ID: {expenseCategoryId}）</li>
            )}
            {hasIncome && (
              <li>收入记录：使用收入分类（收入分类ID: {incomeCategoryId}）</li>
            )}
          </ul>
          <p>使用数据库事务保证原子性，失败将全部回滚。是否继续？</p>
        </div>
      ),
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        setImporting(true);
        try {
          const records = selectedRecords.map((r) => ({
            date: r.date,
            amount: r.amount,
            type: r.type,
            description: r.description,
          }));

          const payload = {
            ledger_id: currentLedger.id,
            account_id: selectedAccount,
            records,
          };
          if (hasExpense) payload.expense_category_id = expenseCategoryId;
          if (hasIncome) payload.income_category_id = incomeCategoryId;

          const result = await reconciliationApi.import(payload);

          message.success(
            `导入成功：${result.imported_count} 条已导入，${result.skipped_count} 条跳过`
          );

          setUnmatchedBank(
            unmatchedBank.filter((r) => !selectedBankRows.includes(r.row_index))
          );
          setSelectedBankRows([]);
        } catch (e) {
          message.error(e.message || '导入失败');
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const handleManualMatch = () => {
    const hasSingleSelect = !!selectedBank && !!selectedSystem;
    const hasBatchSelect = selectedBankForManual.length > 0 && selectedSystemForManual.length > 0;

    if (hasSingleSelect) {
      const newPair = {
        bank_record: selectedBank,
        system_transaction: selectedSystem,
        score: 0.0,
        amount_diff: Math.abs(selectedBank.amount - selectedSystem.amount) >= 0.001,
        date_diff: 0,
        manual: true,
      };
      setMatchedPairs([...matchedPairs, newPair]);
      setUnmatchedBank(unmatchedBank.filter((r) => r.row_index !== selectedBank.row_index));
      setUnmatchedSystem(unmatchedSystem.filter((t) => t.id !== selectedSystem.id));
      setSelectedBank(null);
      setSelectedSystem(null);
      message.success('手动匹配成功');
      return;
    }

    if (hasBatchSelect) {
      if (selectedBankForManual.length !== selectedSystemForManual.length) {
        message.warning(
          `批量配对数量不一致：银行记录 ${selectedBankForManual.length} 条，系统交易 ${selectedSystemForManual.length} 条`
        );
        return;
      }
      const sortedBank = [...selectedBankForManual].sort((a, b) => {
        const ra = unmatchedBank.find((r) => r.row_index === a);
        const rb = unmatchedBank.find((r) => r.row_index === b);
        return (ra?.amount || 0) - (rb?.amount || 0);
      });
      const sortedSys = [...selectedSystemForManual].sort((a, b) => {
        const sa = unmatchedSystem.find((t) => t.id === a);
        const sb = unmatchedSystem.find((t) => t.id === b);
        return (sa?.amount || 0) - (sb?.amount || 0);
      });
      const newPairs = sortedBank.map((bankIdx, i) => {
        const bank = unmatchedBank.find((r) => r.row_index === bankIdx);
        const sys = unmatchedSystem.find((t) => t.id === sortedSys[i]);
        return {
          bank_record: bank,
          system_transaction: sys,
          score: 0.0,
          amount_diff: Math.abs(bank.amount - sys.amount) >= 0.001,
          date_diff: 0,
          manual: true,
        };
      });
      setMatchedPairs([...matchedPairs, ...newPairs]);
      setUnmatchedBank(
        unmatchedBank.filter((r) => !selectedBankForManual.includes(r.row_index))
      );
      setUnmatchedSystem(
        unmatchedSystem.filter((t) => !selectedSystemForManual.includes(t.id))
      );
      setSelectedBankForManual([]);
      setSelectedSystemForManual([]);
      message.success(`批量手动匹配成功：${newPairs.length} 对`);
      return;
    }

    message.warning('请先从左右两侧选择要配对的记录');
  };

  const handleUnmatch = (pair) => {
    setMatchedPairs(
      matchedPairs.filter(
        (p) => p.bank_record.row_index !== pair.bank_record.row_index
      )
    );
    setUnmatchedBank([...unmatchedBank, pair.bank_record]);
    setUnmatchedSystem([...unmatchedSystem, pair.system_transaction]);
    message.info('已取消匹配');
  };

  const handleRowSelect = (type, record) => {
    if (type === 'bank') {
      const isSame = selectedBank?.row_index === record.row_index;
      setSelectedBank(isSame ? null : record);
      setSelectedBankForManual([]);
    } else {
      const isSame = selectedSystem?.id === record.id;
      setSelectedSystem(isSame ? null : record);
      setSelectedSystemForManual([]);
    }
  };

  const bankColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (v) => v || <Text type="danger">空</Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 70,
      render: (t) => (
        <Tag color={t === 'income' ? 'green' : 'red'}>
          {t === 'income' ? '收入' : '支出'}
        </Tag>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <span
          style={{
            color: r.type === 'income' ? '#3f8600' : '#cf1322',
            fontWeight: 'bold',
          }}
        >
          {r.type === 'income' ? '+' : '-'}
          {formatCurrency(v)}
        </span>
      ),
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
  ];

  const systemColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 70,
      render: (t) => (
        <Tag color={t === 'income' ? 'green' : 'red'}>
          {t === 'income' ? '收入' : '支出'}
        </Tag>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <span
          style={{
            color: r.type === 'income' ? '#3f8600' : '#cf1322',
            fontWeight: 'bold',
          }}
        >
          {r.type === 'income' ? '+' : '-'}
          {formatCurrency(v)}
        </span>
      ),
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
  ];

  const matchedColumns = [
    {
      title: '匹配得分',
      dataIndex: 'score',
      key: 'score',
      width: 90,
      render: (v, r) => (
        <Space>
          {r.manual ? (
            <Tag color="blue">手动</Tag>
          ) : (
            <Tooltip title="综合匹配得分">
              <Tag color={v >= 0.9 ? 'green' : v >= 0.8 ? 'orange' : 'gold'}>
                {(v * 100).toFixed(0)}%
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '银行记录',
      key: 'bank',
      width: '40%',
      render: (_, r) => {
        const b = r.bank_record;
        return (
          <div>
            <div>
              <Tag color={b.type === 'income' ? 'green' : 'red'}>
                {b.type === 'income' ? '收入' : '支出'}
              </Tag>
              <Text strong>
                {b.type === 'income' ? '+' : '-'}
                {formatCurrency(b.amount)}
              </Text>
              <Text style={{ marginLeft: 8 }} type={r.amount_diff ? 'danger' : undefined}>
                {r.amount_diff && '(金额差异)'}
              </Text>
            </div>
            <div>
              <Text type="secondary">{b.date}</Text>
              <Text style={{ marginLeft: 8 }}>{b.description}</Text>
            </div>
          </div>
        );
      },
    },
    {
      title: '系统交易',
      key: 'system',
      width: '40%',
      render: (_, r) => {
        const s = r.system_transaction;
        return (
          <div>
            <div>
              <Tag color={s.type === 'income' ? 'green' : 'red'}>
                {s.type === 'income' ? '收入' : '支出'}
              </Tag>
              <Text strong>
                {s.type === 'income' ? '+' : '-'}
                {formatCurrency(s.amount)}
              </Text>
            </div>
            <div>
              <Text type="secondary">{s.date}</Text>
              <Text style={{ marginLeft: 8 }}>{s.description}</Text>
            </div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, r) => (
        <Button type="link" size="small" danger onClick={() => handleUnmatch(r)}>
          取消匹配
        </Button>
      ),
    },
  ];

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  if (!uploaded) {
    return (
      <div>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title="选择默认账户"
                valueRender={() => (
                  <Select
                    style={{ width: '100%', marginTop: 12 }}
                    placeholder="请选择导入时使用的账户"
                    value={selectedAccount}
                    onChange={setSelectedAccount}
                    showSearch
                  >
                    {accounts.map((a) => (
                      <Option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="默认支出分类"
                valueRender={() => (
                  <Select
                    style={{ width: '100%', marginTop: 12 }}
                    placeholder="请选择支出分类"
                    value={expenseCategoryId}
                    onChange={setExpenseCategoryId}
                    showSearch
                  >
                    {expenseCategories.map((c) => (
                      <Option key={c.id} value={c.id}>
                        {c.name}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="默认收入分类"
                valueRender={() => (
                  <Select
                    style={{ width: '100%', marginTop: 12 }}
                    placeholder="请选择收入分类"
                    value={incomeCategoryId}
                    onChange={setIncomeCategoryId}
                    showSearch
                  >
                    {incomeCategories.map((c) => (
                      <Option key={c.id} value={c.id}>
                        {c.name}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </Card>
          </Col>
        </Row>

        <Divider />

        <Card>
          <Dragger
            name="file"
            multiple={false}
            accept=".csv"
            beforeUpload={handleUpload}
            showUploadList={false}
            loading={loading}
          >
            <p className="ant-upload-drag-icon">
              <BankOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            </p>
            <p className="ant-upload-text">
              点击或拖拽银行导出的 CSV 文件到此处
            </p>
            <p className="ant-upload-hint">
              支持自动检测编码（GBK/UTF-8）和分隔符，智能识别字段
            </p>
          </Dragger>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Title level={5}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} /> 算法说明
          </Title>
          <ul>
            <li>
              <Text strong>金额精确匹配</Text>：权重 0.5
            </li>
            <li>
              <Text strong>日期 ±3 天内</Text>：权重 0.3
            </li>
            <li>
              <Text strong>描述相似度 &gt; 0.5</Text>：权重 0.2（编辑距离算法）
            </li>
            <li>
              综合得分 <Text strong>&gt; 0.7</Text> 视为自动匹配成功
            </li>
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={4}>
            <Statistic
              title="银行记录总数"
              value={uploadResult?.total_bank_records}
              prefix={<BankOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="系统交易总数"
              value={uploadResult?.total_system_transactions}
              prefix={<UnorderedListOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="已匹配"
              value={matchedPairs.length}
              styles={{ content: { color: '#52c41a' } }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="未匹配银行记录"
              value={unmatchedBank.length}
              styles={{ content: { color: '#fa8c16' } }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="未匹配系统交易"
              value={unmatchedSystem.length}
              styles={{ content: { color: '#fa8c16' } }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="检测到"
              valueRender={() => (
                <div style={{ paddingTop: 5 }}>
                  <Tag color="blue">{uploadResult?.encoding?.toUpperCase()}</Tag>
                  <Tag color="purple">
                    {uploadResult?.delimiter === '\t' ? 'TAB' : uploadResult?.delimiter}
                  </Tag>
                </div>
              )}
            />
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'matched', label: `已匹配 (${matchedPairs.length})` },
          { key: 'unmatched', label: `未匹配 (${unmatchedBank.length + unmatchedSystem.length})` },
        ]}
      />

      {activeTab === 'matched' && (
        <Card>
          <Table
            columns={matchedColumns}
            dataSource={matchedPairs}
            rowKey={(r) => `pair-${r.bank_record.row_index}`}
            rowClassName={(r) => r.amount_diff ? 'diff-amount' : ''}
            expandable={{
              expandedRowRender: (r) => (
                <div style={{ paddingLeft: 70 }}>
                  <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4 }}>
                    {JSON.stringify(r.bank_record.raw_data, null, 2)}
                  </pre>
                </div>
              ),
            }}
          />
        </Card>
      )}

      {activeTab === 'unmatched' && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <Space wrap>
              <Button
                type={manualMode ? 'primary' : 'default'}
                icon={<LinkOutlined />}
                onClick={() => {
                  setManualMode(!manualMode);
                  setSelectedBank(null);
                  setSelectedSystem(null);
                  setSelectedBankForManual([]);
                  setSelectedSystemForManual([]);
                }}
              >
                {manualMode ? '退出手动匹配模式' : '手动匹配模式'}
              </Button>
              {manualMode && (
                <>
                  <Button
                    type="primary"
                    disabled={
                      (!selectedBank || !selectedSystem)
                      && (selectedBankForManual.length === 0 || selectedSystemForManual.length === 0)
                    }
                    onClick={handleManualMatch}
                  >
                    确认配对
                    {selectedBankForManual.length > 0 && (
                      <span style={{ marginLeft: 4 }}>
                        ({selectedBankForManual.length}/{selectedSystemForManual.length})
                      </span>
                    )}
                  </Button>
                  {selectedBankForManual.length > 0 && (
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedBankForManual([]);
                        setSelectedSystemForManual([]);
                      }}
                    >
                      清空批量选择
                    </Button>
                  )}
                </>
              )}
              <Divider type="vertical" />
              <Select
                style={{ width: 180 }}
                placeholder="默认账户"
                value={selectedAccount}
                onChange={setSelectedAccount}
              >
                {accounts.map((a) => (
                  <Option key={a.id} value={a.id}>
                    {a.name}
                  </Option>
                ))}
              </Select>
              <Select
                style={{ width: 180 }}
                placeholder="支出分类"
                value={expenseCategoryId}
                onChange={setExpenseCategoryId}
              >
                {expenseCategories.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.name}
                  </Option>
                ))}
              </Select>
              <Select
                style={{ width: 180 }}
                placeholder="收入分类"
                value={incomeCategoryId}
                onChange={setIncomeCategoryId}
              >
                {incomeCategories.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.name}
                  </Option>
                ))}
              </Select>
              <Button
                type="primary"
                icon={<ImportOutlined />}
                disabled={selectedBankRows.length === 0}
                loading={importing}
                onClick={handleImport}
              >
                一键导入选中记录 ({selectedBankRows.length})
              </Button>
            </Space>
            {manualMode && (
              <div style={{ marginTop: 12, color: '#1677ff' }}>
                <LinkOutlined /> 单选：点击行各选一条进行配对，或勾选左侧复选框批量配对（按金额排序一一对应）
              </div>
            )}
          </Card>

          <Row gutter={16}>
            <Col span={12}>
              <Card
                title={
                  <Space>
                    <BankOutlined />
                    <span>银行记录 ({unmatchedBank.length})</span>
                  </Space>
                }
                extra={
                  manualMode ? (
                    <Space>
                      <Checkbox
                        checked={
                          selectedBankForManual.length === unmatchedBank.length
                          && unmatchedBank.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBankForManual(unmatchedBank.map((r) => r.row_index));
                          } else {
                            setSelectedBankForManual([]);
                          }
                        }}
                      >
                        全选批量
                      </Checkbox>
                    </Space>
                  ) : (
                    <Checkbox
                      checked={selectedBankRows.length === unmatchedBank.length && unmatchedBank.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBankRows(unmatchedBank.map((r) => r.row_index));
                        } else {
                          setSelectedBankRows([]);
                        }
                      }}
                    >
                      全选
                    </Checkbox>
                  )
                }
              >
                <Table
                  rowSelection={
                    manualMode
                      ? {
                          selectedRowKeys: selectedBankForManual,
                          onChange: (keys) => {
                            setSelectedBankForManual(keys);
                            if (keys.length > 0) setSelectedBank(null);
                          },
                        }
                      : {
                          selectedRowKeys: selectedBankRows,
                          onChange: (keys) => setSelectedBankRows(keys),
                        }
                  }
                  columns={bankColumns}
                  dataSource={unmatchedBank}
                  rowKey="row_index"
                  onRow={(record) => ({
                    onClick: () => manualMode && handleRowSelect('bank', record),
                    style:
                      manualMode && selectedBank?.row_index === record.row_index
                        ? { background: '#e6f4ff', cursor: 'pointer' }
                        : manualMode
                        ? { cursor: 'pointer' }
                        : {},
                  })}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card
                title={
                  <Space>
                    <UnorderedListOutlined />
                    <span>系统交易 ({unmatchedSystem.length})</span>
                  </Space>
                }
                extra={
                  manualMode && (
                    <Checkbox
                      checked={
                        selectedSystemForManual.length === unmatchedSystem.length
                        && unmatchedSystem.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSystemForManual(unmatchedSystem.map((t) => t.id));
                        } else {
                          setSelectedSystemForManual([]);
                        }
                      }}
                    >
                      全选批量
                    </Checkbox>
                  )
                }
              >
                <Table
                  rowSelection={
                    manualMode
                      ? {
                          selectedRowKeys: selectedSystemForManual,
                          onChange: (keys) => {
                            setSelectedSystemForManual(keys);
                            setSelectedSystem(null);
                          },
                        }
                      : undefined
                  }
                  columns={systemColumns}
                  dataSource={unmatchedSystem}
                  rowKey="id"
                  onRow={(record) => ({
                    onClick: () => manualMode && handleRowSelect('system', record),
                    style:
                      manualMode && selectedSystem?.id === record.id
                        ? { background: '#e6f4ff', cursor: 'pointer' }
                        : manualMode
                        ? { cursor: 'pointer' }
                        : {},
                  })}
                />
              </Card>
            </Col>
          </Row>
        </div>
      )}

      <Card style={{ marginTop: 16 }}>
        <Space>
          <Button onClick={() => {
            setUploaded(false);
            setUploadResult(null);
            setMatchedPairs([]);
            setUnmatchedBank([]);
            setUnmatchedSystem([]);
            setSelectedBankRows([]);
            setSelectedBankForManual([]);
            setSelectedSystemForManual([]);
          }}>
            重新上传
          </Button>
        </Space>
      </Card>

      <style>{`
        .diff-amount { background: #fff2e8 !important; }
      `}</style>
    </div>
  );
}
