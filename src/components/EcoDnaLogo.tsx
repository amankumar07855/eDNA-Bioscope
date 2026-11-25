import React from 'react';

interface EcoDnaLogoProps {
  compact?: boolean;
  dark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const EcoDnaLogo: React.FC<EcoDnaLogoProps> = ({ compact = false, dark = false, size = 'md' }) => {
  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <span
        className={`${iconSize} rounded-lg flex items-center justify-center shrink-0 border ${
          dark ? 'bg-[#071f1a] border-emerald-700/50' : 'bg-white border-emerald-200'
        }`}
      >
        <svg viewBox="0 0 64 64" className="w-5/6 h-5/6" aria-hidden="true">
          <defs>
            <linearGradient id="ecoHelixGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <path
            d="M21 10c0 12 22 12 22 22s-22 10-22 22M43 10c0 12-22 12-22 22s22 10 22 22"
            stroke="url(#ecoHelixGrad)"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M26 16h12M23 32h18M26 48h12"
            stroke={dark ? '#34d399' : '#047857'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M32 31c-6-6-13-4-15 3 6 2 11 0 15-3Z"
            fill="#10b981"
          />
          <path
            d="M32 31c6-6 13-4 15 3-6 2-11 0-15-3Z"
            fill="#06b6d4"
          />
        </svg>
      </span>
      {!compact && (
        <span
          className={`font-display font-bold tracking-tight ${textSize} ${
            dark ? 'text-white' : 'text-slate-900'
          }`}
        >
          EcoDNA <span className={dark ? 'text-cyan-400' : 'text-emerald-700'}>AI</span>
        </span>
      )}
    </span>
  );
};
