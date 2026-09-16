import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw, Globe, LogOut } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

interface NavbarProps {
  currentUser: any;
  onLogout: () => void;
  onOpenSync: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentUser, onLogout, onOpenSync }) => {
  const { t, i18n } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Live query outbox count
  const pendingCount = useLiveQuery(() => db.outbox.where('status').equals('PENDING').count()) || 0;
  const alertCount = useLiveQuery(() => db.outbox.where('status').equals('FAILED_NEEDS_ATTENTION').count()) || 0;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    i18n.changeLanguage(newLang);
    localStorage.setItem('shiksha_lang', newLang);
  };

  return (
    <nav className="glass-panel" style={{ borderRadius: 0, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: '#fff', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}>
          SA
        </div>
        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2 }}>{t('appName')}</h1>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t('appSubtitle')}</p>
        </div>
      </div>

      {/* Center & Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Network Status Badge */}
        {isOnline ? (
          <span className="badge badge-success">
            <Wifi size={14} /> {t('status.online')}
          </span>
        ) : (
          <span className="badge badge-warning animate-pulse-glow">
            <WifiOff size={14} /> {t('status.offline')}
          </span>
        )}

        {/* Sync Outbox Button */}
        <button
          onClick={onOpenSync}
          className="btn btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.8rem', background: alertCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(51,65,85,0.6)', border: alertCount > 0 ? '1px solid #ef4444' : '1px solid #334155' }}
        >
          <RefreshCw size={14} />
          <span>Outbox</span>
          {pendingCount > 0 && <span style={{ background: '#3b82f6', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>{pendingCount}</span>}
          {alertCount > 0 && <span style={{ background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>{alertCount} Alert</span>}
        </button>

        {/* Language Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', padding: '4px 8px', borderRadius: '8px', border: '1px solid #334155' }}>
          <Globe size={14} color="#94a3b8" />
          <select
            value={i18n.language}
            onChange={handleLanguageChange}
            style={{ background: 'transparent', color: '#f8fafc', border: 'none', outline: 'none', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            <option value="en" style={{ background: '#0f172a' }}>English</option>
            <option value="te" style={{ background: '#0f172a' }}>తెలుగు</option>
            <option value="hi" style={{ background: '#0f172a' }}>हिंदी</option>
          </select>
        </div>

        {/* User Info & Logout */}
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '12px', borderLeft: '1px solid #334155' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>{currentUser.full_name}</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{currentUser.role_name}</div>
            </div>
            <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }} title="Logout">
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
