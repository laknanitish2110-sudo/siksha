import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { LocalPayment } from '../db/schema';
import { Edit2, X } from 'lucide-react';

export const PaymentsView: React.FC = () => {
  const { t } = useTranslation();
  const [filterFeeType, setFilterFeeType] = useState<string>('ALL');
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [correctingPayment, setCorrectingPayment] = useState<LocalPayment | null>(null);

  const [correctionForm, setCorrectionForm] = useState({
    new_amount: '',
    new_fee_type: 'TUITION' as 'ADMISSION' | 'TUITION',
    new_mode: 'CASH' as 'CASH' | 'UPI',
    reason: ''
  });

  // Live queries
  const payments = useLiveQuery(() => db.payments.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const feeAccounts = useLiveQuery(() => db.student_fee_accounts.toArray()) || [];

  const getStudentInfo = (accountId: string) => {
    const acc = feeAccounts.find(a => a.id === accountId);
    if (!acc) return { name: 'Unknown', admNo: '-' };
    const stu = students.find(s => s.id === acc.student_id);
    return { name: stu ? stu.name : 'Unknown', admNo: stu ? stu.admission_no : '-' };
  };

  const filteredPayments = payments.filter(p => {
    if (filterFeeType !== 'ALL' && p.fee_type !== filterFeeType) return false;
    if (filterMode !== 'ALL' && p.payment_mode !== filterMode) return false;
    return true;
  });

  const handleApplyCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingPayment || !correctionForm.reason.trim()) return;

    const newAmtNum = parseFloat(correctionForm.new_amount);
    if (isNaN(newAmtNum) || newAmtNum <= 0) {
      alert('Please enter a valid corrected amount.');
      return;
    }

    const editTxId = crypto.randomUUID();

    // Update payment row locally
    await db.payments.update(correctingPayment.id, {
      amount: newAmtNum,
      fee_type: correctionForm.new_fee_type,
      payment_mode: correctionForm.new_mode,
      status: 'CORRECTED',
      version: correctingPayment.version + 1
    });

    // Queue in Outbox
    await db.outbox.add({
      client_tx_id: editTxId,
      entity_name: 'payment_corrections',
      operation_type: 'CORRECT',
      client_timestamp: new Date().toISOString(),
      payload: {
        payment_id: correctingPayment.id,
        new_amount: newAmtNum,
        new_fee_type: correctionForm.new_fee_type,
        new_mode: correctionForm.new_mode,
        reason: correctionForm.reason
      },
      status: 'PENDING'
    });

    setCorrectingPayment(null);
    setCorrectionForm({ new_amount: '', new_fee_type: 'TUITION', new_mode: 'CASH', reason: '' });
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{t('nav.payments')} Ledger</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Complete payment transaction history & auditable corrections</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <select className="form-control" value={filterFeeType} onChange={e => setFilterFeeType(e.target.value)} style={{ width: '160px' }}>
            <option value="ALL" style={{ background: '#0f172a' }}>All Fee Types</option>
            <option value="ADMISSION" style={{ background: '#0f172a' }}>Admission Fee</option>
            <option value="TUITION" style={{ background: '#0f172a' }}>Tuition Fee</option>
          </select>

          <select className="form-control" value={filterMode} onChange={e => setFilterMode(e.target.value)} style={{ width: '150px' }}>
            <option value="ALL" style={{ background: '#0f172a' }}>All Modes</option>
            <option value="CASH" style={{ background: '#0f172a' }}>Cash</option>
            <option value="UPI" style={{ background: '#0f172a' }}>UPI</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th style={{ padding: '12px 16px' }}>Student</th>
              <th style={{ padding: '12px 16px' }}>Fee Head</th>
              <th style={{ padding: '12px 16px' }}>Mode</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No payment transactions recorded.
                </td>
              </tr>
            ) : (
              filteredPayments.map(p => {
                const info = getStudentInfo(p.student_fee_account_id);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>{p.payment_date}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>
                      {info.name} <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>({info.admNo})</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}><span className="badge badge-primary">{p.fee_type}</span></td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{p.payment_mode} {p.upi_reference ? `(${p.upi_reference})` : ''}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${p.status === 'VALID' ? 'badge-success' : p.status === 'CORRECTED' ? 'badge-warning' : 'badge-danger'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '0.95rem' }}>
                      ₹{p.amount.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setCorrectingPayment(p);
                          setCorrectionForm({ new_amount: String(p.amount), new_fee_type: p.fee_type, new_mode: p.payment_mode, reason: '' });
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        <Edit2 size={12} /> Correct Entry
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Correction Modal */}
      {correctingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>{t('actions.correctPayment')}</h3>
                <p style={{ fontSize: '0.8rem', color: '#fbbf24' }}>Original Entry: ₹{correctingPayment.amount} ({correctingPayment.fee_type})</p>
              </div>
              <button onClick={() => setCorrectingPayment(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleApplyCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Corrected Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  required
                  value={correctionForm.new_amount}
                  onChange={e => setCorrectionForm({ ...correctionForm, new_amount: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Fee Head *</label>
                <select className="form-control" value={correctionForm.new_fee_type} onChange={e => setCorrectionForm({ ...correctionForm, new_fee_type: e.target.value as any })}>
                  <option value="ADMISSION" style={{ background: '#0f172a' }}>Admission Fee</option>
                  <option value="TUITION" style={{ background: '#0f172a' }}>Tuition Fee</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Payment Mode *</label>
                <select className="form-control" value={correctionForm.new_mode} onChange={e => setCorrectionForm({ ...correctionForm, new_mode: e.target.value as any })}>
                  <option value="CASH" style={{ background: '#0f172a' }}>Cash</option>
                  <option value="UPI" style={{ background: '#0f172a' }}>UPI</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Mandatory Audit Reason *</label>
                <textarea
                  className="form-control"
                  rows={2}
                  required
                  placeholder="Explain why this payment is being corrected..."
                  value={correctionForm.reason}
                  onChange={e => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setCorrectingPayment(null)} className="btn btn-secondary">{t('actions.cancel')}</button>
                <button type="submit" className="btn btn-primary">Apply & Audit Correction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
