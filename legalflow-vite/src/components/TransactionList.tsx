import React from 'react';
import type { Transaction } from '../types';
import { ArrowUpRight, ArrowDownLeft, Search, FileText, Hash } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions, onDelete }) => {
  // Simple date formatter
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          פירוט תנועות
        </h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="חיפוש בתיאור או תיק..." 
            className="pr-9 pl-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-6 py-3 border-b border-slate-100">תאריך</th>
              <th className="px-6 py-3 border-b border-slate-100">סוג</th>
              <th className="px-6 py-3 border-b border-slate-100">תיאור</th>
              <th className="px-6 py-3 border-b border-slate-100">קטגוריה</th>
              <th className="px-6 py-3 border-b border-slate-100">אסמכתא/תיק</th>
              <th className="px-6 py-3 border-b border-slate-100">סכום</th>
              <th className="px-6 py-3 border-b border-slate-100"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                  לא נמצאו תנועות
                </td>
              </tr>
            ) : (
              transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-slate-600">{formatDate(t.date)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      t.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {t.type === 'income' ? <ArrowDownLeft className="w-3 h-3 ml-1" /> : <ArrowUpRight className="w-3 h-3 ml-1" />}
                      {t.type === 'income' ? 'הכנסה' : 'הוצאה'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-800 font-medium">{t.description}</td>
                  <td className="px-6 py-4 text-slate-500">{t.category}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {t.clientReference && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-xs">
                        <Hash className="w-3 h-3" />
                        {t.clientReference}
                      </span>
                    )}
                  </td>
                  <td className={`px-6 py-4 font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}₪{t.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-left">
                     <button 
                        onClick={() => onDelete(t.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                     >
                       מחק
                     </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionList;