import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ShieldCheck, RefreshCcw, RotateCcw, Trash2, Plus, AlertTriangle } from 'lucide-react';
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  UnauthorizedError,
  type BackupSnapshotMeta,
} from '../services/cloudService';

interface CloudBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  authToken: string | null;
  onRestored: () => void;
  onUnauthorized: () => void;
}

const formatTimestamp = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CloudBackupModal: React.FC<CloudBackupModalProps> = ({
  isOpen,
  onClose,
  authToken,
  onRestored,
  onUnauthorized,
}) => {
  const [snapshots, setSnapshots] = useState<BackupSnapshotMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await listBackups(authToken);
      setSnapshots(list);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      console.error('Failed to load snapshots', e);
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הגיבויים');
    } finally {
      setIsLoading(false);
    }
  }, [authToken, onUnauthorized]);

  useEffect(() => {
    if (!isOpen) {
      setPendingRestoreId(null);
      setInfo(null);
      setError(null);
      return;
    }
    refresh();
  }, [isOpen, refresh]);

  const handleCreate = async () => {
    if (!authToken) return;
    setBusyId('__create__');
    setError(null);
    setInfo(null);
    try {
      const result = await createBackup(authToken, {
        label: labelDraft.trim() || null,
        source: 'manual',
      });
      setLabelDraft('');
      setInfo(`גיבוי נוצר בהצלחה (${result.transactionCount} תנועות)`);
      await refresh();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      console.error('Failed to create snapshot', e);
      setError(e instanceof Error ? e.message : 'שגיאה ביצירת גיבוי');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestoreClick = (id: string) => {
    if (pendingRestoreId === id) return;
    setPendingRestoreId(id);
    setError(null);
    setInfo(null);
  };

  const handleRestoreConfirm = async (id: string) => {
    if (!authToken) return;
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      const result = await restoreBackup(authToken, id);
      setInfo(
        `שוחזר בהצלחה (${result.transactionCount} תנועות). נשמר גיבוי בטיחות אוטומטי לפני השחזור.`
      );
      setPendingRestoreId(null);
      await refresh();
      onRestored();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      console.error('Failed to restore snapshot', e);
      setError(e instanceof Error ? e.message : 'שחזור הגיבוי נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!authToken) return;
    if (!window.confirm('למחוק לצמיתות גיבוי זה? לא ניתן לבטל את הפעולה.')) {
      return;
    }
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      await deleteBackup(authToken, id);
      setInfo('הגיבוי נמחק');
      await refresh();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      console.error('Failed to delete snapshot', e);
      setError(e instanceof Error ? e.message : 'מחיקת הגיבוי נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => (a.id < b.id ? 1 : -1));
  }, [snapshots]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh]"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">גיבויים בענן</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                גיבויים נשמרים בענן ובמסד הנתונים. נשמרים עד 30 הגיבויים האחרונים.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value.slice(0, 120))}
              placeholder="תווית לגיבוי (לא חובה) – לדוגמה: 'לפני חישוב מס מאי'"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleCreate}
              disabled={busyId === '__create__'}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              {busyId === '__create__' ? 'יוצר גיבוי...' : 'צור גיבוי עכשיו'}
            </button>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              רענן
            </button>
          </div>
          {info && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
              {info}
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && snapshots.length === 0 ? (
            <div className="text-center text-slate-500 py-12">טוען גיבויים...</div>
          ) : sortedSnapshots.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              עדיין לא נוצרו גיבויים. לחץ "צור גיבוי עכשיו" כדי להתחיל.
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedSnapshots.map((snap) => {
                const isPending = pendingRestoreId === snap.id;
                const isBusy = busyId === snap.id;
                return (
                  <li
                    key={snap.id}
                    className={`border rounded-2xl p-4 transition-colors ${
                      isPending ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {formatTimestamp(snap.createdAt || snap.id)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {snap.transactionCount} תנועות
                          {snap.label ? ` · ${snap.label}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isPending ? (
                          <button
                            onClick={() => handleRestoreClick(snap.id)}
                            disabled={Boolean(busyId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            שחזר
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setPendingRestoreId(null)}
                              disabled={isBusy}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                            >
                              ביטול
                            </button>
                            <button
                              onClick={() => handleRestoreConfirm(snap.id)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isBusy ? 'משחזר...' : 'אישור סופי - שחזר'}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(snap.id)}
                          disabled={Boolean(busyId)}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          aria-label="מחק גיבוי"
                          title="מחק גיבוי"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {isPending && (
                      <p className="mt-2 text-xs text-amber-800">
                        שחזור יחליף את כל התנועות והגדרות הענן הנוכחיות. גיבוי בטיחות יישמר אוטומטית
                        לפני הביצוע, כך שתוכל לחזור אחורה גם משחזור.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloudBackupModal;
