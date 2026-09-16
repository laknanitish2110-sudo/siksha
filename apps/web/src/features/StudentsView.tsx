import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { LocalStudent } from '../db/schema';
import { Search, UserPlus, CreditCard, Eye, X } from 'lucide-react';

export const StudentsView: React.FC = () => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<LocalStudent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // New Student Form State
  const [newStudent, setNewStudent] = useState({
    admission_no: '',
    name: '',
    father_name: '',
    mother_name: '',
    phone: '',
    class_level: '10',
    date_of_admission: new Date().toISOString().split('T')[0],
    address: ''
  });

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    fee_type: 'TUITION' as 'ADMISSION' | 'TUITION',
    amount: '',
    payment_mode: 'CASH' as 'CASH' | 'UPI',
    upi_reference: '',
    notes: ''
  });

  // Live query for instant search
  const students = useLiveQuery(async () => {
    if (!searchTerm.trim()) {
      return db.students.where('status').equals('ACTIVE').toArray();
    }
    const term = searchTerm.toLowerCase();
    return db.students
      .where('status')
      .equals('ACTIVE')
      .filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.admission_no.toLowerCase().includes(term) ||
        s.phone.includes(term) ||
        s.class_level.includes(term)
      )
      .toArray();
  }, [searchTerm]) || [];

  // Live query fee accounts
  const feeAccounts = useLiveQuery(() => db.student_fee_accounts.toArray()) || [];
  const payments = useLiveQuery(() => db.payments.where('status').equals('VALID').or('status').equals('CORRECTED').toArray()) || [];

  // Helper to calculate student balance
  const getStudentBalance = (studentId: string) => {
    const acc = feeAccounts.find(a => a.student_id === studentId);
    if (!acc) return { assignedAdm: 0, assignedTui: 0, paidAdm: 0, paidTui: 0, outAdm: 0, outTui: 0, totalOut: 0, accountId: '' };

    const studentPayments = payments.filter(p => p.student_fee_account_id === acc.id);
    const paidAdm = studentPayments.filter(p => p.fee_type === 'ADMISSION').reduce((sum, p) => sum + Number(p.amount), 0);
    const paidTui = studentPayments.filter(p => p.fee_type === 'TUITION').reduce((sum, p) => sum + Number(p.amount), 0);

    const assignedAdm = Number(acc.assigned_admission_fee || 0);
    const assignedTui = Number(acc.assigned_tuition_fee || 0);

    const outAdm = Math.max(0, assignedAdm - paidAdm);
    const outTui = Math.max(0, assignedTui - paidTui);

    return {
      assignedAdm,
      assignedTui,
      paidAdm,
      paidTui,
      outAdm,
      outTui,
      totalOut: outAdm + outTui,
      accountId: acc.id
    };
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.admission_no || !newStudent.name || !newStudent.phone) return;

    const studentId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const ayId = 'AY-2025-26';

    const studentRecord: LocalStudent = {
      id: studentId,
      admission_no: newStudent.admission_no,
      name: newStudent.name,
      father_name: newStudent.father_name,
      mother_name: newStudent.mother_name,
      phone: newStudent.phone,
      class_level: newStudent.class_level,
      academic_year_id: ayId,
      date_of_admission: newStudent.date_of_admission,
      address: newStudent.address,
      status: 'ACTIVE',
      version: 1,
      created_at: new Date().toISOString()
    };

    // Default class fee template assignments
    const defaultFees: Record<string, { adm: number; tui: number }> = {
      '6': { adm: 1500, tui: 18000 },
      '7': { adm: 1500, tui: 20000 },
      '8': { adm: 2000, tui: 22000 },
      '9': { adm: 2000, tui: 24000 },
      '10': { adm: 2000, tui: 25000 }
    };
    const classFee = defaultFees[newStudent.class_level] || { adm: 2000, tui: 25000 };

    const accountRecord = {
      id: accountId,
      student_id: studentId,
      academic_year_id: ayId,
      assigned_admission_fee: classFee.adm,
      assigned_tuition_fee: classFee.tui,
      notes: 'Auto assigned on local registration'
    };

    // Save to Dexie
    await db.students.put(studentRecord);
    await db.student_fee_accounts.put(accountRecord);

    // Queue in Outbox
    await db.outbox.add({
      client_tx_id: crypto.randomUUID(),
      entity_name: 'students',
      operation_type: 'CREATE',
      client_timestamp: new Date().toISOString(),
      payload: {
        id: studentId,
        ...newStudent,
        academic_year_id: ayId
      },
      status: 'PENDING'
    });

    setShowAddModal(false);
    setNewStudent({
      admission_no: '',
      name: '',
      father_name: '',
      mother_name: '',
      phone: '',
      class_level: '10',
      date_of_admission: new Date().toISOString().split('T')[0],
      address: ''
    });
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const balance = getStudentBalance(selectedStudent.id);
    const amountNum = parseFloat(paymentForm.amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    const maxAllowed = paymentForm.fee_type === 'ADMISSION' ? balance.outAdm : balance.outTui;
    if (amountNum > maxAllowed) {
      alert(`Payment amount ₹${amountNum} exceeds remaining ${paymentForm.fee_type} fee balance ₹${maxAllowed}. Overpayment is prohibited.`);
      return;
    }

    const txId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();

    const paymentRecord = {
      id: paymentId,
      client_tx_id: txId,
      student_fee_account_id: balance.accountId,
      fee_type: paymentForm.fee_type,
      amount: amountNum,
      payment_mode: paymentForm.payment_mode,
      upi_reference: paymentForm.upi_reference || undefined,
      payment_date: new Date().toISOString().split('T')[0],
      notes: paymentForm.notes || undefined,
      recorded_by_user_id: 'USER-CURRENT-STAFF',
      status: 'VALID' as const,
      version: 1,
      created_at: new Date().toISOString()
    };

    // Save locally
    await db.payments.put(paymentRecord);

    // Add to Outbox Queue
    await db.outbox.add({
      client_tx_id: txId,
      entity_name: 'payments',
      operation_type: 'CREATE',
      client_timestamp: new Date().toISOString(),
      payload: {
        student_fee_account_id: balance.accountId,
        fee_type: paymentForm.fee_type,
        amount: amountNum,
        payment_mode: paymentForm.payment_mode,
        upi_reference: paymentForm.upi_reference,
        payment_date: paymentRecord.payment_date,
        notes: paymentForm.notes
      },
      status: 'PENDING'
    });

    setShowPaymentModal(false);
    setPaymentForm({
      fee_type: 'TUITION',
      amount: '',
      payment_mode: 'CASH',
      upi_reference: '',
      notes: ''
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Search Header Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ flex: '1', minWidth: '300px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            className="form-control"
            placeholder={t('student.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '42px', fontSize: '0.95rem' }}
          />
        </div>

        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <UserPlus size={18} /> {t('student.addStudent')}
        </button>
      </div>

      {/* Student List Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '14px 16px' }}>{t('student.admissionNo')}</th>
              <th style={{ padding: '14px 16px' }}>{t('student.name')}</th>
              <th style={{ padding: '14px 16px' }}>{t('student.class')}</th>
              <th style={{ padding: '14px 16px' }}>{t('student.phone')}</th>
              <th style={{ padding: '14px 16px' }}>Total Outstanding</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No students found matching query.
                </td>
              </tr>
            ) : (
              students.map(s => {
                const bal = getStudentBalance(s.id);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#38bdf8' }}>{s.admission_no}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f8fafc' }}>
                      {s.name}
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>F: {s.father_name}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge badge-primary">Class {s.class_level}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8' }}>{s.phone}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: bal.totalOut > 0 ? '#ef4444' : '#10b981' }}>
                      ₹{bal.totalOut.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedStudent(s)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', marginRight: '8px' }}
                      >
                        <Eye size={14} /> View Ledger
                      </button>
                      <button
                        onClick={() => { setSelectedStudent(s); setShowPaymentModal(true); }}
                        className="btn btn-success"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        <CreditCard size={14} /> Record Payment
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '540px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>Register New Student</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Admission Number *</label>
                  <input type="text" className="form-control" required value={newStudent.admission_no} onChange={e => setNewStudent({ ...newStudent, admission_no: e.target.value })} placeholder="e.g. ADM-2025-010" />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Class Level *</label>
                  <select className="form-control" value={newStudent.class_level} onChange={e => setNewStudent({ ...newStudent, class_level: e.target.value })}>
                    {['6', '7', '8', '9', '10'].map(c => <option key={c} value={c} style={{ background: '#0f172a' }}>Class {c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Student Name *</label>
                <input type="text" className="form-control" required value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} placeholder="Full Name" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Father's Name *</label>
                  <input type="text" className="form-control" required value={newStudent.father_name} onChange={e => setNewStudent({ ...newStudent, father_name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Mother's Name *</label>
                  <input type="text" className="form-control" required value={newStudent.mother_name} onChange={e => setNewStudent({ ...newStudent, mother_name: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Phone Number *</label>
                  <input type="text" className="form-control" required value={newStudent.phone} onChange={e => setNewStudent({ ...newStudent, phone: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Date of Admission *</label>
                  <input type="date" className="form-control" required value={newStudent.date_of_admission} onChange={e => setNewStudent({ ...newStudent, date_of_admission: e.target.value })} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Address *</label>
                <textarea className="form-control" rows={2} required value={newStudent.address} onChange={e => setNewStudent({ ...newStudent, address: e.target.value })} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">{t('actions.cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('actions.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>{t('actions.recordPayment')}</h3>
                <p style={{ fontSize: '0.8rem', color: '#38bdf8' }}>{selectedStudent.name} ({selectedStudent.admission_no})</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {(() => {
              const bal = getStudentBalance(selectedStudent.id);
              const curMax = paymentForm.fee_type === 'ADMISSION' ? bal.outAdm : bal.outTui;
              return (
                <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Separate Fee Head Selector */}
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Fee Head Category *</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        className={`btn ${paymentForm.fee_type === 'ADMISSION' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPaymentForm({ ...paymentForm, fee_type: 'ADMISSION' })}
                        style={{ fontSize: '0.8rem', padding: '8px' }}
                      >
                        Admission Fee (Bal: ₹{bal.outAdm})
                      </button>
                      <button
                        type="button"
                        className={`btn ${paymentForm.fee_type === 'TUITION' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPaymentForm({ ...paymentForm, fee_type: 'TUITION' })}
                        style={{ fontSize: '0.8rem', padding: '8px' }}
                      >
                        Tuition Fee (Bal: ₹{bal.outTui})
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Amount Received (₹) * (Max: ₹{curMax})</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      required
                      max={curMax}
                      placeholder={`Max ₹${curMax}`}
                      value={paymentForm.amount}
                      onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Payment Mode *</label>
                    <select className="form-control" value={paymentForm.payment_mode} onChange={e => setPaymentForm({ ...paymentForm, payment_mode: e.target.value as any })}>
                      <option value="CASH" style={{ background: '#0f172a' }}>Cash</option>
                      <option value="UPI" style={{ background: '#0f172a' }}>UPI (Bank Transfer)</option>
                    </select>
                  </div>

                  {paymentForm.payment_mode === 'UPI' && (
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UPI Reference Number</label>
                      <input type="text" className="form-control" placeholder="e.g. UPI-12345678" value={paymentForm.upi_reference} onChange={e => setPaymentForm({ ...paymentForm, upi_reference: e.target.value })} />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Notes / Remarks</label>
                    <input type="text" className="form-control" placeholder="Optional notes" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                    <button type="button" onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">{t('actions.cancel')}</button>
                    <button type="submit" className="btn btn-success">{t('actions.recordPayment')}</button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Student Detail Ledger Modal */}
      {selectedStudent && !showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc' }}>{selectedStudent.name}</h3>
                <p style={{ fontSize: '0.85rem', color: '#38bdf8' }}>{selectedStudent.admission_no} • Class {selectedStudent.class_level}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {(() => {
              const bal = getStudentBalance(selectedStudent.id);
              const studentPayments = payments.filter(p => p.student_fee_account_id === bal.accountId);

              return (
                <div>
                  {/* Two Separate Fee Heads Summary Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ padding: '14px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ADMISSION FEE</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>Payable: ₹{bal.assignedAdm}</div>
                      <div style={{ fontSize: '0.8rem', color: '#10b981' }}>Paid: ₹{bal.paidAdm}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: bal.outAdm > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>Outstanding: ₹{bal.outAdm}</div>
                    </div>

                    <div style={{ padding: '14px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TUITION FEE</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>Payable: ₹{bal.assignedTui}</div>
                      <div style={{ fontSize: '0.8rem', color: '#10b981' }}>Paid: ₹{bal.paidTui}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: bal.outTui > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>Outstanding: ₹{bal.outTui}</div>
                    </div>
                  </div>

                  {/* Payment History Log */}
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px', color: '#f8fafc' }}>Payment Transaction History</h4>
                  <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden' }}>
                    {studentPayments.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No payments recorded yet.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: '#1e293b', color: '#94a3b8', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px' }}>Date</th>
                            <th style={{ padding: '8px 12px' }}>Fee Type</th>
                            <th style={{ padding: '8px 12px' }}>Mode</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentPayments.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '8px 12px', color: '#f8fafc' }}>{p.payment_date}</td>
                              <td style={{ padding: '8px 12px' }}><span className="badge badge-primary">{p.fee_type}</span></td>
                              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{p.payment_mode} {p.upi_reference ? `(${p.upi_reference})` : ''}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>₹{p.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                    <button onClick={() => setSelectedStudent(null)} className="btn btn-secondary">Close</button>
                    <button onClick={() => setShowPaymentModal(true)} className="btn btn-success"><CreditCard size={14} /> Record Payment</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
