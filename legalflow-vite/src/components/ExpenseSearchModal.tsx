import React, { useMemo, useState } from 'react';
import { X, Calendar, Search, TrendingDown } from 'lucide-react';
import type { Transaction, TransactionGroup } from '../types';
import { formatDateKey, parseDateKey } from '../utils/date';

interface ExpenseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const EXPENSE_GROUPS: TransactionGroup[] = ['operational', 'tax', 'loan', 'personal'];

const GROUP_LABELS: Record<TransactionGroup, string> = {
  fee: 'שכר טרחה',
  other_income: 'הכנסות אחרות',
  operational: 'הוצאות תפעוליות',
  tax: 'מיסים',
  loan: 'הלוואות',
  personal: 'משיכות פרטיות',
  bank_adjustment: 'התאמת בנק',
};

const normalize = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .replace(/[\s"'\-_.]/g, '');

const ExpenseSearchModal: React.FC<ExpenseSearchModalProps> = ({
  isOpen,
  onClose,
  transactions,
}) => {
  const today = new Date();
  const defaultStart = formatDateKey(new Date(today.getFullYear(), 0, 1));
  const defaultEnd = formatDateKey(today);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [search, setSearch] = useState('');

  const { matchingTransactions, total, groupedByDescription } = useMemo(() => {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    end.setHours(23, 59, 59, 999);
    const normalizedSearch = search.trim() ? normalize(search) : '';

    const matching: Transaction[] = [];
    transactions.forEach(transaction => {
      if (!EXPENSE_GROUPS.includes(transaction.group)) return;
      const date = parseDateKey(transaction.date);
      if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) return;
      if (normalizedSearch) {
        const matchesDescription = normalize(transaction.description).includes(normalizedSearch);
        const matchesCategory = normalize(transaction.category).includes(normalizedSearch);
        if (!matchesDescription && !matchesCategory) return;
      }
      matching.push(transaction);
    });

    matching.sort((a, b) => parseDateKey(b.date).getTime() - parseDateKey(a.date).getTime());

    // Group by normalized description for the summary view
    const groups = new Map<string, { displayName: string; total: number; count: number }>();
    matching.forEach(t => {
      const displayName = (t.description || t.category || 'ללא תיאור').trim();
      const key = normalize(displayName);
      const existing = groups.get(key);
      if (existing) {
        existing.total += t.amount;
        existing.count += 1;
      } else {
        groups.set(key, { displayName, total: t.amount, count: 1 });
      }
    });
    const groupedArray = Array.from(groups.values()).sort((a, b) => b.total - a.total);

    const sumTotal = matching.reduce((sum, t) => sum + t.amount, 0);

    return {
      matchingTransactions: matching,
      total: sumTotal,
      groupedByDescription: groupedArray,
    };
  }, [transactions, startDate, endDate, search]);

  if (!isOpen) return null;

  const renderCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">חיפוש הוצאות לפי שם</h2>
            <p className="text-sm text-slate-500 mt-1">
              חפש הוצאה ספציפית לפי תיאור או קטגוריה. כולל הוצאות תפעוליות, מיסים, הלוואות ומשיכות.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="סגור"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center flex-wrap">
            <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm">
              <Calendar className="w-4 h-4 text-blue-600" />
              טווח תאריכים
            </div>
            <label className="text-xs font-medium text-slate-500 flex flex-col">
              מתאריך
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-500 flex flex-col">
              עד תאריך
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </label>
            <label className="text-xs font-medium text-slate-500 flex flex-col flex-1 min-w-[220px]">
              חיפוש לפי שם או קטגוריה
              <div className="relative mt-1">
                <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="הקלד לדוגמה: 'שכירות', 'חשמל', 'דלק'..."
                  className="w-full border border-slate-200 rounded-lg pr-8 pl-8 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="נקה חיפוש"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Summary card */}
        <div className="p-6 border-b border-slate-100">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5" />
                  סה"כ הוצאות תואמות
                </h3>
                <p className="text-xs text-rose-700 mt-1">
                  {matchingTransactions.length} תנועות בטווח שנבחר
                  {search.trim() && <> · מסונן לפי "{search}"</>}
                </p>
              </div>
              <p className="text-3xl font-bold text-rose-900">{renderCurrency(total)}</p>
            </div>
          </div>
        </div>

        {/* Grouped summary */}
        {groupedByDescription.length > 0 && (
          <div className="p-6 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-700 mb-3">סיכום לפי תיאור</h4>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right px-4 py-2 font-medium">תיאור</th>
                    <th className="text-right px-4 py-2 font-medium">מספר תנועות</th>
                    <th className="text-right px-4 py-2 font-medium">סה"כ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedByDescription.map(g => (
                    <tr key={g.displayName} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 font-medium">{g.displayName}</td>
                      <td className="px-4 py-2 text-slate-500">{g.count}</td>
                      <td className="px-4 py-2 font-bold text-rose-700">{renderCurrency(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed transactions */}
        <div className="max-h-[40vh] overflow-y-auto p-6 space-y-3">
          <h4 className="text-sm font-bold text-slate-700">פירוט תנועות</h4>
          {matchingTransactions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              {search.trim() ? `לא נמצאו הוצאות התואמות "${search}" בטווח התאריכים שנבחר.` : 'אין הוצאות בטווח התאריכים שנבחר.'}
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right px-4 py-2 font-medium">תאריך</th>
                    <th className="text-right px-4 py-2 font-medium">תיאור</th>
                    <th className="text-right px-4 py-2 font-medium">קטגוריה</th>
                    <th className="text-right px-4 py-2 font-medium">סוג</th>
                    <th className="text-right px-4 py-2 font-medium">סטטוס</th>
                    <th className="text-right px-4 py-2 font-medium">סכום</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchingTransactions.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600">
                        {parseDateKey(t.date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-2 text-slate-700 font-medium">{t.description || 'ללא תיאור'}</td>
                      <td className="px-4 py-2 text-slate-500">{t.category || '-'}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{GROUP_LABELS[t.group]}</td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            t.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {t.status === 'completed' ? 'שולם' : 'צפוי'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-bold text-rose-700">{renderCurrency(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end bg-slate-50/60">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseSearchModal;
