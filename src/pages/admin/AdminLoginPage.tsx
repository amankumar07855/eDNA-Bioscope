import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { EcoDnaLogo } from '../../components/EcoDnaLogo';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';

export default function AdminLoginPage() {
  const { loginWithEmail, loginWithGoogle, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const verifyAndEnter = async (role: 'user' | 'admin') => {
    if (role !== 'admin') {
      await logout();
      setErrorMsg('Access denied. This account does not have server-verified administrator privileges.');
      return;
    }
    await apiFetch('/api/admin/log-login', { method: 'POST' });
    navigate('/control-center');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const profile = await loginWithEmail(email, password, false);
      await verifyAndEnter(profile.role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Administrator authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAdmin = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const profile = await loginWithGoogle();
      await verifyAndEnter(profile.role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google administrator authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07111a] text-slate-100 flex flex-col justify-center py-12 px-4">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <EcoDnaLogo dark />
          <span className="text-xs font-mono text-cyan-400">Control Center Auth</span>
        </div>

        <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-700/50 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-white">Administrator Sign In</h1>
              <p className="text-xs text-slate-400">Server-verified role-based access control</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-950/70 border border-rose-800 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleAdmin}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            Continue with Authorized Google Account
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-3 text-xs text-slate-500">or email credentials</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify &amp; Enter Control Center
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
