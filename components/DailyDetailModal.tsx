import React from 'react';
import { X, Trash2, Edit2, Plus } from 'lucide-react';
import { Transaction, TransactionGroup } from '../types';

interface DailyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  group: TransactionGroup;
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void; // Placeholder for future edit implementation
  onAdd: () => void;
}

const DailyDetailModal: React.FC<DailyDetailModalProps> = ({
  isOpen,
  onClose,
  date,
  group,
  transactions,
  onDelete,
  onEdit,
  onAdd
}) => {
  if (!isOpen) return null;

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
      case 'operational': return 'הוצאות תפעול';
      default: return 'פרטים';
    }
  };

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const isIncome = group === 'fee' || group === 'other_income';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-slate-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{getGroupTitle(group)}</h3>
            <p className="text-sm text-slate-500">{formattedDate}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {transactions.length === 0 ? (
            <p className="text-center text-slate-400 py-4">אין תנועות להצגה</p>
          ) : (
            transactions.map((t) => (
              <div key={t.id} className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow flex justify-between items-center group">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-base">₪{t.amount.toLocaleString()}</span>
                    {t.clientReference && (
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                        #{t.clientReference}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 font-medium">{t.description}</p>
                  <p className="text-xs text-slate-400">{t.category}</p>
                </div>
                
                <div className="flex gap-2 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="p-4 border-t border-slate-100 bg-slate-50">
            <div className="flex justify-between items-center mb-4 px-1">
                <span className="font-medium text-slate-600">סה"כ ליום זה:</span>
                <span className={`font-bold text-lg ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                    ₪{totalAmount.toLocaleString()}
                </span>
            </div>
            <button 
                onClick={() => {
                    onAdd();
                }}
                className="w-full py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
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