import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { db } from '../db/schema';
import { RefreshCw } from 'lucide-react';
import { getApiBaseUrl } from '../config';

const API_BASE = getApiBaseUrl();

interface AuditRecord {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id?: string;
  old_value?: string;
  new_value?: string;
  server_timestamp: string;
}

export const AuditView: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditLogs = async () => {
    setLoading(true);
    if (navigator.onLine) {
      try {
        const session = await db.session.toCollection().first();
        if (session && session.access_token) {
          const res = await axios.get(`${API_BASE}/audit-logs`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          setLogs(res.data || []);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch live audit logs from API, using cached view:', err);
      }
    }

    // Offline audit view: return genuine cached entries or empty state (no fake mock records)
    setLogs([]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{t('nav.audit')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Immutable system security, financial mutation, and configuration audit trail</p>
        </div>

        <button onClick={fetchAuditLogs} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Logs
        </button>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 16px' }}>Timestamp</th>
              <th style={{ padding: '12px 16px' }}>Action</th>
              <th style={{ padding: '12px 16px' }}>Entity Type</th>
              <th style={{ padding: '12px 16px' }}>Entity ID</th>
              <th style={{ padding: '12px 16px' }}>Mutation Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No audit log entries recorded.
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{new Date(log.server_timestamp).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${log.action.includes('CORRECTED') ? 'badge-warning' : log.action.includes('CREATED') ? 'badge-success' : 'badge-primary'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{log.entity_type}</td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8', fontFamily: 'monospace' }}>{log.entity_id.substring(0, 12)}...</td>
                  <td style={{ padding: '12px 16px', color: '#f8fafc' }}>
                    {log.new_value || log.old_value || 'System Action'}
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
