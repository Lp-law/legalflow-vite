import React from 'react';
import { AlertTriangle, X, Activity, TrendingUp } from 'lucide-react';
import type { CollectionAlert, CashflowAlert } from '../services/alertService';
import type { OverdueAlertEntry } from './OverdueAlertsPanel';

interface AdvancedAlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  overdueEntries: OverdueAlertEntry[];
  collectionAlerts: CollectionAlert[];
  cashflowAlerts: CashflowAlert[];
  onNavigateToCollection: (source: CollectionAlert['source'], itemId: string) => void;
  onNavigateToOverdue: (entry: OverdueAlertEntry) => void;
  onNavigateToDashboard: () => void;
}

const severityClasses: Record<'info' | 'warning' | 'high', string> = {
  info: 'bg-blue-900/20 border border-blue-400/40 text-blue-100',
  warning: 'bg-amber-900/20 border border-amber-400/50 text-amber-100',
  high: 'bg-rose-900/30 border border-rose-400/70 text-rose-100',
};

const AdvancedAlertsPanel: React.FC<AdvancedAlertsPanelProps> = ({
  isOpen,
  onClose,
  overdueEntries,
  collectionAlerts,
  cashflowAlerts,
  onNavigateToCollection,
  onNavigateToOverdue,
  onNavigateToDashboard,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-[#050b18] text-white rounded-3xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-xl font-bold">Alerts</h3>
            <p className="text-xs text-slate-400">תצוגת התראות מרוכזת לפי סוג</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              חובות מעל 45 יום
            </h4>
            {overdueEntries.length === 0 ? (
              <p className="text-xs text-slate-500">אין חובות פתוחים מעל 45 יום.</p>
            ) : (
              <ul className="space-y-2">
                {overdueEntries.map(entry => (
                  <li key={entry.id}>
                    <button
                      onClick={() => onNavigateToOverdue(entry)}
                      className="w-full text-right text-sm px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {entry.tracker === 'lloyds' ? 'לוידס' : entry.tracker === 'generic' ? 'לקוחות שונים' : 'אקסס'}
                      : מס' חשבון {entry.accountNumber} – +{entry.overdueDays} ימים
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Collection Risk
            </h4>
            {collectionAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">אין חובות בסיכון גבוה כרגע.</p>
            ) : (
              <ul className="space-y-3">
                {collectionAlerts.map(alert => (
                  <li key={alert.id}>
                    <button
                      onClick={() => onNavigateToCollection(alert.source, alert.itemId)}
                      className={`w-full text-right text-sm px-4 py-3 rounded-2xl flex items-center gap-3 ${severityClasses[alert.severity]}`}
                    >
                      <AlertTriangle className="w-5 h-5 text-current shrink-0" />
                      <span>{alert.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Cashflow Insights
            </h4>
            {cashflowAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">אין חריגות בתזרים.</p>
            ) : (
              <ul className="space-y-3">
                {cashflowAlerts.map(alert => (
                  <li key={alert.id}>
                    <button
                      onClick={() =>
                        alert.source && alert.itemId
                          ? onNavigateToCollection(alert.source, alert.itemId)
                          : onNavigateToDashboard()
                      }
                      className={`w-full text-right text-sm px-4 py-3 rounded-2xl flex items-center gap-3 ${severityClasses[alert.severity]}`}
                    >
                      {alert.type === 'expense_spike' ? (
                        <TrendingUp className="w-5 h-5 text-current shrink-0" />
                      ) : (
                        <Activity className="w-5 h-5 text-current shrink-0" />
                      )}
                      <span>{alert.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdvancedAlertsPanel;


