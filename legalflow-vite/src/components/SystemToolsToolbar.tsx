import React from 'react';

interface SystemToolsToolbarProps {
  syncStatus: 'idle' | 'syncing' | 'error';
  syncLabel: string;
  syncColorClass: string;
  lastSyncText: string;
  syncError?: string | null;
  importFeedback?: { type: 'success' | 'error'; message: string } | null;
  alertsCount: number;
  onManualSync: () => void;
  onImport: () => void;
  onExport: () => void;
  onOpenBalance: () => void;
  onShowAlerts: () => void;
}

const buttonClass =
  'px-3 py-1.5 text-sm rounded-xl border border-white/10 text-slate-100 hover:bg-white/10 transition-colors backdrop-blur';

const SystemToolsToolbar: React.FC<SystemToolsToolbarProps> = ({
  syncStatus,
  syncLabel,
  syncColorClass,
  lastSyncText,
  syncError,
  importFeedback,
  alertsCount,
  onManualSync,
  onImport,
  onExport,
  onOpenBalance,
  onShowAlerts,
}) => (
  <div className="flex flex-col gap-2 text-right text-slate-100">
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-300">
      <span className="flex items-center gap-2 text-slate-300">
        <span className={`w-2 h-2 rounded-full ${syncColorClass}`}></span>
        <span className="font-semibold text-white">{syncLabel}</span>
        <span className="text-[11px] text-slate-400">{lastSyncText}</span>
      </span>
      <button
        onClick={onManualSync}
        disabled={syncStatus === 'syncing'}
        className="px-3 py-1 text-xs font-semibold rounded-xl border border-white/10 text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500 disabled:border-white/5"
      >
        {syncStatus === 'syncing' ? 'מסנכרן...' : 'סנכרון עכשיו'}
      </button>
    </div>
    {syncError && (
      <div className="text-[11px] text-red-300">
        {syncError}
      </div>
    )}
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button onClick={onImport} className={buttonClass}>
        ייבוא גיבוי
      </button>
      <button onClick={onExport} className={buttonClass}>
        ייצוא גיבוי
      </button>
      <button onClick={onOpenBalance} className={buttonClass}>
        עדכון יתרת פתיחה
      </button>
      <button onClick={onShowAlerts} className={`${buttonClass} flex items-center gap-2`}>
        <span>התראות</span>
        {alertsCount > 0 && (
          <span className="rounded-full bg-red-500/80 px-2 py-0.5 text-[11px] font-bold text-white">
            {alertsCount}
          </span>
        )}
      </button>
    </div>
    {importFeedback && (
      <div
        className={`text-xs ${
          importFeedback.type === 'success' ? 'text-emerald-300' : 'text-red-300'
        }`}
      >
        {importFeedback.message}
      </div>
    )}
  </div>
);

export default SystemToolsToolbar;

