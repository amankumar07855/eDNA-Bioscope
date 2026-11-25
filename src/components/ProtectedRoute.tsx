import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RequireUser({ children }: { children: React.ReactNode }) {
  const { firebaseUser, serverProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500 font-medium">Verifying researcher session...</div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Enforce email verification for email/password accounts
  const usesPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');
  if (usesPasswordProvider && !firebaseUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (serverProfile?.accountStatus === 'disabled') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { firebaseUser, serverProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07111a] flex items-center justify-center">
        <div className="text-sm text-slate-400 font-medium">Verifying administrator credentials...</div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/control-center/login" replace />;
  }

  if (!serverProfile || serverProfile.role !== 'admin' || serverProfile.accountStatus !== 'active') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
