import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Transaction } from '../types';
import { formatDateKey, parseDateKey } from '../utils/date';
import { normalizeRow, type CashflowRow } from '../utils/cashflow';

interface ChartBuilderProps {
  transactions: Transaction[];
  isOpen: boolean;
  onClose: () => void;
}

const buildCashflowSeries = (transactions: Transaction[], fromDate?: string, toDate?: string, typeFilter?: string, clientFilter?: string) => {
  const filtered = transactions.filter(tx => {
    if (typeFilter && tx.type !== typeFilter) return false;
    if (clientFilter && tx.clientReference?.toLowerCase() !== clientFilter.toLowerCase()) return false;
    if (fromDate && parseDateKey(tx.date) < parseDateKey(fromDate)) return false;
    if (toDate && parseDateKey(tx.date) > parseDateKey(toDate)) return false;
    return true;
  });

  const dateMap = new Map<string, CashflowRow>();
  filtered.forEach(tx => {
    const key = formatDateKey(parseDateKey(tx.date));
    if (!dateMap.has(key)) {
      dateMap.set(key, {
        date: key,
        salary: 0,
        otherIncome: 0,
        expenses: 0,
        loans: 0,
        withdrawals: 0,
        taxes: 0,
        bankAdjustments: 0,
      });
    }
    const row = dateMap.get(key)!;
    if (tx.type === 'income') {
      if (tx.group === 'fee') row.salary = (Number(row.salary) || 0) + tx.amount;
      else row.otherIncome = (Number(row.otherIncome) || 0) + tx.amount;
    } else {
      if (tx.group === 'operational') row.expenses = (Number(row.expenses) || 0) + tx.amount;
      if (tx.group === 'loan') row.loans = (Number(row.loans) || 0) + tx.amount;
      if (tx.group === 'personal') row.withdrawals = (Number(row.withdrawals) || 0) + tx.amount;
      if (tx.group === 'tax') row.taxes = (Number(row.taxes) || 0) + tx.amount;
    }
    if (tx.group === 'bank_adjustment') {
      row.bankAdjustments = (Number(row.bankAdjustments) || 0) + tx.amount;
    }
  });
  return Array.from(dateMap.values())
    .sort((a, b) => parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime())
    .map(row => ({
      date: row.date,
      value: normalizeRow(row).salary + normalizeRow(row).otherIncome + normalizeRow(row).bankAdjustments - (Math.abs(normalizeRow(row).expenses) + Math.abs(normalizeRow(row).loans) + Math.abs(normalizeRow(row).withdrawals) + Math.abs(normalizeRow(row).taxes)),
    }));
};

const ChartBuilder: React.FC<ChartBuilderProps> = ({ transactions, isOpen, onClose }) => {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'income' | 'expense' | ''>('');
  const [clientFilter, setClientFilter] = useState('');

  const chartData = useMemo(
    () => buildCashflowSeries(transactions, fromDate || undefined, toDate || undefined, transactionType || undefined, clientFilter || undefined),
    [transactions, fromDate, toDate, transactionType, clientFilter]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl rounded-3xl bg-[#050b18] border border-white/10 shadow-2xl text-white max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-xl font-bold">Custom Chart Builder</h3>
            <p className="text-xs text-slate-400">בחור טווח, סוג תנועה ולקוח כדי לצפות בגרף מותאם</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-xs text-slate-300">
              תאריך התחלה
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:ring-2 focus:ring-[#d4af37]" />
            </label>
            <label className="text-xs text-slate-300">
              תאריך סיום
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:ring-2 focus:ring-[#d4af37]" />
            </label>
            <label className="text-xs text-slate-300">
              סוג תנועה
              <select value={transactionType} onChange={e => setTransactionType(e.target.value as any)} className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:ring-2 focus:ring-[#d4af37]">
                <option value="">הכל</option>
                <option value="income">הכנסות</option>
                <option value="expense">הוצאות</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              שם לקוח
              <input type="text" value={clientFilter} onChange={e => setClientFilter(e.target.value)} placeholder="לדוגמה: טרם" className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:ring-2 focus:ring-[#d4af37]" />
            </label>
          </div>
          <div className="bg-[#081124] border border-white/5 rounded-2xl p-4 h-72">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">אין נתונים לטווח וסינון שנבחרו.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient id="chartLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4af37" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `${(value/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#050b18', border: '1px solid rgba(255,255,255,0.1)' }} formatter={(value: number) => `₪${value.toLocaleString('he-IL')}`} labelFormatter={(value) => new Date(value).toLocaleDateString('he-IL')} />
                  <Line type="monotone" dataKey="value" stroke="#d4af37" strokeWidth={2} dot={false} fill="url(#chartLine)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartBuilder;


