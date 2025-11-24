import React, { useMemo } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip as RechartsTooltip,
} from 'recharts';
import type {
  Transaction,
  LloydsCollectionItem,
  GenericCollectionItem,
  AccessCollectionItem,
} from '../types';
import { parseDateKey } from '../utils/date';

export type InsightSource = 'lloyds' | 'generic' | 'access';

export interface ClientInsightTarget {
  name: string;
  source: InsightSource;
}

interface ClientInsightPanelProps {
  isOpen: boolean;
  target: ClientInsightTarget | null;
  onClose: () => void;
  transactions: Transaction[];
  lloydsItems: LloydsCollectionItem[];
  genericItems: GenericCollectionItem[];
  accessItems: AccessCollectionItem[];
}

interface InsightEntry {
  id: string;
  source: InsightSource;
  name: string;
  amount: number;
  category: string;
  demandDate: string | null;
  createdAt: string;
  updatedAt: string;
  isPaid: boolean;
}

const SOURCE_LABELS: Record<InsightSource, string> = {
  lloyds: 'מעקב גבייה – לוידס',
  generic: 'מעקב גבייה – לקוחות שונים',
  access: 'מעקב גבייה – אקסס',
};

const ClientInsightPanel: React.FC<ClientInsightPanelProps> = ({
  isOpen,
  target,
  onClose,
  transactions,
  lloydsItems,
  genericItems,
  accessItems,
}) => {
  const collectionEntries = useMemo<InsightEntry[]>(() => {
    if (!target) return [];
    const nameMatcher = (value: string) =>
      value.trim().toLowerCase() === target.name.trim().toLowerCase();

    const normalizeLloyds = lloydsItems
      .filter(item => nameMatcher(item.claimantName) || nameMatcher(item.insuredName))
      .map(item => ({
        id: item.id,
        source: 'lloyds' as InsightSource,
        name: item.claimantName || item.insuredName || target.name,
        amount: item.amount,
        category: item.category,
        demandDate: item.demandDate,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isPaid: item.isPaid,
      }));

    const normalizeGeneric = genericItems
      .filter(item => nameMatcher(item.clientName) || nameMatcher(item.caseName))
      .map(item => ({
        id: item.id,
        source: 'generic' as InsightSource,
        name: item.clientName || item.caseName || target.name,
        amount: item.amount,
        category: item.category,
        demandDate: item.demandDate,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isPaid: item.isPaid,
      }));

    const normalizeAccess = accessItems
      .filter(item => nameMatcher(item.insuredName) || nameMatcher(item.caseName))
      .map(item => ({
        id: item.id,
        source: 'access' as InsightSource,
        name: item.insuredName || item.caseName || target.name,
        amount: item.amount,
        category: item.category,
        demandDate: item.demandDate,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isPaid: item.isPaid,
      }));

    return [...normalizeLloyds, ...normalizeGeneric, ...normalizeAccess];
  }, [target, lloydsItems, genericItems, accessItems]);

  const legalFeesThisYear = useMemo(() => {
    if (!collectionEntries.length) return 0;
    const currentYear = new Date().getFullYear();
    return collectionEntries
      .filter(
        entry =>
          entry.category === 'legal_fee' &&
          entry.demandDate &&
          parseDateKey(entry.demandDate).getFullYear() === currentYear
      )
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [collectionEntries]);

  const openDebt = useMemo(
    () =>
      collectionEntries
        .filter(entry => !entry.isPaid)
        .reduce((sum, entry) => sum + entry.amount, 0),
    [collectionEntries]
  );

  const averageCollectionTime = useMemo(() => {
    const paidEntries = collectionEntries.filter(
      entry => entry.isPaid && entry.demandDate && entry.updatedAt
    );
    if (!paidEntries.length) return null;
    const totalDays = paidEntries.reduce((sum, entry) => {
      const demand = parseDateKey(entry.demandDate!);
      const paidDate = parseDateKey(entry.updatedAt);
      const diffMs = paidDate.getTime() - demand.getTime();
      return sum + Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round(totalDays / paidEntries.length);
  }, [collectionEntries]);

  const history = useMemo(() => {
    return [...collectionEntries].sort((a, b) => {
      const dateA = a.demandDate ? parseDateKey(a.demandDate) : parseDateKey(a.createdAt);
      const dateB = b.demandDate ? parseDateKey(b.demandDate) : parseDateKey(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [collectionEntries]);

  const sparklineData = useMemo(() => {
    const sorted = [...collectionEntries].sort((a, b) => {
      const dateA = a.demandDate ? parseDateKey(a.demandDate) : parseDateKey(a.createdAt);
      const dateB = b.demandDate ? parseDateKey(b.demandDate) : parseDateKey(b.createdAt);
      return dateA.getTime() - dateB.getTime();
    });
    return sorted.map(entry => ({
      date: entry.demandDate
        ? parseDateKey(entry.demandDate).toLocaleDateString('he-IL')
        : parseDateKey(entry.createdAt).toLocaleDateString('he-IL'),
      amount: entry.amount,
    }));
  }, [collectionEntries]);

  const relatedTransactions = useMemo(() => {
    if (!target) return [];
    const nameMatcher = (value: string) =>
      value.trim().toLowerCase().includes(target.name.trim().toLowerCase());
    return transactions
      .filter(transaction => nameMatcher(transaction.description || ''))
      .sort(
        (a, b) => parseDateKey(b.date).getTime() - parseDateKey(a.date).getTime()
      )
      .slice(0, 10);
  }, [transactions, target]);

  if (!isOpen || !target) {
    return null;
  }

  const hasData = collectionEntries.length > 0;
  const sourceLabel = SOURCE_LABELS[target.source];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md md:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col" dir="rtl">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">{sourceLabel}</p>
            <h2 className="text-xl font-bold text-slate-800">{target.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {!hasData ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-lg font-semibold">אין נתונים להצגה</p>
              <p className="text-sm">לא נמצאו רשומות גבייה המשויכות ללקוח זה.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">סה"כ שכר טרחה השנה</p>
                  <p className="text-2xl font-bold text-slate-900">
                    ₪{legalFeesThisYear.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">חובות פתוחים</p>
                  <p className="text-2xl font-bold text-amber-600">
                    ₪{openDebt.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">זמן גבייה ממוצע</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {averageCollectionTime !== null ? `${averageCollectionTime} ימים` : '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-2">מגמת תזרים</p>
                  {sparklineData.length > 1 ? (
                    <div className="h-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                          <Line
                            type="monotone"
                            dataKey="amount"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                          />
                          <RechartsTooltip
                            formatter={value => `₪${Number(value).toLocaleString()}`}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">אין מספיק נתונים להצגת תרשים.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  היסטוריית דרישות גבייה
                </h3>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {history.map(entry => {
                    const demandDate = entry.demandDate
                      ? parseDateKey(entry.demandDate).toLocaleDateString('he-IL')
                      : 'ללא תאריך';
                    const statusClass = entry.isPaid
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700';
                    const overdueChip =
                      !entry.isPaid && entry.demandDate
                        ? (() => {
                            const diff =
                              (new Date().getTime() - parseDateKey(entry.demandDate).getTime()) /
                              (1000 * 60 * 60 * 24);
                            if (diff >= 90) {
                              return (
                                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                                  <AlertTriangle className="w-3 h-3" />
                                  {Math.floor(diff)} ימים
                                </span>
                              );
                            }
                            if (diff >= 45) {
                              return (
                                <span className="inline-flex items-center text-xs text-amber-600">
                                  {Math.floor(diff)} ימים
                                </span>
                              );
                            }
                            return null;
                          })()
                        : null;

                    return (
                      <div key={entry.id} className="p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {SOURCE_LABELS[entry.source]}
                            </p>
                            <p className="text-xs text-slate-500">{demandDate}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                            {entry.isPaid ? 'שולם' : 'פתוח'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-600">
                          <span>סכום</span>
                          <span className="font-semibold text-slate-900">
                            ₪{entry.amount.toLocaleString()}
                          </span>
                        </div>
                        {overdueChip}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  תנועות כספיות קשורות
                </h3>
                {relatedTransactions.length === 0 ? (
                  <p className="text-sm text-slate-400">לא נמצאו תנועות תואמות בתזרים.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {relatedTransactions.map(transaction => (
                      <div key={transaction.id} className="p-4 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-800">
                            {parseDateKey(transaction.date).toLocaleDateString('he-IL')}
                          </span>
                          <span
                            className={`font-semibold ${
                              transaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {transaction.type === 'income' ? '+' : '-'}₪
                            {transaction.amount.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{transaction.description || 'ללא תיאור'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientInsightPanel;

