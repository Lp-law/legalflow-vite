import React, { useMemo } from 'react';
import type { Transaction } from '../types';
import { AlertCircle, CheckCircle, DollarSign, Calendar, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { parseDateKey } from '../utils/date';

interface CollectionTrackerProps {
  transactions: Transaction[];
  onMarkAsPaid: (transaction: Transaction) => void;
  recentTransactionIds?: string[];
  deletingTransactionId?: string | null;
}

const CollectionTracker: React.FC<CollectionTrackerProps> = ({
  transactions,
  onMarkAsPaid,
  recentTransactionIds,
  deletingTransactionId,
}) => {
  
  const isExpenseReimbursement = (transaction: Transaction) => {
    if (transaction.group !== 'other_income') return false;
    const normalized = `${transaction.category || ''} ${transaction.description || ''}`
      .replace(/\s+/g, '')
      .toLowerCase();
    return normalized.includes('החזר') || normalized.includes('reimburse');
  };

  const pendingItems = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.type === 'income' &&
          t.status === 'pending' &&
          (t.group === 'fee' || isExpenseReimbursement(t))
      )
      .sort(
        (a, b) =>
          parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime()
      );
  }, [transactions]);

  const calculateDaysOpen = (dateStr: string) => {
    const start = parseDateKey(dateStr);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const totalFeeDue = pendingItems.reduce(
    (sum, t) => (t.group === 'fee' ? sum + t.amount : sum),
    0
  );
  const totalReimbursementDue = pendingItems.reduce(
    (sum, t) => (isExpenseReimbursement(t) ? sum + t.amount : sum),
    0
  );
  const overdueCount = pendingItems.filter(
    t => calculateDaysOpen(t.date) > 30
  ).length;

  const handleExportCollection = () => {
    const headers = ['תאריך דרישה', 'לקוח', 'אסמכתא', 'שכר טרחה לתשלום', 'החזר הוצאות לתשלום', 'ימים פתוח', 'סטטוס'];
    const rows = pendingItems.map(t => [
      parseDateKey(t.date).toLocaleDateString('he-IL'),
      t.description,
      t.clientReference || '',
      t.group === 'fee' ? t.amount : 0,
      isExpenseReimbursement(t) ? t.amount : 0,
      calculateDaysOpen(t.date),
      t.status === 'completed' ? 'שולם' : 'ממתין'
    ]);

    exportToCSV('collection_tracker.csv', headers, rows);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 p-6 rounded-2xl shadow-lg border border-[var(--law-border)] flex items-center justify-between">
           <div>
             <p className="text-sm text-slate-300 font-medium">סה"כ שכר טרחה ממתין</p>
             <p className="text-2xl font-bold text-[var(--law-gold)]">₪{totalFeeDue.toLocaleString()}</p>
           </div>
           <div className="p-3 bg-white/10 rounded-full">
             <DollarSign className="w-6 h-6 text-[var(--law-gold)]" />
           </div>
        </div>
        <div className="bg-white/5 p-6 rounded-2xl shadow-lg border border-[var(--law-border)] flex items-center justify-between">
           <div>
             <p className="text-sm text-slate-300 font-medium">סה"כ החזרי הוצאות ממתינים</p>
             <p className="text-2xl font-bold text-[var(--law-gold)]">₪{totalReimbursementDue.toLocaleString()}</p>
           </div>
           <div className="p-3 bg-white/10 rounded-full">
             <DollarSign className="w-6 h-6 text-[var(--law-gold)]" />
           </div>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border flex items-center justify-between ${overdueCount > 0 ? 'bg-red-100/20 border-red-300/40' : 'bg-emerald-100/20 border-emerald-300/40'}`}>
           <div>
            <p className={`text-sm font-medium ${overdueCount > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
              חשבונות בפיגור (&gt;30 יום)
             </p>
             <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-300' : 'text-emerald-200'}`}>
               {overdueCount}
             </p>
           </div>
           <div className={`p-3 rounded-full ${overdueCount > 0 ? 'bg-red-200/50' : 'bg-emerald-200/50'}`}>
             <AlertCircle className={`w-6 h-6 ${overdueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
           </div>
        </div>
      </div>

      {/* Aging Table */}
      <div className="bg-[var(--law-panel)] rounded-2xl shadow-lg border border-[var(--law-border)] overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-white/5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[var(--law-gold)]" />
              תשלומים צפויים (Aging Report)
            </h3>
            <p className="text-sm text-slate-300 mt-1">
              רשימת דרישות תשלום/חשבונות עסקה פתוחים (שכר טרחה בלבד). שורות אדומות מסמנות פיגור של מעל 30 יום.
            </p>
          </div>
          <button
            onClick={handleExportCollection}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-[var(--law-gold)] bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            ייצוא אקסל
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-white/10 text-slate-200 font-bold sticky top-0 z-10 backdrop-blur">
              <tr>
                <th className="px-3 py-4 hidden md:table-cell w-12">#</th>
                <th className="px-6 py-4">תאריך דרישה</th>
                <th className="px-6 py-4">לקוח</th>
                <th className="px-6 py-4">אסמכתא/תיק</th>
                <th className="px-6 py-4">שכר טרחה לתשלום</th>
                <th className="px-6 py-4">החזר הוצאות לתשלום</th>
                <th className="px-6 py-4">ימים פתוח</th>
                <th className="px-6 py-4">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                        <span className="text-lg font-medium text-slate-600">אין חובות פתוחים</span>
                        <span>כל דרישות שכר הטרחה שולמו במלואן.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pendingItems.map((t, index) => {
                  const daysOpen = calculateDaysOpen(t.date);
                  const isOverdue = daysOpen > 30;
                  const isNinety = daysOpen >= 90;
                  const isNew = recentTransactionIds?.includes(t.id);
                  const isDeleting = deletingTransactionId === t.id;
                  
                  return (
                    <tr
                      key={t.id}
                      className={`transition-all ${
                        isOverdue
                          ? isNinety
                            ? 'bg-red-200/40 text-red-100'
                            : 'bg-red-100/30 text-red-200'
                          : index % 2 === 0
                          ? 'bg-white/5'
                          : 'bg-white/10'
                      } hover:bg-[#eef5ff]/10 ${isNew ? 'highlight-flash' : ''} ${
                        isDeleting ? 'fade-out-soft' : ''
                      }`}
                    >
                      <td className="px-3 py-4 text-xs text-slate-500 hidden md:table-cell">{index + 1}</td>
                      <td className="px-6 py-4 font-medium text-white">
                        {parseDateKey(t.date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-6 py-4 text-white font-bold text-base">{t.description}</td>
                      <td className="px-6 py-4 text-slate-300">
                          {t.clientReference ? (
                             <span className="bg-white/10 border border-white/10 px-2 py-1 rounded text-xs">#{t.clientReference}</span>
                          ) : '-'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-[var(--law-gold)]">
                        {t.group === 'fee' ? `₪${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-[var(--law-gold)]">
                        {isExpenseReimbursement(t) ? `₪${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              isOverdue ? 'bg-red-300/80 text-red-900' : 'bg-white/20 text-white'
                            }`}>
                              {daysOpen} ימים
                            </span>
                            {isOverdue && <AlertCircle className="w-4 h-4 text-red-600" />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => onMarkAsPaid(t)}
                          className="text-xs bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
                        >
                          סמן כשולם
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {pendingItems.length > 0 && (
              <tfoot className="bg-white/5 text-white font-semibold">
                <tr>
                  <td className="px-6 py-4 hidden md:table-cell" />
                  <td colSpan={3} className="px-6 py-4 text-right">סה"כ לתשלום</td>
                  <td className="px-6 py-4">₪{totalFeeDue.toLocaleString()}</td>
                  <td className="px-6 py-4">₪{totalReimbursementDue.toLocaleString()}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default CollectionTracker;