import React, { useState } from 'react';
import { X, Trash2, Plus, Pencil } from 'lucide-react';
import type { Transaction, TransactionGroup } from '../types';
import { lightInputCompactClasses } from './ui/inputStyles';

interface DailyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  group: TransactionGroup;
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onAdd: () => void;
  onEdit?: (transaction: Transaction) => void;
  onToggleStatus?: (id: string, nextStatus: 'pending' | 'completed') => void;
  onUpdateTaxAmount?: (id: string, amount: number) => void;
  onUpdateLoanAmount?: (id: string, amount: number) => void;
}

const DailyDetailModal: React.FC<DailyDetailModalProps> = ({
  isOpen,
  onClose,
  date,
  group,
  transactions,
  onDelete,
  onAdd,
  onEdit,
  onToggleStatus,
  onUpdateTaxAmount,
  onUpdateLoanAmount
}) => {
  if (!isOpen) return null;

  const [editingTaxTransactionId, setEditingTaxTransactionId] = useState<string | null>(null);
  const [taxDraft, setTaxDraft] = useState('');
  const [editingLoanTransactionId, setEditingLoanTransactionId] = useState<string | null>(null);
  const [loanDraft, setLoanDraft] = useState('');

  const formattedDate = new Date(date).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const getGroupTitle = (g: TransactionGroup) => {
    switch (g) {
      case 'fee': return 'שכר טרחה';
      case 'other_income': return 'הכנסות אחרות';
      case 'tax': return 'תשלומי מיסים';
      case 'loan': return 'הלוואות ומימון';
      case 'personal': return 'משיכות פרטיות';
      case 'bank_adjustment': return 'התאמות בנק';
      case 'operational': return 'הוצאות תפעול';
      default: return 'פרטים';
    }
  };

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const isIncome = group === 'fee' || group === 'other_income';

  const getLoanRemaining = (transaction: Transaction) => {
    if (!transaction.loanEndMonth) return null;
    const [endYear, endMonth] = transaction.loanEndMonth.split('-').map(Number);
    if (!endYear || !endMonth) return null;

    const today = new Date();
    const currentTotal = today.getFullYear() * 12 + today.getMonth();
    const endTotal = endYear * 12 + (endMonth - 1);
    const remainingPayments = Math.max(0, endTotal - currentTotal + 1);

    return {
      remainingPayments,
      remainingAmount: remainingPayments * transaction.amount
    };
  };

  const formatLoanEndMonth = (loanEndMonth: string) => {
    const [year, month] = loanEndMonth.split('-').map(Number);
    if (!year || !month) return loanEndMonth;
    const dateObj = new Date(year, month - 1, 1);
    return dateObj.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };

  const startTaxEdit = (transaction: Transaction) => {
    setEditingTaxTransactionId(transaction.id);
    setTaxDraft(transaction.amount.toString());
  };

  const cancelTaxEdit = () => {
    setEditingTaxTransactionId(null);
    setTaxDraft('');
  };

  const handleSaveTaxAmount = (transactionId: string) => {
    if (!onUpdateTaxAmount) return;
    const parsed = Number(taxDraft);
    if (!Number.isFinite(parsed)) {
      alert('נא להזין סכום תקין');
      return;
    }
    onUpdateTaxAmount(transactionId, Math.abs(parsed));
    cancelTaxEdit();
  };

  const startLoanEdit = (transaction: Transaction) => {
    setEditingLoanTransactionId(transaction.id);
    setLoanDraft(transaction.amount.toString());
  };

  const cancelLoanEdit = () => {
    setEditingLoanTransactionId(null);
    setLoanDraft('');
  };

  const handleSaveLoanAmount = (transactionId: string) => {
    if (!onUpdateLoanAmount) return;
    const parsed = Number(loanDraft);
    if (!Number.isFinite(parsed)) {
      alert('נא להזין סכום תקין');
      return;
    }
    onUpdateLoanAmount(transactionId, Math.abs(parsed));
    cancelLoanEdit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 modal-overlay">
      <div className="bg-[#0b1426] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-white/10 modal-content">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-white/5 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-white">{getGroupTitle(group)}</h3>
            <p className="text-sm text-slate-300">{formattedDate}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {transactions.length === 0 ? (
            <p className="text-center text-slate-400 py-4">אין תנועות להצגה</p>
          ) : (
            transactions.map((t) => (
              <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-sm hover:shadow-lg transition-shadow flex justify-between items-center group">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base">₪{t.amount.toLocaleString()}</span>
                    {t.clientReference && (
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                        #{t.clientReference}
                      </span>
                    )}
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {t.status === 'completed' ? 'שולם' : 'צפוי'}
                    </span>
                    {t.type === 'income' && onToggleStatus && (
                      <button
                        type="button"
                        onClick={() => onToggleStatus(t.id, t.status === 'completed' ? 'pending' : 'completed')}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline-offset-2"
                      >
                        {t.status === 'completed' ? 'סמן כצפוי' : 'סמן כשולם'}
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 font-medium">{t.description}</p>
                  <p className="text-xs text-slate-400">{t.category}</p>
                  {group === 'tax' && (t.category === 'מע"מ' || t.category === 'מס הכנסה אישי') && onUpdateTaxAmount && (
                    editingTaxTransactionId === t.id ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={taxDraft}
                            onChange={(e) => setTaxDraft(e.target.value)}
                            className={`w-28 ${lightInputCompactClasses}`}
                            min="0"
                            step="0.01"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTaxAmount(t.id)}
                            className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500"
                          >
                            שמור
                          </button>
                          <button
                            type="button"
                            onClick={cancelTaxEdit}
                            className="px-3 py-1 text-xs font-semibold rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            בטל
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          עדכון ידני מסמן שהתשלום לא יסונכרן אוטומטית שוב.
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startTaxEdit(t)}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-500 underline-offset-2"
                      >
                        עדכן סכום
                      </button>
                    )
                  )}
                  {group === 'loan' && (
                    <div className="mt-2 text-xs text-slate-500 space-y-1">
                      {t.loanEndMonth && (
                        <>
                          <p>חודש סיום: {formatLoanEndMonth(t.loanEndMonth)}</p>
                          {(() => {
                            const info = getLoanRemaining(t);
                            if (!info) return null;
                            return (
                              <p>
                                יתרה משוערת: ₪{info.remainingAmount.toLocaleString()} ({info.remainingPayments} תשלומים)
                              </p>
                            );
                          })()}
                        </>
                      )}
                      {onUpdateLoanAmount && (
                        editingLoanTransactionId === t.id ? (
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={`w-28 ${lightInputCompactClasses}`}
                                value={loanDraft}
                                onChange={(e) => setLoanDraft(e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveLoanAmount(t.id)}
                                className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={cancelLoanEdit}
                                className="px-3 py-1 text-xs font-semibold rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                              >
                                בטל
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startLoanEdit(t)}
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-500 underline-offset-2"
                          >
                            עדכן סכום הלוואה
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(t)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                      title="ערוך"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => onDelete(t.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="מחק"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/5">
            <div className="flex justify-between items-center mb-4 px-1">
                <span className="font-medium text-slate-300">סה"כ ליום זה:</span>
                <span className={`font-bold text-lg ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}>
                    ₪{totalAmount.toLocaleString()}
                </span>
            </div>
            <button 
                onClick={() => {
                    onAdd();
                }}
                className="w-full py-2.5 bg-white/10 border border-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" />
                הוסף תנועה נוספת
            </button>
        </div>
      </div>
    </div>
  );
};

export default DailyDetailModal;