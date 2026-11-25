import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmailPage() {
  const { firebaseUser, resendVerificationEmail, reloadVerificationState, logout } = useAuth();
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCheckVerified = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const ok = await reloadVerificationState();
      if (ok) {
        navigate('/dashboard');
      } else {
        setStatusMsg('Email is not verified yet. Please click the verification link in your inbox and try again.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to check verification status');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await resendVerificationEmail();
      setStatusMsg('A new verification email has been dispatched to your inbox.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to resend verification email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/">
            <EcoDnaLogo />
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Sign Out
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <MailCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">Verify Your Email Address</h1>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-mono font-medium text-slate-900">{firebaseUser?.email ?? 'your email'}</span>.
              Verify your account before opening your personal research dashboard.
            </p>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700">
              {statusMsg}
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleCheckVerified}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              I Verified My Email — Continue
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleResend}
              className="w-full py-2.5 px-4 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              Resend Verification Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
