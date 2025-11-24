import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { AlertCircle, CheckCircle, DollarSign, Calendar, Download } from 'lucide-react';
import { exportToCSV } from '../services/exportService';

interface CollectionTrackerProps {
  transactions: Transaction[];
  onMarkAsPaid: (transaction: Transaction) => void;
}

const CollectionTracker: React.FC<CollectionTrackerProps> = ({ transactions, onMarkAsPaid }) => {
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
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions]);

  const calculateDaysOpen = (dateStr: string) => {
    const start = new Date(dateStr);
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
  const overdueCount = pendingItems.filter(t => calculateDaysOpen(t.date) > 30).length;

  const handleExportCollection = () => {
    const headers = ['תאריך דרישה', 'לקוח', 'אסמכתא', 'שכר טרחה לתשלום', 'החזר הוצאות לתשלום', 'ימים פתוח', 'סטטוס'];
    const rows = pendingItems.map(t => [
      new Date(t.date).toLocaleDateString('he-IL'),
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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
           <div>
             <p className="text-sm text-slate-500 font-medium">סה"כ שכר טרחה ממתין</p>
             <p className="text-2xl font-bold text-slate-800">₪{totalFeeDue.toLocaleString()}</p>
           </div>
           <div className="p-3 bg-blue-50 rounded-full">
             <DollarSign className="w-6 h-6 text-blue-600" />
           </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
           <div>
             <p className="text-sm text-slate-500 font-medium">סה"כ החזרי הוצאות ממתינים</p>
             <p className="text-2xl font-bold text-slate-800">₪{totalReimbursementDue.toLocaleString()}</p>
           </div>
           <div className="p-3 bg-teal-50 rounded-full">
             <DollarSign className="w-6 h-6 text-teal-600" />
           </div>
        </div>

        <div className={`p-6 rounded-xl shadow-sm border flex items-center justify-between ${overdueCount > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
           <div>
             <p className={`text-sm font-medium ${overdueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
               חשבונות בפיגור (>30 יום)
             </p>
             <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
               {overdueCount}
             </p>
           </div>
           <div className={`p-3 rounded-full ${overdueCount > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
             <AlertCircle className={`w-6 h-6 ${overdueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
           </div>
        </div>
      </div>

      {/* Aging Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              תשלומים צפויים (Aging Report)
          </h3>
          <p className="text-sm text-slate-500 mt-1">
              רשימת דרישות תשלום פתוחות לשכר טרחה ולהחזרי הוצאות. שורות אדומות מסמנות פיגור של מעל 30 יום.
          </p>
          </div>
          <button
            onClick={handleExportCollection}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition-colors text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            ייצוא אקסל
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-100 text-slate-600 font-bold">
              <tr>
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
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                        <span className="text-lg font-medium text-slate-600">אין חובות פתוחים</span>
                        <span>כל דרישות שכר הטרחה שולמו במלואן.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pendingItems.map((t) => {
                  const daysOpen = calculateDaysOpen(t.date);
                  const isOverdue = daysOpen > 30;
                  
                  return (
                    <tr key={t.id} className={`transition-all ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {new Date(t.date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-6 py-4 text-slate-900 font-bold text-base">{t.description}</td>
                      <td className="px-6 py-4 text-slate-500">
                          {t.clientReference ? (
                             <span className="bg-white border border-slate-200 px-2 py-1 rounded text-xs">#{t.clientReference}</span>
                          ) : '-'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {t.group === 'fee' ? `₪${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {isExpenseReimbursement(t) ? `₪${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${isOverdue ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-700'}`}>
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
              <tfoot className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
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