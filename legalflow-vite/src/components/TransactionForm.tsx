import React, { useState, useEffect } from 'react';
import { X, Repeat } from 'lucide-react';
import { PAYMENT_METHODS } from '../constants';
import { getAllCategories, saveCustomCategory, getClients, saveClient } from '../services/storageService';
import type { Transaction, TransactionGroup } from '../types';
import { formatDateKey } from '../utils/date';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactions: Omit<Transaction, 'id'>[]) => void;
  initialDate?: string;
  initialType?: 'income' | 'expense';
  initialGroup?: TransactionGroup;
}

const sanitizeNumericInput = (value: string) => {
  if (!value) return NaN;
  const trimmed = value
    .replace(/₪/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
  if (!trimmed) return NaN;
  return Number(trimmed);
};

const TransactionForm: React.FC<TransactionFormProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  initialDate,
  initialType,
  initialGroup
}) => {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [group, setGroup] = useState<TransactionGroup>('fee');
  
  const [amount, setAmount] = useState('');
  const [isAmountManual, setIsAmountManual] = useState(false);
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [clientReference, setClientReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [status, setStatus] = useState<'pending' | 'completed'>('completed');
  
  const [availableCategories, setAvailableCategories] = useState(getAllCategories());
  const [availableClients, setAvailableClients] = useState<string[]>([]);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [isAddingClient, setIsAddingClient] = useState(false); 
  const [newClientName, setNewClientName] = useState('');

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);
  const [loanEndMonth, setLoanEndMonth] = useState('');

  // Flag to track manual override for tax calc. 
  // Generally user added transactions are "Manual" by definition relative to the auto-tax generator,
  // but this flag on the transaction object is mainly used for the Tax transactions themselves.
  // Here we just create standard transactions.

  useEffect(() => {
    if (isOpen) {
      setAvailableCategories(getAllCategories());
      setAvailableClients(getClients());

      if (initialDate) setDate(initialDate);
      
      if (initialGroup) {
          setGroup(initialGroup);
          setType((initialGroup === 'fee' || initialGroup === 'other_income') ? 'income' : 'expense');
      } else if (initialType) {
          setType(initialType);
          setGroup(initialType === 'income' ? 'fee' : 'operational');
      } else {
          setType('income');
          setGroup('fee');
      }
      
      setAmount('');
      setIsAmountManual(false);
      setDescription('');
      setCategory('');
      setClientReference('');
      setPaymentMethod('transfer');
      
      // Defaults
      if (initialType === 'income' || (!initialType && !initialGroup)) {
          setStatus('pending');
      } else {
          setStatus('completed');
      }

      setIsRecurring(false);
      setRecurringMonths(12);
      setLoanEndMonth('');
      
      setIsAddingCategory(false);
      setNewCategoryName('');
      setIsAddingClient(false);
      setNewClientName('');
    }
  }, [isOpen, initialDate, initialType, initialGroup]);

  const handleTypeChange = (newType: 'income' | 'expense') => {
      setType(newType);
      setCategory('');
      if (newType === 'income') {
          setGroup('fee'); // Default income
          setStatus('pending');
      } else {
          setGroup('operational'); // Default expense
          setStatus('completed');
      }
  };

  // Auto-set category name if Group is Fee (Implicit category)
  useEffect(() => {
      if (group === 'fee') {
          setCategory('שכר טרחה');
      }
  }, [group]);

  const applyCategoryDefaults = (categoryName: string, force = false) => {
    const selectedCat = availableCategories.find(c => c.name === categoryName);
    if (!selectedCat) return;
    const isLoanCategory = selectedCat.group === 'loan';

    if (!isLoanCategory && selectedCat.defaultAmount !== undefined && (force || !isAmountManual || amount === '')) {
      setAmount(selectedCat.defaultAmount.toString());
      setIsAmountManual(false);
    }
    if (selectedCat.defaultDay !== undefined) {
      const currentDateObj = new Date(date);
      const year = currentDateObj.getFullYear();
      const month = currentDateObj.getMonth();
      const newDateObj = new Date(year, month, selectedCat.defaultDay, 12);
      setDate(formatDateKey(newDateObj));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalCategory = category;
    let finalDescription = description;

    if (category === 'ADD_NEW') {
        if (newCategoryName.trim()) {
            saveCustomCategory(newCategoryName, type, group); // Pass group to custom save
            finalCategory = newCategoryName;
        } else {
            alert('נא להזין שם לקטגוריה החדשה');
            return;
        }
    }

    // For Fee, we enforce category name
    if (group === 'fee') {
        finalCategory = 'שכר טרחה';
    }

    if (type === 'income' && description === 'ADD_NEW_CLIENT') {
        if (newClientName.trim()) {
            saveClient(newClientName);
            finalDescription = newClientName;
        } else {
            alert('נא להזין שם לקוח');
            return;
        }
    }

    // For manual tax/vat entries, we want to mark them as manual overrides so the auto-calc doesn't revert them
    // If user manually adds an expense in 'tax' group, we flag it.
    const isManualOverride = group === 'tax';

    const parsedAmount = sanitizeNumericInput(amount);
    if (!Number.isFinite(parsedAmount)) {
      alert('נא להזין סכום חוקי (מספרים, נקודה או פסיק).');
      return;
    }

    const absoluteAmount = Math.abs(parsedAmount);
    const effectiveAmount = group === 'bank_adjustment' ? parsedAmount : absoluteAmount;

    const transactionsToCreate: Omit<Transaction, 'id'>[] = [];

  const baseTransaction = {
      amount: effectiveAmount,
      type,
      group,
      category: finalCategory,
      description: finalDescription,
      clientReference,
      paymentMethod: paymentMethod as any,
      status,
      isRecurring: isRecurring,
      isManualOverride,
      loanEndMonth: group === 'loan' ? (loanEndMonth || undefined) : undefined
    };

    if (isRecurring) {
        const startDate = new Date(date);
        for (let i = 0; i < recurringMonths; i++) {
            const nextDate = new Date(startDate);
            nextDate.setMonth(startDate.getMonth() + i);
            
            transactionsToCreate.push({
                ...baseTransaction,
                date: formatDateKey(nextDate),
                status: i === 0 ? status : 'pending' 
            });
        }
    } else {
        transactionsToCreate.push({
            ...baseTransaction,
            date
        });
    }

    onSubmit(transactionsToCreate);
    onClose();
  };

  const filteredCategories = availableCategories.filter(c => c.group === group);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-200">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">
            {initialGroup 
              ? 'הוספת תנועה'
              : 'הוספת תנועה חדשה'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4">
            
            {!initialGroup && (
              <div className="grid grid-cols-2 gap-4 p-1 bg-slate-100 rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => handleTypeChange('income')}
                  className={`py-2 text-sm font-medium rounded-md transition-all ${
                    type === 'income' 
                      ? 'bg-white text-emerald-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  הכנסה
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('expense')}
                  className={`py-2 text-sm font-medium rounded-md transition-all ${
                    type === 'expense' 
                      ? 'bg-white text-red-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  הוצאה
                </button>
              </div>
            )}

            {/* SUB GROUP SELECTION */}
            {!initialGroup && (
                <div className="flex p-1 bg-slate-50 rounded-lg mb-4 border border-slate-100 overflow-x-auto">
                    {type === 'income' ? (
                        <>
                         <button
                            type="button"
                            onClick={() => { setGroup('fee'); setCategory('שכר טרחה'); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                                group === 'fee' 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-emerald-800 hover:bg-emerald-50'
                            }`}
                        >
                            שכר טרחה
                        </button>
                        <button
                            type="button"
                            onClick={() => { setGroup('other_income'); setCategory(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                                group === 'other_income' 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-emerald-800 hover:bg-emerald-50'
                            }`}
                        >
                            הכנסות אחרות
                        </button>
                        </>
                    ) : (
                        <>
                        {[
                            { id: 'operational', label: 'תפעול שוטף' },
                            { id: 'tax', label: 'מיסים' },
                            { id: 'loan', label: 'הלוואות' },
                            { id: 'personal', label: 'אישי' },
                            { id: 'bank_adjustment', label: 'התאמת בנק' }
                        ].map(g => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => { setGroup(g.id as TransactionGroup); setCategory(''); }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                                    group === g.id 
                                        ? 'bg-slate-800 text-white shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                                }`}
                            >
                                {g.label}
                            </button>
                        ))}
                        </>
                    )}
                </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                סכום (₪)
                {group === 'bank_adjustment' && (
                  <span className="block text-[11px] text-slate-500 font-normal">
                    ניתן להזין ערך שלילי (משיכה) או חיובי (הפקדה).
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="decimal"
                pattern="^-?[0-9₪.,\\s-]*$"
                required
                value={amount}
                onChange={(e) => {
                  setIsAmountManual(true);
                  setAmount(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                autoFocus
              />
            </div>

            {/* Category Selection */}
            {/* Hide category selection for Fee, show simple text */}
            {group === 'fee' ? (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                    <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed">
                        שכר טרחה
                    </div>
                </div>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                    {isAddingCategory ? (
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                placeholder="הקלד שם קטגוריה חדשה..."
                                className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                                autoFocus
                            />
                            <button 
                                type="button" 
                                onClick={() => { setIsAddingCategory(false); setCategory(''); }}
                                className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                            >
                                ביטול
                            </button>
                        </div>
                    ) : (
                        <select
                            required
                            value={category}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                if (nextValue === 'ADD_NEW') {
                                    setIsAddingCategory(true);
                                    setCategory('ADD_NEW');
                                } else {
                                    setCategory(nextValue);
                                    applyCategoryDefaults(nextValue);
                                }
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                            <option value="" disabled>בחר קטגוריה</option>
                            {filteredCategories.map(cat => (
                            <option key={cat.id} value={cat.name}>
                                {cat.name}
                            </option>
                            ))}
                            <option value="ADD_NEW" className="font-bold text-blue-600 bg-slate-50">➕ הוסף קטגוריה חדשה...</option>
                        </select>
                    )}
                </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {type === 'income' ? 'שם הלקוח' : 'תיאור'}
              </label>
              
              {type === 'income' ? (
                isAddingClient ? (
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            placeholder="הקלד שם לקוח חדש..."
                            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                            autoFocus
                        />
                        <button 
                            type="button" 
                            onClick={() => { setIsAddingClient(false); setDescription(''); }}
                            className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                            ביטול
                        </button>
                    </div>
                ) : (
                    <select
                        required
                        value={description}
                        onChange={(e) => {
                            if (e.target.value === 'ADD_NEW_CLIENT') {
                                setIsAddingClient(true);
                                setDescription('ADD_NEW_CLIENT');
                            } else {
                                setDescription(e.target.value);
                            }
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="" disabled>בחר לקוח</option>
                        {availableClients.map((client, idx) => (
                            <option key={idx} value={client}>{client}</option>
                        ))}
                        <option value="ADD_NEW_CLIENT" className="font-bold text-blue-600 bg-slate-50">➕ הוסף לקוח חדש...</option>
                    </select>
                )
              ) : (
                <input
                    type="text"
                    required
                    placeholder="תיאור ההוצאה"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

    {group === 'loan' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מועד סיום ההלוואה</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={(loanEndMonth || `${date.slice(0, 4)}-${date.slice(5, 7)}`).split('-')[1]}
              onChange={(e) => {
                const [currentYear] = (loanEndMonth || `${date.slice(0, 4)}-${date.slice(5, 7)}`).split('-');
                const month = e.target.value.padStart(2, '0');
                setLoanEndMonth(`${currentYear}-${month}`);
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const value = (i + 1).toString().padStart(2, '0');
                const label = new Date(2000, i, 1).toLocaleString('he-IL', { month: 'long' });
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
            <select
              value={(loanEndMonth || `${date.slice(0, 4)}-${date.slice(5, 7)}`).split('-')[0]}
              onChange={(e) => {
                const year = e.target.value;
                const [, currentMonth] = (loanEndMonth || `${date.slice(0, 4)}-${date.slice(5, 7)}`).split('-');
                setLoanEndMonth(`${year}-${currentMonth}`);
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {Array.from({ length: 26 }, (_, idx) => {
                const baseYear = new Date().getFullYear();
                const year = baseYear - 10 + idx;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            בחר חודש ושנה לסיום התשלומים. ניתן לתאם גם שנים עתידיות.
          </p>
        </div>
      </div>
    )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מספר תיק/אסמכתא</label>
                <input
                  type="text"
                  value={clientReference}
                  onChange={(e) => setClientReference(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">אמצעי תשלום</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 pt-2">
                <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${status === 'completed' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`} onClick={() => setStatus(prev => prev === 'completed' ? 'pending' : 'completed')}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${status === 'completed' ? 'border-emerald-600 bg-emerald-600' : 'border-amber-500 bg-white'}`}>
                        {status === 'completed' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1">
                        <span className={`block text-sm font-bold ${status === 'completed' ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {type === 'income' 
                                ? (status === 'completed' ? 'התשלום התקבל בחשבון' : 'דרישה נשלחה (ממתין לתשלום)')
                                : (status === 'completed' ? 'שולם' : 'תשלום עתידי')}
                        </span>
                        <span className="text-xs text-slate-500">
                            {type === 'income' && status === 'pending' && 'יופיע בדוח "מעקב גבייה" עד לתשלום'}
                        </span>
                    </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 transition-all">
                    <div className="flex items-center gap-3 mb-2">
                         <input 
                            type="checkbox" 
                            id="recurring" 
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <label htmlFor="recurring" className="text-sm font-bold text-blue-800 select-none cursor-pointer flex items-center gap-2">
                            <Repeat className="w-4 h-4" />
                            הגדר כהוראת קבע / תנועה חוזרת
                        </label>
                    </div>
                    
                    {isRecurring && (
                         <div className="flex items-center gap-2 mr-7 animation-fade-in">
                             <span className="text-sm text-blue-700">חזור למשך</span>
                             <input 
                                type="number" 
                                min="2" 
                                max="60" 
                                value={recurringMonths}
                                onChange={(e) => setRecurringMonths(parseInt(e.target.value))}
                                className="w-16 px-2 py-1 text-sm border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                             />
                             <span className="text-sm text-blue-700">חודשים</span>
                         </div>
                    )}
                </div>
            </div>

          </form>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            ביטול
          </button>
          <button 
            form="transaction-form"
            type="submit"
            className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            {isRecurring ? `צור ${recurringMonths} תנועות` : 'שמור תנועה'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionForm;