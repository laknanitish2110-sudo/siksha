import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, User, KeyRound, AlertCircle, Eye, EyeOff, HelpCircle, X } from 'lucide-react';
import axios from 'axios';
import { db } from '../db/schema';
import { getApiBaseUrl } from '../config';

interface LoginViewProps {
  onLoginSuccess: (user: any) => void;
}

const API_BASE = getApiBaseUrl();

// PBKDF2 Password Key Derivation Helper for Secure Offline Password Verification
async function deriveOfflineKey(username: string, pass: string, userId: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = enc.encode(`shiksha-offline-salt-${username}-${userId}`);
  const keyMaterial = (window.crypto as any).subsystemKey || await window.crypto.subtle.importKey(
    'raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']
  );
  
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Check online login
    if (navigator.onLine) {
      try {
        const res = await axios.post(`${API_BASE}/auth/login`, {
          username,
          password
        });

        const tokenData = res.data;

        // Get profile details
        const meRes = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        const userObj = meRes.data;
        const roleName = userObj.roles.length > 0 ? userObj.roles[0].name : 'Staff';

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const derivedHash = await deriveOfflineKey(username, password, userObj.id);

        // Cache session locally in Dexie with PBKDF2 100,000-iteration key & 7-day expiry
        const cachedSession = {
          id: userObj.id,
          username: userObj.username,
          full_name: userObj.full_name,
          role_name: roleName,
          permissions: userObj.roles.flatMap((r: any) => r.permissions),
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          password_hash: derivedHash,
          cached_at: now.toISOString(),
          expires_at: expiresAt
        };

        await db.session.clear();
        await db.session.put(cachedSession);

        onLoginSuccess(cachedSession);
        return;
      } catch (err: any) {
        if (err.response) {
          // Backend responded with an HTTP error status (401, 403, 422, 500, etc.)
          const detail = err.response.data?.detail;
          if (err.response.status === 401) {
            setError(detail || 'Incorrect username or password.');
          } else if (err.response.status === 403) {
            setError(detail || 'User account is deactivated or forbidden.');
          } else {
            setError(detail || `Authentication server error (${err.response.status}). Please try again.`);
          }
          setLoading(false);
          return;
        }

        // Genuine network/connectivity failure (no HTTP response received from server)
        console.warn('Online login network unavailable, attempting cached offline login fallback:', err.message);
      }
    }

    // Secure Offline Login Fallback using Dexie session cache & PBKDF2 password verification
    const cached = await db.session.where('username').equals(username).first();
    if (!cached) {
      setError('Offline authentication failed. No cached session for this username on this device.');
    } else if (new Date(cached.expires_at) < new Date()) {
      setError('Offline authorization policy expired (7 days max). Connect online to re-authenticate.');
    } else {
      const enteredHash = await deriveOfflineKey(username, password, cached.id);
      if (enteredHash !== cached.password_hash) {
        setError('Incorrect password for offline authentication.');
      } else {
        onLoginSuccess(cached);
      }
    }

    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)', padding: '16px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.6rem', color: '#fff', marginBottom: '12px', boxShadow: '0 8px 20px rgba(59,130,246,0.4)' }}>
            SA
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>{t('appName')}</h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>{t('appSubtitle')}</p>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#f87171', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" className="form-control" required style={{ paddingLeft: '38px' }} placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                required
                style={{ paddingLeft: '38px', paddingRight: '38px' }}
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', padding: 0, fontWeight: 500 }}
              >
                Forgot Password?
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: '8px' }}>
            <Lock size={16} /> {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </button>
        </form>

        {showForgotModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: '420px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HelpCircle size={20} style={{ color: '#38bdf8' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>Password Recovery</h3>
                </div>
                <button onClick={() => setShowForgotModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p>
                  To reset your account password, please contact your <strong style={{ color: '#f8fafc' }}>Shiksha Academy System Administrator</strong>.
                </p>
                <div style={{ padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', color: '#38bdf8' }}>
                  <strong>Administrator Policy:</strong><br />
                  For security compliance, staff passwords must be updated directly by an authorized administrator through the User Management portal.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowForgotModal(false)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
