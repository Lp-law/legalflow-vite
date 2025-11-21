import React, { useState, useEffect } from 'react';
import { X, Repeat } from 'lucide-react';
import { PAYMENT_METHODS } from '../constants';
import { getAllCategories, saveCustomCategory, getClients, saveClient } from '../services/storageService';
import { Transaction, TransactionGroup } from '../types';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (transactions: Omit<Transaction, 'id'>[]) => void;
  initialDate?: string;
  initialType?: 'income' | 'expense';
  initialGroup?: TransactionGroup;
}

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
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

  // 🔧 Auto-fill behavior for category selection:
  // - DO NOT override amount for loans.
  // - For non-loan categories, only auto-fill amount if:
  //   * selectedCat.defaultAmount exists
  //   * AND current amount is still empty (so we don't overwrite user input).
  useEffect(() => {
    if (!category || category === 'ADD_NEW') return;

    const selectedCat = availableCategories.find(c => c.name === category);
    if (!selectedCat) return;

    // only for NON-loan groups, and only if amount is currently empty
    if (
      selectedCat.group !== 'loan' &&
      (selectedCat as any).defaultAmount !== undefined &&
      amount === ''
    ) {
      const da = (selectedCat as any).defaultAmount;
      setAmount(da != null ? String(da) : '');
    }

    if ((selectedCat as any).defaultDay !== undefined) {
      const currentDateObj = new Date(date);
      const year = currentDateObj.getFullYear();
      const month = currentDateObj.getMonth();
      const newDateObj = new Date(year, month, (selectedCat as any).defaultDay, 12);
      setDate(newDateObj.toISOString().split('T')[0]);
    }
  }, [category, availableCategories, date, amount]);

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
    const isManualOverride = group === 'tax';

    const transactionsToCreate: Omit<Transaction, 'id'>[] = [];

    const baseTransaction = {
      amount: parseFloat(amount),
      type,
      group,
      category: finalCategory,
      description: finalDescription,
      clientReference,
      paymentMethod: paymentMethod as any,
      status,
      isRecurring: isRecurring,
      isManualOverride
    };

    if (isRecurring) {
      const startDate = new Date(date);
      for (let i = 0; i < recurringMonths; i++) {
        const nextDate = new Date(startDate);
        nextDate.setMonth(startDate.getMonth() + i);
        
        transactionsToCreate.push({
          ...baseTransaction,
          date: nextDate.toISOString().split('T')[0],
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
                      { id: 'personal', label: 'אישי' }
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סכום (₪)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {type === 'income' ? 'תאריך הנפקה/דרישה' : 'תאריך תשלום'}
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
                      if (e.target.value === 'ADD_NEW') {
                        setIsAddingCategory(true);
                        setCategory('ADD_NEW');
                      } else {
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 borde
