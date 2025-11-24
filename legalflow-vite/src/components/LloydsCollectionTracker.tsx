import React, { useEffect, useMemo, useState } from 'react';
import type { CollectionCategory, LloydsCollectionItem } from '../types';
import { calculateOverdueDays, formatOverdueLabel } from '../utils/collectionStatus';
import SyndicateSelector from './SyndicateSelector';

const CATEGORY_LABELS: Record<CollectionCategory, string> = {
  expenses: 'הוצאות',
  legal_fee: 'שכר טרחה',
};

interface FormState {
  accountNumber: string;
  claimantName: string;
  insuredName: string;
  syndicate: string;
  demandDate: string;
  amount: string;
  category: CollectionCategory;
}

const initialFormState: FormState = {
  accountNumber: '',
  claimantName: '',
  insuredName: '',
  syndicate: '',
  demandDate: '',
  amount: '',
  category: 'legal_fee',
};

interface LloydsCollectionTrackerProps {
  items: LloydsCollectionItem[];
  onChange: (items: LloydsCollectionItem[]) => void;
  highlightedId?: string | null;
  onClearHighlight?: () => void;
}

const LloydsCollectionTracker: React.FC<LloydsCollectionTrackerProps> = ({
  items,
  onChange,
  highlightedId,
  onClearHighlight,
}) => {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState<string>('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!highlightedId || typeof document === 'undefined') {
      return;
    }

    const row = document.getElementById(`lloyds-row-${highlightedId}`);
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
  };

  const handleAdd = () => {
    if (!form.accountNumber.trim()) {
      setFormError('חובה להזין מספר חשבון עסקה');
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError('סכום חייב להיות מספר חיובי');
      return;
    }

    const now = new Date().toISOString();
    const nextItem: LloydsCollectionItem = {
      id: crypto.randomUUID(),
      accountNumber: form.accountNumber.trim(),
      claimantName: form.claimantName.trim(),
      insuredName: form.insuredName.trim(),
      syndicate: form.syndicate.trim(),
      demandDate: form.demandDate ? form.demandDate : null,
      amount: Number(Math.abs(amountValue).toFixed(2)),
      category: form.category,
      isPaid: false,
      createdAt: now,
      updatedAt: now,
    };

    onChange([...items, nextItem]);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('האם למחוק רשומה זו?')) {
      return;
    }
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

  const startEdit = (item: LloydsCollectionItem) => {
    setEditingItem(item.id);
    setEditForm({
      accountNumber: item.accountNumber,
      claimantName: item.claimantName,
      insuredName: item.insuredName,
      syndicate: item.syndicate,
      demandDate: item.demandDate ?? '',
      amount: item.amount.toString(),
      category: item.category,
    });
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm(initialFormState);
    setEditError('');
  };

  const handleSaveEdit = () => {
    if (!editingItem) {
      return;
    }
    if (!editForm.accountNumber.trim()) {
      setEditError('חובה להזין מספר חשבון עסקה');
      return;
    }
    const amountValue = Number(editForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setEditError('סכום חייב להיות מספר חיובי');
      return;
    }
    const now = new Date().toISOString();

    onChange(
      items.map(item =>
        item.id === editingItem
          ? {
              ...item,
              accountNumber: editForm.accountNumber.trim(),
              claimantName: editForm.claimantName.trim(),
              insuredName: editForm.insuredName.trim(),
              syndicate: editForm.syndicate.trim(),
              demandDate: editForm.demandDate ? editForm.demandDate : null,
              amount: Number(Math.abs(amountValue).toFixed(2)),
              category: editForm.category,
              updatedAt: now,
            }
          : item
      )
    );
    cancelEdit();
  };

  const formatCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('he-IL') : '-';

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">הוספת דרישת גבייה חדשה (לוידס)</h2>
          <p className="text-sm text-slate-500 mt-1">
            מלא את הפרטים הבאים כדי לעקוב אחרי חשבונות עסקה מול לוידס.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            מספר חשבון עסקה
            <input
              type="text"
              value={form.accountNumber}
              onChange={e => setForm(current => ({ ...current, accountNumber: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="לדוגמה: L-2025-001"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            שם התובע
            <input
              type="text"
              value={form.claimantName}
              onChange={e => setForm(current => ({ ...current, claimantName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="שם התובע"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            שם המבוטח
            <input
              type="text"
              value={form.insuredName}
              onChange={e => setForm(current => ({ ...current, insuredName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="שם המבוטח"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            סינדיקט
            <SyndicateSelector
              value={form.syndicate}
              onChange={next => setForm(current => ({ ...current, syndicate: next }))}
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
          <label className="text-sm font-medium text-slate-700">
            סכום
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={e => setForm(current => ({ ...current, amount: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="₪0"
            />
          </label>
          <div className="text-sm font-medium text-slate-700">
            קטגוריה
            <div className="mt-2 flex gap-4">
              {(['legal_fee', 'expenses'] as CollectionCategory[]).map(option => (
                <label key={option} className="inline-flex items-center gap-2 text-slate-600">
                  <input
                    type="radio"
                    name="lloyds-category"
                    checked={form.category === option}
                    onChange={() => setForm(current => ({ ...current, category: option }))}
                  />
                  {CATEGORY_LABELS[option]}
                </label>
              ))}
            </div>
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
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
            <tr>
              <th className="px-4 py-3">מספר חשבון עסקה</th>
              <th className="px-4 py-3">שם התובע</th>
              <th className="px-4 py-3">שם המבוטח</th>
              <th className="px-4 py-3">סינדיקט</th>
              <th className="px-4 py-3">מועד דרישה</th>
              <th className="px-4 py-3">סכום</th>
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-slate-500 text-center">
                  אין נתונים להצגה.
                </td>
              </tr>
            )}
            {sortedItems.map(item => {
              const overdueDays = calculateOverdueDays(item.demandDate, item.isPaid);
              const overdueLabel = formatOverdueLabel(overdueDays);
              const rowClasses = overdueDays !== null ? 'bg-red-50 text-red-800' : '';
              return (
                <tr key={item.id} id={`lloyds-row-${item.id}`} className={rowClasses}>
                  <td className="px-4 py-3 font-semibold">{item.accountNumber}</td>
                  <td className="px-4 py-3">{item.claimantName || '-'}</td>
                  <td className="px-4 py-3">{item.insuredName || '-'}</td>
                  <td className="px-4 py-3">{item.syndicate || '-'}</td>
                  <td className="px-4 py-3">{formatDate(item.demandDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end">
                      <span className="font-bold">{formatCurrency(item.amount)}</span>
                      <span className="text-xs text-slate-500">{CATEGORY_LABELS[item.category]}</span>
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
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">עריכת רשומה</h3>
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
                  onChange={e =>
                    setEditForm(current => ({ ...current, accountNumber: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                שם התובע
                <input
                  type="text"
                  value={editForm.claimantName}
                  onChange={e =>
                    setEditForm(current => ({ ...current, claimantName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                שם המבוטח
                <input
                  type="text"
                  value={editForm.insuredName}
                  onChange={e =>
                    setEditForm(current => ({ ...current, insuredName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                סינדיקט
                <SyndicateSelector
                  value={editForm.syndicate}
                  onChange={next => setEditForm(current => ({ ...current, syndicate: next }))}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                מועד דרישה
                <input
                  type="date"
                  value={editForm.demandDate}
                  onChange={e =>
                    setEditForm(current => ({ ...current, demandDate: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                סכום
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount}
                  onChange={e =>
                    setEditForm(current => ({ ...current, amount: e.target.value }))
                  }
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
                        name="lloyds-category-edit"
                        checked={editForm.category === option}
                        onChange={() =>
                          setEditForm(current => ({ ...current, category: option }))
                        }
                      />
                      {CATEGORY_LABELS[option]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {editError && <p className="text-sm text-red-600 mt-3">{editError}</p>}
            <div className="mt-6 flex justify-end gap-3">
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

export default LloydsCollectionTracker;

