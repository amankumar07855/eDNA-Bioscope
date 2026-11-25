import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  Compass,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { EcoDnaLogo } from './EcoDnaLogo';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects & Samples', icon: FolderKanban },
  { to: '/upload', label: 'Dataset Upload & QC', icon: Upload },
  { to: '/analysis', label: 'Analysis & Diversity', icon: BarChart3 },
  { to: '/species', label: 'Species Explorer', icon: Compass },
  { to: '/map', label: 'Biodiversity Map', icon: MapPin },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/profile', label: 'Account & Profile', icon: UserCog },
];

export default function WorkspaceLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { serverProfile, firebaseUser, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#061f1a] text-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-emerald-900/70">
        <Link to="/" onClick={() => setDrawerOpen(false)}>
          <EcoDnaLogo dark />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden p-1.5 rounded text-slate-300 hover:bg-emerald-900/50"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-700/40 text-white border border-emerald-500/30'
                    : 'text-slate-300 hover:bg-emerald-900/40 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0 text-cyan-300" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}

        <div className="pt-4 mt-4 border-t border-emerald-900/70">
          <Link
            to="/demo"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cyan-200 hover:bg-emerald-900/40 transition-colors"
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>Demo Sandbox</span>
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t border-emerald-900/70 space-y-3">
        <div className="text-xs">
          <div className="font-semibold text-white truncate">
            {serverProfile?.fullName || firebaseUser?.displayName || 'Researcher'}
          </div>
          <div className="text-slate-400 truncate font-mono text-[11px]">
            {serverProfile?.email || firebaseUser?.email}
          </div>
          <div className="text-emerald-300 text-[11px] mt-0.5">
            {serverProfile?.userCategory || 'Researcher'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full py-2 px-3 rounded-lg border border-emerald-800 hover:bg-emerald-900/60 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 sticky top-0 h-screen">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{navContent}</div>
          <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold text-slate-900 truncate">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/upload"
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Upload Dataset
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
