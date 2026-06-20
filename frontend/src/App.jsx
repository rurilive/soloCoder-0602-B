import { useState, useEffect } from 'react';
import { Layout, Menu, Select, Typography, ConfigProvider, theme } from 'antd';
import { DashboardOutlined, UnorderedListOutlined, TagsOutlined, BarChartOutlined, BookOutlined, ScheduleOutlined, WalletOutlined, AccountBookOutlined, BankOutlined, FundOutlined, StockOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import MonthlyReport from './pages/MonthlyReport';
import Ledgers from './pages/Ledgers';
import Recurring from './pages/Recurring';
import BudgetManagement from './pages/BudgetManagement';
import Accounts from './pages/Accounts';
import Reconciliation from './pages/Reconciliation';
import LoanManagement from './pages/LoanManagement';
import Portfolio from './pages/Portfolio';
import { ledgerApi } from './services/api';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: 'portfolio', icon: <StockOutlined />, label: '投资组合' },
  { key: 'transactions', icon: <UnorderedListOutlined />, label: '收支记录' },
  { key: 'loans', icon: <FundOutlined />, label: '贷款管理' },
  { key: 'reconciliation', icon: <BankOutlined />, label: '银行对账' },
  { key: 'accounts', icon: <AccountBookOutlined />, label: '账户管理' },
  { key: 'categories', icon: <TagsOutlined />, label: '分类管理' },
  { key: 'report', icon: <BarChartOutlined />, label: '月度报表' },
  { key: 'recurring', icon: <ScheduleOutlined />, label: '周期记账' },
  { key: 'budget', icon: <WalletOutlined />, label: '预算管理' },
  { key: 'ledgers', icon: <BookOutlined />, label: '账本管理' },
];

function App() {
  const [page, setPage] = useState('dashboard');
  const [ledgers, setLedgers] = useState([]);
  const [currentLedger, setCurrentLedger] = useState(null);

  useEffect(() => {
    const fetchLedgers = async () => {
      const list = await ledgerApi.list();
      setLedgers(list);
      if (list.length > 0 && !currentLedger) {
        setCurrentLedger(list[0]);
      }
    };
    fetchLedgers();
  }, []);

  const handleSwitchLedger = (ledger) => {
    if (!ledger) {
      setCurrentLedger(null);
      return;
    }
    const found = ledgers.find((l) => l.id === ledger.id || l.id === ledger);
    if (found) setCurrentLedger(found);
  };

  const refreshLedgers = async () => {
    const list = await ledgerApi.list();
    setLedgers(list);
  };

  const renderPage = () => {
    if (!currentLedger && page !== 'ledgers') {
      return <div style={{ textAlign: 'center', padding: 100, color: '#999' }}>请先选择或创建一个账本</div>;
    }
    switch (page) {
      case 'dashboard': return <Dashboard currentLedger={currentLedger} />;
      case 'portfolio': return <Portfolio currentLedger={currentLedger} />;
      case 'transactions': return <Transactions currentLedger={currentLedger} />;
      case 'loans': return <LoanManagement currentLedger={currentLedger} />;
      case 'reconciliation': return <Reconciliation currentLedger={currentLedger} />;
      case 'accounts': return <Accounts currentLedger={currentLedger} />;
      case 'categories': return <Categories currentLedger={currentLedger} />;
      case 'report': return <MonthlyReport currentLedger={currentLedger} />;
      case 'recurring': return <Recurring currentLedger={currentLedger} />;
      case 'budget': return <BudgetManagement currentLedger={currentLedger} />;
      case 'ledgers': return <Ledgers currentLedger={currentLedger} onSwitch={(l) => { handleSwitchLedger(l); refreshLedgers(); }} />;
      default: return <Dashboard currentLedger={currentLedger} />;
    }
  };

  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: '#1677ff' } }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
          <div style={{ padding: '20px 16px 12px', textAlign: 'center' }}>
            <Title level={4} style={{ margin: 0, color: '#1677ff' }}>💰 记账本</Title>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择账本"
              value={currentLedger?.id}
              onChange={(id) => handleSwitchLedger(id)}
              options={ledgers.map((l) => ({ label: l.name, value: l.id }))}
            />
          </div>
          <Menu mode="inline" selectedKeys={[page]} items={menuItems} onClick={({ key }) => setPage(key)} style={{ borderRight: 0 }} />
        </Sider>
        <Layout>
          <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>{menuItems.find((m) => m.key === page)?.label}</Title>
            {currentLedger && (
              <span style={{ marginLeft: 'auto', color: '#666' }}>
                当前账本: <strong>{currentLedger.name}</strong>
              </span>
            )}
          </Header>
          <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 280 }}>
            {renderPage()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
