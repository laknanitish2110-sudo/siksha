import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { Users, DollarSign, Wallet, CreditCard, AlertCircle, ArrowUpRight } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { t } = useTranslation();

  const students = useLiveQuery(() => db.students.where('status').equals('ACTIVE').toArray()) || [];
  const feeAccounts = useLiveQuery(() => db.student_fee_accounts.toArray()) || [];
  const payments = useLiveQuery(() => db.payments.where('status').equals('VALID').or('status').equals('CORRECTED').toArray()) || [];

  // Metrics calculations
  const totalStudents = students.length;
  
  let totalExpectedFees = 0;
  feeAccounts.forEach(acc => {
    totalExpectedFees += (Number(acc.assigned_admission_fee || 0) + Number(acc.assigned_tuition_fee || 0));
  });

  let totalCollected = 0;
  let cashCollected = 0;
  let upiCollected = 0;

  payments.forEach(p => {
    const amt = Number(p.amount || 0);
    totalCollected += amt;
    if (p.payment_mode === 'CASH') cashCollected += amt;
    if (p.payment_mode === 'UPI') upiCollected += amt;
  });

  const totalOutstanding = Math.max(0, totalExpectedFees - totalCollected);
  const collectionPercentage = totalExpectedFees > 0 ? Math.round((totalCollected / totalExpectedFees) * 100) : 0;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{t('nav.dashboard')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Real-time financial summary & collection analytics</p>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {/* Total Active Students */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Active Students</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc' }}>{totalStudents}</div>
          <div style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            <ArrowUpRight size={14} /> Enrolled in tuition academy
          </div>
        </div>

        {/* Expected Fees */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Total Expected Fees</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc' }}>₹{totalExpectedFees.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>Admission + Tuition Fee Heads</div>
        </div>

        {/* Total Collected */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Total Collected</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <Wallet size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>₹{totalCollected.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '6px' }}>{collectionPercentage}% of total target collected</div>
        </div>

        {/* Total Outstanding */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Total Outstanding</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
              <AlertCircle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f87171' }}>₹{totalOutstanding.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '6px' }}>Pending academy collections</div>
        </div>
      </div>

      {/* Collection Progress & Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        {/* Progress Bar Panel */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', color: '#f8fafc' }}>Fee Collection Progress</h3>
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#94a3b8' }}>Collected vs Target</span>
            <span style={{ fontWeight: 700, color: '#3b82f6' }}>{collectionPercentage}%</span>
          </div>
          <div style={{ height: '12px', background: '#0f172a', borderRadius: '6px', overflow: 'hidden', border: '1px solid #334155' }}>
            <div style={{ height: '100%', width: `${collectionPercentage}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)', borderRadius: '6px', transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '0.8rem', color: '#94a3b8' }}>
            <div>Collected: <strong style={{ color: '#10b981' }}>₹{totalCollected.toLocaleString('en-IN')}</strong></div>
            <div>Remaining: <strong style={{ color: '#ef4444' }}>₹{totalOutstanding.toLocaleString('en-IN')}</strong></div>
          </div>
        </div>

        {/* Cash vs UPI Breakdown */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', color: '#f8fafc' }}>Payment Mode Distribution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                  <Wallet size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>Cash Collection</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Handled at front desk</div>
                </div>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>₹{cashCollected.toLocaleString('en-IN')}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>UPI Collection</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Direct bank transfers</div>
                </div>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#60a5fa' }}>₹{upiCollected.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
