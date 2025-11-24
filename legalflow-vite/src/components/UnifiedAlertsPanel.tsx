import React, { Fragment, useMemo } from 'react';
import { AlertTriangle, Activity, TrendingUp, X } from 'lucide-react';
import type {
  AlertCategory,
  AlertSeverity,
  UnifiedAlert,
  AlertTarget,
} from '../services/alertEngine';

interface UnifiedAlertsPanelProps {
  isOpen: boolean;
  alerts: UnifiedAlert[];
  onClose: () => void;
  onNavigate: (target?: AlertTarget) => void;
}

const categoryOrder: AlertCategory[] = ['collection_overdue', 'cashflow_client', 'cashflow_expense'];

const categoryLabels: Record<AlertCategory, { title: string; description: string }> = {
  collection_overdue: {
    title: 'חובות מתעכבים',
    description: 'דרישות גבייה שעברו את רף 45 הימים וזקוקות לטיפול דחוף.',
  },
  cashflow_client: {
    title: 'לקוחות איטיים',
    description: 'לקוחות שהחלו לשלם באיטיות חריגה ביחס לחודשים קודמים.',
  },
  cashflow_expense: {
    title: 'קפיצות בהוצאות',
    description: 'תנועות הוצאה משמעותיות שדוחפות את התזרים מטה.',
  },
};

const severityBadge: Record<AlertSeverity, string> = {
  high: 'bg-rose-500/20 text-rose-100 border border-rose-400/40',
  warning: 'bg-amber-500/20 text-amber-100 border border-amber-400/40',
  info: 'bg-blue-500/20 text-blue-100 border border-blue-400/40',
};

const iconForCategory = (category: AlertCategory) => {
  if (category === 'cashflow_expense') return <TrendingUp className="w-4 h-4" />;
  if (category === 'cashflow_client') return <Activity className="w-4 h-4" />;
  return <AlertTriangle className="w-4 h-4" />;
};

const UnifiedAlertsPanel: React.FC<UnifiedAlertsPanelProps> = ({ isOpen, alerts, onClose, onNavigate }) => {
  const grouped = useMemo(() => {
    const map = new Map<AlertCategory, UnifiedAlert[]>();
    alerts.forEach(alert => {
      if (!map.has(alert.category)) {
        map.set(alert.category, []);
      }
      map.get(alert.category)!.push(alert);
    });
    categoryOrder.forEach(category => {
      if (map.has(category)) {
        map.get(category)!.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
      }
    });
    return map;
  }, [alerts]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" dir="rtl">
      <div className="w-full max-w-4xl bg-[#030712] text-white rounded-3xl border border-white/10 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-xl font-bold">מרכז ההתראות</h3>
            <p className="text-xs text-slate-400">כל ההתראות הקריטיות במקום אחד</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="סגור התראות">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {alerts.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">אין התראות פעילות. כל הנתונים מעודכנים.</div>
          )}

          {alerts.length > 0 &&
            categoryOrder.map(category => {
              const entries = grouped.get(category) ?? [];
              if (!entries.length) return <Fragment key={category} />;
              return (
                <section key={category} className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      {iconForCategory(category)}
                      {categoryLabels[category].title}
                    </h4>
                    <p className="text-xs text-slate-400">{categoryLabels[category].description}</p>
                  </div>
                  <div className="space-y-3">
                    {entries.map(alert => (
                      <button
                        key={alert.id}
                        onClick={() => onNavigate(alert.target)}
                        className="w-full text-right bg-white/5 border border-white/10 rounded-2xl px-4 py-3 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${severityBadge[alert.severity]}`}>
                            {alert.severity === 'high' ? 'התראה קריטית' : alert.severity === 'warning' ? 'התראה' : 'עדכון'}
                          </div>
                          {alert.overdueDays !== undefined && (
                            <span className="text-xs font-bold text-rose-200">+{alert.overdueDays} ימים</span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <p className="text-sm font-semibold text-white">{alert.title}</p>
                          <p className="text-xs text-slate-300 leading-relaxed">{alert.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-400">
                          {alert.trackerLabel && <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-200">{alert.trackerLabel}</span>}
                          {alert.accountNumber && <span>חשבון: {alert.accountNumber}</span>}
                          {alert.amount !== undefined && <span>סכום: {formatCurrency(alert.amount)}</span>}
                          {alert.demandDate && <span>מועד דרישה: {new Date(alert.demandDate).toLocaleDateString('he-IL')}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="border border-white/20 text-sm font-semibold text-slate-100 px-5 py-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

const formatCurrency = (value: number) =>
  `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

export default UnifiedAlertsPanel;

