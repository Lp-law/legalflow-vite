import React, { useMemo, useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { Transaction } from '../types';
import { formatDateKey, parseDateKey } from '../utils/date';

const SPECIAL_CLIENTS = [
  { id: 'lloyds', label: 'לוידס', tokens: ['לוידס', 'loyds', 'lloyds'] },
  { id: 'terem_retainer', label: 'טרם ריטיינר', tokens: ['טרם ריטיינר', 'terem retainer'] },
  { id: 'terem_hourly', label: 'טרם שעתי', tokens: ['טרם שעתי', 'terem hourly'] },
  { id: 'mar', label: 'מ.א.ר', tokens: ['מ.א.ר', 'מאר', 'mar'] },
  { id: 'mda', label: 'מד"א', tokens: ['מד"א', 'מדא', 'mda'] },
  { id: 'private_med_mal', label: 'רשלנות רפואית פרטי', tokens: ['רשלנות רפואית פרטי', 'med mal', 'private med mal'] },
] as const;

type SpecialClientId = (typeof SPECIAL_CLIENTS)[number]['id'];
type ClientBucket = SpecialClientId | 'other_clients';

interface FeeSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const normalize = (value?: string | null) =>
  (value || '').toLowerCase().replace(/[\s"'\-_.]/g, '');

const resolveBucket = (description?: string): ClientBucket => {
  const normalizedDescription = normalize(description);
  const matched = SPECIAL_CLIENTS.find(client =>
    client.tokens.some(token => normalizedDescription.includes(normalize(token)))
  );
  return matched ? matched.id : 'other_clients';
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

  const { groupedData, grandTotal } = useMemo(() => {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    end.setHours(23, 59, 59, 999);

    const buckets: Record<ClientBucket, { label: string; transactions: Transaction[]; total: number }> =
      SPECIAL_CLIENTS.reduce((acc, client) => {
        acc[client.id] = { label: client.label, transactions: [], total: 0 };
        return acc;
      }, {} as Record<ClientBucket, { label: string; transactions: Transaction[]; total: number }>);

    buckets.other_clients = { label: 'לקוחות אחרים', transactions: [], total: 0 };

    let totalIncome = 0;

    transactions
      .filter(t => t.type === 'income' && t.group === 'fee')
      .forEach(transaction => {
        const date = parseDateKey(transaction.date);
        if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) {
          return;
        }
        totalIncome += transaction.amount;
        const bucketId = resolveBucket(transaction.description);
        buckets[bucketId].transactions.push(transaction);
        buckets[bucketId].total += transaction.amount;
      });

    const specialSum = SPECIAL_CLIENTS.reduce((sum, client) => sum + buckets[client.id].total, 0);
    buckets.other_clients.total = totalIncome - specialSum;

    return {
      groupedData: buckets,
      grandTotal: totalIncome,
    };
  }, [transactions, startDate, endDate]);

  if (!isOpen) {
    return null;
  }

  const renderCurrency = (value: number) => `₪${value.toLocaleString()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">סיכום שכר טרחה לפי סוג לקוח</h2>
            <p className="text-sm text-slate-500 mt-1">
              פילוח תרומת הלקוחות המיוחדים לשכר הטרחה בתקופה נבחרת
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

        <div className="p-6 border-b border-slate-100">
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">סוג לקוח</th>
                  <th className="px-4 py-3 font-medium">סה"כ שכר טרחה</th>
                  <th className="px-4 py-3 font-medium">אחוז מהתקופה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SPECIAL_CLIENTS.map(client => {
                  const bucket = groupedData[client.id];
                  const percentage = grandTotal ? (bucket.total / grandTotal) * 100 : 0;
                  return (
                    <tr key={client.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{client.label}</td>
                      <td className="px-4 py-3">{renderCurrency(bucket.total)}</td>
                      <td className="px-4 py-3">{percentage.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {groupedData.other_clients.label}
                  </td>
                  <td className="px-4 py-3">{renderCurrency(groupedData.other_clients.total)}</td>
                  <td className="px-4 py-3">
                    {grandTotal ? ((groupedData.other_clients.total / grandTotal) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <td className="px-4 py-3">סה"כ</td>
                  <td className="px-4 py-3">{renderCurrency(grandTotal)}</td>
                  <td className="px-4 py-3">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100">
          {[...SPECIAL_CLIENTS.map(client => groupedData[client.id]), groupedData.other_clients].map(
            bucket => (
              <div key={bucket.label} className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">{bucket.label}</h3>
                  <span className="text-sm font-semibold text-slate-600">
                    סה"כ: {renderCurrency(bucket.total)}
                  </span>
                </div>
                {bucket.transactions.length === 0 ? (
                  <p className="text-sm text-slate-400">אין עסקאות בקבוצה זו בתקופה הנבחרת.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-right px-4 py-2 font-medium">תאריך</th>
                          <th className="text-right px-4 py-2 font-medium">לקוח</th>
                          <th className="text-right px-4 py-2 font-medium">אסמכתא</th>
                          <th className="text-right px-4 py-2 font-medium">סטטוס</th>
                          <th className="text-right px-4 py-2 font-medium">סכום</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bucket.transactions.map(transaction => (
                          <tr key={transaction.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-600">
                              {parseDateKey(transaction.date).toLocaleDateString('he-IL')}
                            </td>
                            <td className="px-4 py-2 text-slate-700 font-semibold truncate max-w-[200px]">
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
                            <td className="px-4 py-2 text-xs font-semibold">
                              <span
                                className={`px-2 py-1 rounded-full ${
                                  transaction.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {transaction.status === 'completed' ? 'שולם' : 'צפוי'}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-800">
                              {renderCurrency(transaction.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/60">
          <div className="text-slate-600 text-sm">
            סך הכל הכנסות בתקופה: <span className="font-bold text-slate-900">{renderCurrency(grandTotal)}</span>
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

