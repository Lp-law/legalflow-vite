import React, { useEffect, useMemo, useState } from 'react';
import type { AccessCollectionItem, CollectionCategory } from '../types';
import { calculateOverdueDays, formatOverdueLabel } from '../utils/collectionStatus';

const CATEGORY_LABELS: Record<CollectionCategory, string> = {
  expenses: 'הוצאות',
  legal_fee: 'שכר טרחה',
};

interface FormState {
  accountNumber: string;
  insuredName: string;
  caseName: string;
  demandDate: string;
  amount: string;
  totalDeductible: string;
  outstandingBalance: string;
  category: CollectionCategory;
}

const initialFormState: FormState = {
  accountNumber: '',
  insuredName: '',
  caseName: '',
  demandDate: '',
  amount: '',
  totalDeductible: '',
  outstandingBalance: '',
  category: 'legal_fee',
};

interface AccessCollectionTrackerProps {
  items: AccessCollectionItem[];
  onChange: (items: AccessCollectionItem[]) => void;
  highlightedId?: string | null;
  onClearHighlight?: () => void;
}

const AccessCollectionTracker: React.FC<AccessCollectionTrackerProps> = ({
  items,
  onChange,
  highlightedId,
  onClearHighlight,
}) => {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editError, setEditError] = useState('');
  const [showAddAmountPanel, setShowAddAmountPanel] = useState(true);
  const [showEditAmountPanel, setShowEditAmountPanel] = useState(true);

  useEffect(() => {
    if (!highlightedId || typeof document === 'undefined') return;
    const row = document.getElementById(`access-row-${highlightedId}`);
    if (row) {
      row.classList.add('ring-2', 'ring-blue-400');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timeout = window.setTimeout(() => {
        row.classList.remove('ring-2', 'ring-blue-400');
        onClearHighlight?.();
      }, 2000);
      return () => window.clearTimeout(timeout);
    }
    onClearHighlight?.();
  }, [highlightedId, onClearHighlight]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  const resetForm = () => {
    setForm(initialFormState);
    setFormError('');
    setShowAddAmountPanel(true);
  };

  const formatCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('he-IL') : '-';

  const parsePositiveNumber = (value: string, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : fallback;
  };

  const validateForm = (data: FormState, setError: (msg: string) => void) => {
    if (!data.accountNumber.trim()) {
      setError('חובה להזין מספר חשבון עסקה');
      return false;
    }
    if (!data.insuredName.trim()) {
      setError('חובה להזין שם מבוטח');
      return false;
    }
    if (!data.caseName.trim()) {
      setError('חובה להזין שם תיק');
      return false;
    }
    const amountValue = Number(data.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('סכום חייב להיות מספר חיובי');
      return false;
    }
    return true;
  };

  const handleAdd = () => {
    if (!validateForm(form, setFormError)) {
      return;
    }
    const now = new Date().toISOString();
    const nextItem: AccessCollectionItem = {
      id: crypto.randomUUID(),
      accountNumber: form.accountNumber.trim(),
      insuredName: form.insuredName.trim(),
      caseName: form.caseName.trim(),
      demandDate: form.demandDate ? form.demandDate : null,
      amount: parsePositiveNumber(form.amount),
      category: form.category,
      totalDeductible: parsePositiveNumber(form.totalDeductible),
      outstandingBalance: parsePositiveNumber(form.outstandingBalance),
      isPaid: false,
      createdAt: now,
      updatedAt: now,
    };
    onChange([...items, nextItem]);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('האם למחוק רשומה זו?')) return;
    onChange(items.filter(item => item.id !== id));
  };

  const togglePaid = (id: string) => {
    const now = new Date().toISOString();
    onChange(
      items.map(item =>
        item.id === id ? { ...item, isPaid: !item.isPaid, updatedAt: now } : item
      )
    );
  };

  const startEdit = (item: AccessCollectionItem) => {
    setEditingItem(item.id);
    setEditForm({
      accountNumber: item.accountNumber,
      insuredName: item.insuredName,
      caseName: item.caseName,
      demandDate: item.demandDate ?? '',
      amount: item.amount.toString(),
      totalDeductible: item.totalDeductible.toString(),
      outstandingBalance: item.outstandingBalance.toString(),
      category: item.category,
    });
    setEditError('');
    setShowEditAmountPanel(true);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditError('');
    setShowEditAmountPanel(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    if (!validateForm(editForm, setEditError)) {
      return;
    }
    const now = new Date().toISOString();
    onChange(
      items.map(item =>
        item.id === editingItem
          ? {
              ...item,
              accountNumber: editForm.accountNumber.trim(),
              insuredName: editForm.insuredName.trim(),
              caseName: editForm.caseName.trim(),
              demandDate: editForm.demandDate ? editForm.demandDate : null,
              amount: parsePositiveNumber(editForm.amount),
              totalDeductible: parsePositiveNumber(editForm.totalDeductible),
              outstandingBalance: parsePositiveNumber(editForm.outstandingBalance),
              category: editForm.category,
              updatedAt: now,
            }
          : item
      )
    );
    cancelEdit();
  };

  const AmountPanel = ({
    state,
    onChangeState,
  }: {
    state: FormState;
    onChangeState: (updater: (prev: FormState) => FormState) => void;
  }) => (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <label className="text-xs font-medium text-slate-600">
        סכום
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={state.amount}
          onChange={e => onChangeState(prev => ({ ...prev, amount: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        סה"כ השתתפות עצמית
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={state.totalDeductible}
          onChange={e => onChangeState(prev => ({ ...prev, totalDeductible: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        חוב נוכחי ע"ח ה"ע
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={state.outstandingBalance}
          onChange={e => onChangeState(prev => ({ ...prev, outstandingBalance: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">הוספת דרישת גבייה – אקסס</h2>
          <p className="text-sm text-slate-500 mt-1">נהל דרישות Access עם נתוני סכום מפורטים.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            מספר חשבון עסקה
            <input
              type="text"
              value={form.accountNumber}
              onChange={e => setForm(current => ({ ...current, accountNumber: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            שם המבוטח
            <input
              type="text"
              value={form.insuredName}
              onChange={e => setForm(current => ({ ...current, insuredName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            שם התיק
            <input
              type="text"
              value={form.caseName}
              onChange={e => setForm(current => ({ ...current, caseName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            מועד דרישה
            <input
              type="date"
              value={form.demandDate}
              onChange={e => setForm(current => ({ ...current, demandDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <div className="text-sm font-medium text-slate-700">
            קטגוריה
            <div className="mt-2 flex gap-4">
              {(['legal_fee', 'expenses'] as CollectionCategory[]).map(option => (
                <label key={option} className="inline-flex items-center gap-2 text-slate-600">
                  <input
                    type="radio"
                    name="access-category"
                    checked={form.category === option}
                    onChange={() => setForm(current => ({ ...current, category: option }))}
                  />
                  {CATEGORY_LABELS[option]}
                </label>
              ))}
            </div>
          </div>
          <div className="text-sm font-medium text-slate-700">
            סכום מפורט
            <button
              type="button"
              onClick={() => setShowAddAmountPanel(prev => !prev)}
              className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-500"
            >
              {showAddAmountPanel ? 'הסתר פירוט' : 'עריכת סכום'}
            </button>
            {showAddAmountPanel && (
              <AmountPanel
                state={form}
                onChangeState={updater => setForm(prev => updater(prev))}
              />
            )}
          </div>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
          >
            הוסף רשומה
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 hidden md:table-cell w-12">#</th>
              <th className="px-4 py-3">מספר חשבון עסקה</th>
              <th className="px-4 py-3">שם המבוטח</th>
              <th className="px-4 py-3">שם התיק</th>
              <th className="px-4 py-3">מועד דרישה</th>
              <th className="px-4 py-3">סכום</th>
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  אין נתונים להצגה.
                </td>
              </tr>
            )}
            {sortedItems.map((item, index) => {
              const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
              const overdueLabel = formatOverdueLabel(overdueDays);
              const zebraClass = index % 2 === 0 ? 'bg-white' : 'bg-[#f8f8f8]';
              const baseClass = overdueDays !== null ? 'bg-red-50 text-red-800 hover:bg-red-100' : `${zebraClass}`;
              const rowClasses = `${baseClass} hover:bg-[#eef5ff] transition-colors`;
              return (
                <tr key={item.id} id={`access-row-${item.id}`} className={rowClasses}>
                  <td className="px-3 py-3 text-xs text-slate-500 font-semibold hidden md:table-cell">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold">{item.accountNumber}</td>
                  <td className="px-4 py-3">{item.insuredName || '-'}</td>
                  <td className="px-4 py-3">{item.caseName || '-'}</td>
                  <td className="px-4 py-3">{formatDate(item.demandDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold">{formatCurrency(item.amount)}</span>
                      <span className="text-xs text-slate-500">{CATEGORY_LABELS[item.category]}</span>
                      <span className="text-[11px] text-slate-500">
                        השתתפות עצמית: {formatCurrency(item.totalDeductible)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        חוב נוכחי: {formatCurrency(item.outstandingBalance)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => togglePaid(item.id)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.isPaid
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.isPaid ? 'שולם' : 'ממתין'}
                      </button>
                      {overdueLabel && (
                        <span className="text-xs font-bold text-red-600">{overdueLabel}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-500"
                      >
                        ערוך
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-semibold text-red-600 hover:text-red-500"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">עריכת רשומה – אקסס</h3>
              <button
                onClick={cancelEdit}
                className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                סגור
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                מספר חשבון עסקה
                <input
                  type="text"
                  value={editForm.accountNumber}
                  onChange={e => setEditForm(current => ({ ...current, accountNumber: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                שם המבוטח
                <input
                  type="text"
                  value={editForm.insuredName}
                  onChange={e => setEditForm(current => ({ ...current, insuredName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                שם התיק
                <input
                  type="text"
                  value={editForm.caseName}
                  onChange={e => setEditForm(current => ({ ...current, caseName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                מועד דרישה
                <input
                  type="date"
                  value={editForm.demandDate}
                  onChange={e => setEditForm(current => ({ ...current, demandDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <div className="text-sm font-medium text-slate-700">
                קטגוריה
                <div className="mt-2 flex gap-4">
                  {(['legal_fee', 'expenses'] as CollectionCategory[]).map(option => (
                    <label key={option} className="inline-flex items-center gap-2 text-slate-600">
                      <input
                        type="radio"
                        name="access-category-edit"
                        checked={editForm.category === option}
                        onChange={() => setEditForm(current => ({ ...current, category: option }))}
                      />
                      {CATEGORY_LABELS[option]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="text-sm font-medium text-slate-700">
                סכום מפורט
                <button
                  type="button"
                  onClick={() => setShowEditAmountPanel(prev => !prev)}
                  className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-500"
                >
                  {showEditAmountPanel ? 'הסתר פירוט' : 'עריכת סכום'}
                </button>
                {showEditAmountPanel && (
                  <AmountPanel
                    state={editForm}
                    onChangeState={updater => setEditForm(prev => updater(prev))}
                  />
                )}
              </div>
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessCollectionTracker;

