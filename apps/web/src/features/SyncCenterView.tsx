import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { RefreshCw, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { processOutboxSync } from '../services/syncEngine';

export const SyncCenterView: React.FC = () => {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const outboxItems = useLiveQuery(() => db.outbox.toArray()) || [];
  const quarantinedPayments = useLiveQuery(() => db.payments.where('status').equals('CONFLICT_QUARANTINED').toArray()) || [];

  const handleRunSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    const res = await processOutboxSync();
    setIsSyncing(false);
    if (res.status === 'success') {
      setSyncResult(`Successfully synchronized ${res.synced} transactions with server!`);
    } else if (res.status === 'offline') {
      setSyncResult('Device is currently offline. Queue will automatically push when internet returns.');
    } else {
      setSyncResult(`Sync completed. Some items may require attention.`);
    }
  };

  const handleClearOutboxItem = async (id?: number) => {
    if (id) {
      await db.outbox.delete(id);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{t('nav.sync')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Offline transaction queue monitor & conflict quarantine alerts</p>
        </div>

        <button onClick={handleRunSync} disabled={isSyncing} className="btn btn-primary">
          <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Synchronizing...' : 'Execute Sync Now'}
        </button>
      </div>

      {syncResult && (
        <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', borderRadius: '8px', color: '#60a5fa', marginBottom: '24px', fontSize: '0.9rem' }}>
          {syncResult}
        </div>
      )}

      {/* Quarantined Conflict Alerts */}
      {quarantinedPayments.length > 0 && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '12px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 700, fontSize: '1rem', marginBottom: '8px' }}>
            <AlertTriangle size={18} /> Conflict Quarantine Attention Required ({quarantinedPayments.length})
          </div>
          <p style={{ fontSize: '0.85rem', color: '#f8fafc', marginBottom: '12px' }}>
            The server detected concurrent offline edits for the following payment entries. They have been quarantined from authoritative balances until reviewed.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quarantinedPayments.map(p => (
              <div key={p.id} style={{ padding: '10px 14px', background: '#0f172a', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>Payment ID: {p.id.substring(0, 8)}...</span>
                  <span style={{ color: '#94a3b8', marginLeft: '12px' }}>Date: {p.payment_date}</span>
                  <span style={{ color: '#94a3b8', marginLeft: '12px' }}>Amount: ₹{p.amount} ({p.fee_type})</span>
                </div>
                <button
                  onClick={async () => {
                    await db.payments.update(p.id, { status: 'CORRECTED' });
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  Approve & Release Quarantine
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outbox Items List */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '16px' }}>Pending Outbox Transaction Queue</h3>
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 16px' }}>Client Tx ID</th>
              <th style={{ padding: '12px 16px' }}>Entity</th>
              <th style={{ padding: '12px 16px' }}>Operation</th>
              <th style={{ padding: '12px 16px' }}>Client Timestamp</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {outboxItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  <CheckCircle2 size={24} color="#10b981" style={{ margin: '0 auto 8px', display: 'block' }} />
                  Outbox queue is empty. All local operations are fully synchronized with server!
                </td>
              </tr>
            ) : (
              outboxItems.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace' }}>{item.client_tx_id.substring(0, 12)}...</td>
                  <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: 600 }}>{item.entity_name}</td>
                  <td style={{ padding: '12px 16px' }}><span className="badge badge-primary">{item.operation_type}</span></td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{new Date(item.client_timestamp).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${item.status === 'PENDING' ? 'badge-warning' : item.status === 'SYNCING' ? 'badge-primary' : 'badge-danger'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => handleClearOutboxItem(item.id)} className="btn btn-secondary" style={{ padding: '4px 8px', color: '#ef4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
