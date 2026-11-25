import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <EcoDnaLogo />
        </div>
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-display font-bold text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Your account does not hold verified server authorization for this environment, or your session has been restricted.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/dashboard"
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/"
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
