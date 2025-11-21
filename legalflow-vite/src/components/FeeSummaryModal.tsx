import React, { useMemo, useState } from 'react';
import { X, Calendar } from 'lucide-react';
import type { Transaction } from '../types';
import { formatDateKey, parseDateKey } from '../utils/date';

const CLIENT_GROUPS = [
  'Lloyds',
  'Terem Retainer',
  'Terem Hourly',
  'Maar',
  'MDA',
  'Private Medical Malpractice',
] as const;

type ClientGroup = (typeof CLIENT_GROUPS)[number] | 'Other Clients';

interface FeeSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const normalizeName = (value?: string | null) =>
  (value || '').trim().toLowerCase();

const getClientGroup = (transaction: Transaction): ClientGroup => {
  const description = normalizeName(transaction.description);
  const matchedGroup = CLIENT_GROUPS.find(
    group => normalizeName(group) === description
  );
  return matchedGroup ?? 'Other Clients';
};

const FeeSummaryModal: React.FC<FeeSummaryModalProps> = ({
  isOpen,
  onClose,
  transactions,
}) => {
  const today = new Date();
  const defaultStart = formatDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEnd = formatDateKey(today);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const groupedData = useMemo(() => {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    end.setHours(23, 59, 59, 999);

    const groups: Record<ClientGroup, { transactions: Transaction[]; total: number }> = {
      'Lloyds': { transactions: [], total: 0 },
      'Terem Retainer': { transactions: [], total: 0 },
      'Terem Hourly': { transactions: [], total: 0 },
      'Maar': { transactions: [], total: 0 },
      'MDA': { transactions: [], total: 0 },
      'Private Medical Malpractice': { transactions: [], total: 0 },
      'Other Clients': { transactions: [], total: 0 },
    };

    transactions
      .filter(t => t.group === 'fee')
      .forEach(transaction => {
        const date = parseDateKey(transaction.date);
        if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) {
          return;
        }
        const group = getClientGroup(transaction);
        groups[group].transactions.push(transaction);
        groups[group].total += transaction.amount;
      });

    return groups;
  }, [transactions, startDate, endDate]);

  const grandTotal = useMemo(() => {
    return Object.values(groupedData).reduce((sum, group) => sum + group.total, 0);
  }, [groupedData]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Fee Summary by Client Group</h2>
            <p className="text-sm text-slate-500 mt-1">
              סיכום הכנסות שכר טרחה לפי קבוצות לקוח לתקופה נבחרת
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close Fee Summary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm">
              <Calendar className="w-4 h-4 text-blue-600" />
              בחר טווח תאריכים
            </div>
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
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
                  max={formatDateKey(new Date())}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
          {Object.entries(groupedData).map(([groupName, data]) => (
            <div key={groupName} className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">{groupName}</h3>
                <span className="text-sm font-semibold text-slate-600">
                  סה"כ: ₪{data.total.toLocaleString()}
                </span>
              </div>
              {data.transactions.length === 0 ? (
                <p className="text-sm text-slate-400">אין עסקאות בקבוצה זו.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-right px-4 py-2 font-medium">תאריך</th>
                        <th className="text-right px-4 py-2 font-medium">לקוח</th>
                        <th className="text-right px-4 py-2 font-medium">אסמכתא</th>
                        <th className="text-right px-4 py-2 font-medium">סכום</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.transactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">
                            {parseDateKey(transaction.date).toLocaleDateString('he-IL')}
                          </td>
                          <td className="px-4 py-2 text-slate-700 font-semibold">
                            {transaction.description || 'ללא שם'}
                          </td>
                          <td className="px-4 py-2 text-slate-500">
                            {transaction.clientReference ? (
                              <span className="inline-flex px-2 py-0.5 text-xs rounded-lg border border-slate-200 bg-white">
                                #{transaction.clientReference}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-2 font-bold text-slate-800">
                            ₪{transaction.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/60">
          <div className="text-slate-600 text-sm">
            סך הכל הכנסות בתקופה: <span className="font-bold text-slate-900">₪{grandTotal.toLocaleString()}</span>
          </div>
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

export default FeeSummaryModal;

