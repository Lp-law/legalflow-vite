import React from 'react';

export type AlertTrackerType = 'lloyds' | 'generic';

export interface OverdueAlertEntry {
  id: string;
  tracker: AlertTrackerType;
  accountNumber: string;
  name: string;
  demandDate: string | null;
  amount: number;
  overdueDays: number;
}

interface OverdueAlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entries: OverdueAlertEntry[];
  onNavigate: (entry: OverdueAlertEntry) => void;
}

const trackerLabel: Record<AlertTrackerType, string> = {
  lloyds: 'מעקב גבייה – לוידס',
  generic: 'מעקב גבייה – לקוחות שונים',
};

const OverdueAlertsPanel: React.FC<OverdueAlertsPanelProps> = ({ isOpen, onClose, entries, onNavigate }) => {
  if (!isOpen) {
    return null;
  }

  const formatCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('he-IL') : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" dir="rtl">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">התראות</h3>
            <p className="text-sm text-slate-500">רשימת כל הדרישות שחצו את רף 45 הימים.</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
          >
            סגור
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {entries.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              אין התראות פתוחות. כל דרישות הגבייה מעודכנות.
            </div>
          )}
          {entries.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {entries.map(entry => (
                <li key={`${entry.tracker}-${entry.id}`} className="px-6 py-4">
                  <button
                    onClick={() => onNavigate(entry)}
                    className="w-full text-right"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-600">
                          {trackerLabel[entry.tracker]}
                        </span>
                        <span className="text-sm font-bold text-red-600">
                          +{entry.overdueDays} ימים
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                        <span className="font-bold">{entry.accountNumber}</span>
                        <span>{entry.name || 'ללא שם'}</span>
                        <span>מועד דרישה: {formatDate(entry.demandDate)}</span>
                        <span>{formatCurrency(entry.amount)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverdueAlertsPanel;

