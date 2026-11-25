import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';
import { useAuth } from '../context/AuthContext';

const forgotSchema = z.object({
  email: z.string().email('Enter your registered email address'),
});

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: { email: string }) => {
    setErrorMsg(null);
    try {
      await sendPasswordReset(data.email);
      setSentTo(data.email);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send password reset email');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/">
            <EcoDnaLogo />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">Account Recovery</h1>
            <p className="mt-1 text-sm text-slate-600">
              Enter your registered email address and Firebase will send a secure password reset link.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-sm text-rose-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {sentTo ? (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Password reset email sent
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Check the inbox for <span className="font-mono font-medium">{sentTo}</span> and follow the link to create a new password, then return to sign in.
              </p>
              <Link
                to="/login"
                className="inline-block px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Registered Email Address</label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="researcher@institute.org"
                />
                {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Password Reset Link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
