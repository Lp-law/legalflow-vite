import React, { useEffect, useMemo, useState } from 'react';
import type { CollectionCategory, GenericCollectionItem } from '../types';
import { calculateOverdueDays, formatOverdueLabel } from '../utils/collectionStatus';
import ClientSelector from './ClientSelector';
import { AlertTriangle } from 'lucide-react';
import type { ClientInsightTarget } from './ClientInsightPanel';

const CATEGORY_LABELS: Record<CollectionCategory, string> = {
  expenses: 'הוצאות',
  legal_fee: 'שכר טרחה',
};

interface FormState {
  accountNumber: string;
  clientName: string;
  caseName: string;
  demandDate: string;
  amount: string;
  category: CollectionCategory;
}

const initialFormState: FormState = {
  accountNumber: '',
  clientName: '',
  caseName: '',
  demandDate: '',
  amount: '',
  category: 'legal_fee',
};

interface GenericCollectionTrackerProps {
  items: GenericCollectionItem[];
  onChange: (items: GenericCollectionItem[]) => void;
  highlightedId?: string | null;
  onClearHighlight?: () => void;
  onClientInsightRequest?: (target: ClientInsightTarget) => void;
}

const GenericCollectionTracker: React.FC<GenericCollectionTrackerProps> = ({
  items,
  onChange,
  highlightedId,
  onClearHighlight,
  onClientInsightRequest,
}) => {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!highlightedId || typeof document === 'undefined') {
      return;
    }
    const row = document.getElementById(`generic-row-${highlightedId}`);
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

  const formatCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('he-IL') : '-';

  const handleAdd = () => {
    if (!form.accountNumber.trim()) {
      setFormError('חובה להזין מספר חשבון עסקה');
      return;
    }
    if (!form.clientName.trim()) {
      setFormError('חובה להזין שם לקוח');
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError('סכום חייב להיות מספר חיובי');
      return;
    }
    const now = new Date().toISOString();
    const nextItem: GenericCollectionItem = {
      id: crypto.randomUUID(),
      accountNumber: form.accountNumber.trim(),
      clientName: form.clientName.trim(),
      caseName: form.caseName.trim(),
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

  const startEdit = (item: GenericCollectionItem) => {
    setEditingItem(item.id);
    setEditForm({
      accountNumber: item.accountNumber,
      clientName: item.clientName,
      caseName: item.caseName,
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
    if (!editingItem) return;
    if (!editForm.accountNumber.trim()) {
      setEditError('חובה להזין מספר חשבון עסקה');
      return;
    }
    if (!editForm.clientName.trim()) {
      setEditError('חובה להזין שם לקוח');
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
              clientName: editForm.clientName.trim(),
              caseName: editForm.caseName.trim(),
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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">הוספת דרישת גבייה ללקוחות שונים</h2>
          <p className="text-sm text-slate-500 mt-1">נהל את דרישות הגבייה מול לקוחות פרטיים.</p>
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
            שם הלקוח
            <ClientSelector
              value={form.clientName}
              onChange={next => setForm(current => ({ ...current, clientName: next }))}
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
          <label className="text-sm font-medium text-slate-700">
            סכום
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={e => setForm(current => ({ ...current, amount: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                    name="generic-category"
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
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 hidden md:table-cell w-12">#</th>
              <th className="px-4 py-3">מספר חשבון עסקה</th>
              <th className="px-4 py-3">שם הלקוח</th>
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
              const isHighRisk = overdueDays !== null && overdueDays >= 90 && !item.isPaid;
              const zebraClass = index % 2 === 0 ? 'bg-white' : 'bg-[#f8f8f8]';
              let rowClasses = `${zebraClass} hover:bg-[#eef5ff] transition-colors`;
              if (overdueDays !== null && overdueDays >= 45 && !item.isPaid) {
                rowClasses =
                  overdueDays >= 90
                    ? 'bg-red-900/20 text-red-100 ring-1 ring-red-400 hover:bg-red-900/30 transition-colors'
                    : 'bg-red-50 text-red-800 hover:bg-red-100 transition-colors';
              }
              return (
                <tr key={item.id} id={`generic-row-${item.id}`} className={rowClasses}>
                  <td className="px-3 py-3 text-xs text-slate-500 font-semibold hidden md:table-cell">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold">
                    <div className="flex items-center gap-2 justify-end">
                      {isHighRisk && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span>{item.accountNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.clientName ? (
                      <button
                        type="button"
                        onClick={() =>
                          onClientInsightRequest?.({
                            name: item.clientName,
                            source: 'generic',
                          })
                        }
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        {item.clientName}
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">{item.caseName || '-'}</td>
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
                        <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                          {overdueLabel}
                        </span>
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
                שם הלקוח
                <ClientSelector
                  value={editForm.clientName}
                  onChange={next => setEditForm(current => ({ ...current, clientName: next }))}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                שם התיק
                <input
                  type="text"
                  value={editForm.caseName}
                  onChange={e =>
                    setEditForm(current => ({ ...current, caseName: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                  type="text"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={e =>
                    setEditForm(current => ({ ...current, amount: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                        name="generic-category-edit"
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

export default GenericCollectionTracker;

