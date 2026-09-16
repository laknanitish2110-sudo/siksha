import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n/i18n';
import { db } from './db/schema';
import { Navbar } from './components/Navbar';
import { LoginView } from './features/LoginView';
import { DashboardView } from './features/DashboardView';
import { StudentsView } from './features/StudentsView';
import { PaymentsView } from './features/PaymentsView';
import { ReportsView } from './features/ReportsView';
import { SyncCenterView } from './features/SyncCenterView';
import { AuditView } from './features/AuditView';
import { LayoutDashboard, Users, CreditCard, FileText, Shield, RefreshCw } from 'lucide-react';

export function App() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'payments' | 'reports' | 'sync' | 'audit'>('dashboard');
  const [loading, setLoading] = useState(true);

  // Check cached session on startup & seed default local data if empty
  useEffect(() => {
    const initApp = async () => {
      const sess = await db.session.toCollection().first();
      if (sess) {
        setCurrentUser(sess);
      }

      // Seed initial sample local data ONLY in development mode if Dexie db is brand new
      const studentCount = await db.students.count();
      if (import.meta.env.DEV && studentCount === 0) {
        const sampleStudents = [
          {
            id: 'STU-101',
            admission_no: 'ADM-2025-001',
            name: 'Rahul Sharma',
            father_name: 'Ramesh Sharma',
            mother_name: 'Sita Sharma',
            phone: '9876543210',
            class_level: '10',
            academic_year_id: 'AY-2025-26',
            date_of_admission: '2025-06-10',
            address: 'Road No 4, Jubilee Hills, Hyderabad',
            status: 'ACTIVE' as const,
            version: 1,
            created_at: new Date().toISOString()
          },
          {
            id: 'STU-102',
            admission_no: 'ADM-2025-002',
            name: 'Ananya Reddy',
            father_name: 'Srinivas Reddy',
            mother_name: 'Latha Reddy',
            phone: '9812345678',
            class_level: '10',
            academic_year_id: 'AY-2025-26',
            date_of_admission: '2025-06-12',
            address: 'Madhapur, Hyderabad',
            status: 'ACTIVE' as const,
            version: 1,
            created_at: new Date().toISOString()
          },
          {
            id: 'STU-103',
            admission_no: 'ADM-2025-003',
            name: 'Karthik Verma',
            father_name: 'Rajesh Verma',
            mother_name: 'Sunita Verma',
            phone: '9700112233',
            class_level: '9',
            academic_year_id: 'AY-2025-26',
            date_of_admission: '2025-06-15',
            address: 'Banjara Hills, Hyderabad',
            status: 'ACTIVE' as const,
            version: 1,
            created_at: new Date().toISOString()
          }
        ];

        const sampleAccounts = [
          { id: 'ACC-101', student_id: 'STU-101', academic_year_id: 'AY-2025-26', assigned_admission_fee: 2000, assigned_tuition_fee: 25000 },
          { id: 'ACC-102', student_id: 'STU-102', academic_year_id: 'AY-2025-26', assigned_admission_fee: 2000, assigned_tuition_fee: 25000 },
          { id: 'ACC-103', student_id: 'STU-103', academic_year_id: 'AY-2025-26', assigned_admission_fee: 2000, assigned_tuition_fee: 24000 }
        ];

        const samplePayments = [
          {
            id: 'PAY-001',
            client_tx_id: 'tx-sample-001',
            student_fee_account_id: 'ACC-101',
            fee_type: 'ADMISSION' as const,
            amount: 2000,
            payment_mode: 'CASH' as const,
            payment_date: '2025-06-10',
            recorded_by_user_id: 'USER-ADMIN-001',
            status: 'VALID' as const,
            version: 1,
            created_at: new Date().toISOString()
          },
          {
            id: 'PAY-002',
            client_tx_id: 'tx-sample-002',
            student_fee_account_id: 'ACC-101',
            fee_type: 'TUITION' as const,
            amount: 5000,
            payment_mode: 'UPI' as const,
            upi_reference: 'UPI-987654321',
            payment_date: '2025-07-05',
            recorded_by_user_id: 'USER-ADMIN-001',
            status: 'VALID' as const,
            version: 1,
            created_at: new Date().toISOString()
          }
        ];

        await db.students.bulkPut(sampleStudents);
        await db.student_fee_accounts.bulkPut(sampleAccounts);
        await db.payments.bulkPut(samplePayments);
      }

      setLoading(false);
    };

    initApp();
  }, []);

  const handleLogout = async () => {
    await db.session.clear();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Loading Shiksha Academy Engine...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSync={() => setActiveTab('sync')}
      />

      {/* Main App Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Navigation Tabs Bar */}
        <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'dashboard' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={16} /> {t('nav.dashboard')}
          </button>

          <button
            className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'students' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('students')}
          >
            <Users size={16} /> {t('nav.students')}
          </button>

          <button
            className={`btn ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'payments' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('payments')}
          >
            <CreditCard size={16} /> {t('nav.payments')} Ledger
          </button>

          <button
            className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'reports' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('reports')}
          >
            <FileText size={16} /> {t('nav.reports')}
          </button>

          <button
            className={`btn ${activeTab === 'sync' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'sync' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={16} /> {t('nav.sync')}
          </button>

          <button
            className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '0', borderBottom: activeTab === 'audit' ? '3px solid #3b82f6' : 'none', background: 'transparent' }}
            onClick={() => setActiveTab('audit')}
          >
            <Shield size={16} /> {t('nav.audit')}
          </button>
        </div>

        {/* Dynamic View Panel */}
        <div style={{ flex: 1 }}>
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'students' && <StudentsView />}
          {activeTab === 'payments' && <PaymentsView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'sync' && <SyncCenterView />}
          {activeTab === 'audit' && <AuditView />}
        </div>
      </div>
    </div>
  );
}

export default App;
