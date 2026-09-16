import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { Download, Calendar } from 'lucide-react';
import { generatePdfReport } from '../utils/pdfGenerator';

export const ReportsView: React.FC = () => {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<'DAILY' | 'MONTHLY' | 'ACADEMIC_YEAR'>('DAILY');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Live queries
  const payments = useLiveQuery(() => db.payments.where('status').equals('VALID').or('status').equals('CORRECTED').toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const feeAccounts = useLiveQuery(() => db.student_fee_accounts.toArray()) || [];

  const getStudentInfo = (accountId: string) => {
    const acc = feeAccounts.find(a => a.id === accountId);
    if (!acc) return { name: 'Unknown', admNo: '-', classLevel: '-' };
    const stu = students.find(s => s.id === acc.student_id);
    return { name: stu ? stu.name : 'Unknown', admNo: stu ? stu.admission_no : '-', classLevel: stu ? stu.class_level : '-' };
  };

  // Filter payments based on report type
  const targetPayments = payments.filter(p => {
    if (reportType === 'DAILY') {
      return p.payment_date === selectedDate;
    }
    if (reportType === 'MONTHLY') {
      return p.payment_date.startsWith(selectedDate.substring(0, 7)); // YYYY-MM
    }
    return true; // Academic year
  });

  const totalCollected = targetPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const cashCollected = targetPayments.filter(p => p.payment_mode === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0);
  const upiCollected = targetPayments.filter(p => p.payment_mode === 'UPI').reduce((sum, p) => sum + Number(p.amount), 0);

  const handleExportPdf = () => {
    const rows = targetPayments.map(p => {
      const info = getStudentInfo(p.student_fee_account_id);
      return [
        p.payment_date,
        info.name,
        info.admNo,
        `Class ${info.classLevel}`,
        p.fee_type,
        p.payment_mode,
        `INR ${p.amount.toLocaleString('en-IN')}`
      ];
    });

    generatePdfReport({
      title: `${reportType} COLLECTION REPORT`,
      subtitle: `Shiksha Academy Fee Management — Target Date: ${selectedDate}`,
      dateStr: new Date().toLocaleDateString(),
      columns: ['Date', 'Student Name', 'Admission No', 'Class', 'Fee Category', 'Mode', 'Amount'],
      rows: rows,
      totals: [
        { label: 'Cash Collection Total', value: `INR ${cashCollected.toLocaleString('en-IN')}` },
        { label: 'UPI Collection Total', value: `INR ${upiCollected.toLocaleString('en-IN')}` },
        { label: 'Grand Collection Total', value: `INR ${totalCollected.toLocaleString('en-IN')}` }
      ]
    }, `Shiksha_Academy_${reportType}_Report.pdf`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{t('nav.reports')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Generate and export official PDF collection reports offline</p>
        </div>

        <button onClick={handleExportPdf} className="btn btn-primary">
          <Download size={16} /> {t('actions.exportPdf')}
        </button>
      </div>

      {/* Report Controls & Filters */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${reportType === 'DAILY' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('DAILY')}
          >
            Daily Report
          </button>
          <button
            className={`btn ${reportType === 'MONTHLY' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('MONTHLY')}
          >
            Monthly Report
          </button>
          <button
            className={`btn ${reportType === 'ACADEMIC_YEAR' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('ACADEMIC_YEAR')}
          >
            Academic Year Report
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} color="#94a3b8" />
          <input
            type={reportType === 'MONTHLY' ? 'month' : 'date'}
            className="form-control"
            value={reportType === 'MONTHLY' ? selectedDate.substring(0, 7) : selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '180px' }}
          />
        </div>
      </div>

      {/* Collection Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Collection</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', marginTop: '4px' }}>₹{totalCollected.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>{targetPayments.length} transactions</div>
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Cash Collection</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>₹{cashCollected.toLocaleString('en-IN')}</div>
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>UPI Collection</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#c084fc', marginTop: '4px' }}>₹{upiCollected.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Report Data Preview Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th style={{ padding: '12px 16px' }}>Student Name</th>
              <th style={{ padding: '12px 16px' }}>Admission No</th>
              <th style={{ padding: '12px 16px' }}>Class</th>
              <th style={{ padding: '12px 16px' }}>Fee Category</th>
              <th style={{ padding: '12px 16px' }}>Payment Mode</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {targetPayments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No payment transactions found for selected period ({selectedDate}).
                </td>
              </tr>
            ) : (
              targetPayments.map(p => {
                const info = getStudentInfo(p.student_fee_account_id);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>{p.payment_date}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>{info.name}</td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{info.admNo}</td>
                    <td style={{ padding: '12px 16px' }}>Class {info.classLevel}</td>
                    <td style={{ padding: '12px 16px' }}><span className="badge badge-primary">{p.fee_type}</span></td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{p.payment_mode}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>₹{p.amount}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
