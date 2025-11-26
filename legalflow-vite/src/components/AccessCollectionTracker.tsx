import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessCollectionItem, CollectionCategory } from '../types';
import { calculateOverdueDays, formatOverdueLabel } from '../utils/collectionStatus';
import { AlertTriangle } from 'lucide-react';
import type { ClientInsightTarget } from './ClientInsightPanel';
import * as XLSX from 'xlsx';
import { formatDateKey } from '../utils/date';

const ACCESS_REQUIRED_HEADERS: readonly string[] = [
  'מספר חשבון עסקה',
  'שם מבוטח',
  'שם תובע',
  'סכום',
  'מועד דרישה',
] as const;

const normalizeHebrewString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

const parseNumericCell = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/,/g, '').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
  }
  return null;
};

const normalizeExcelDate = (value: unknown): string | null => {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const jsDate = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return formatDateKey(jsDate);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/[\/\-.]/);
    if (parts.length === 3) {
      const [part1, part2, part3] = parts.map(part => part.trim());
      const dayFirst = Number(part1.length === 4 ? part3 : part1);
      const monthMiddle = Number(part2);
      const yearSegment = part3.length === 4 ? Number(part3) : Number(part3.length === 2 ? `20${part3}` : part3);
      const actualYear = part1.length === 4 ? Number(part1) : yearSegment;
      const actualDay = part1.length === 4 ? Number(part3) : dayFirst;
      if (
        Number.isFinite(actualYear) &&
        Number.isFinite(monthMiddle) &&
        Number.isFinite(actualDay) &&
        actualYear > 1900
      ) {
        const jsDate = new Date(actualYear, monthMiddle - 1, actualDay);
        if (!Number.isNaN(jsDate.getTime())) {
          return formatDateKey(jsDate);
        }
      }
    }
    const fallback = new Date(trimmed);
    if (!Number.isNaN(fallback.getTime())) {
      return formatDateKey(fallback);
    }
  }
  return null;
};

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
  onClientInsightRequest?: (target: ClientInsightTarget) => void;
}

const AccessCollectionTracker: React.FC<AccessCollectionTrackerProps> = ({
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
  const [showAddAmountPanel, setShowAddAmountPanel] = useState(true);
  const [showEditAmountPanel, setShowEditAmountPanel] = useState(true);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!importFeedback) {
      return;
    }
    const timeout = window.setTimeout(() => setImportFeedback(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

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
          type="text"
          inputMode="decimal"
          value={state.amount}
          onChange={e => onChangeState(prev => ({ ...prev, amount: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="₪0"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        סה"כ השתתפות עצמית
        <input
          type="text"
          inputMode="decimal"
          value={state.totalDeductible}
          onChange={e => onChangeState(prev => ({ ...prev, totalDeductible: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="₪0"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        חוב נוכחי ע"ח ה"ע
        <input
          type="text"
          inputMode="decimal"
          value={state.outstandingBalance}
          onChange={e => onChangeState(prev => ({ ...prev, outstandingBalance: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="₪0"
        />
      </label>
    </div>
  );

  const handleImportFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      if (!workbook.SheetNames.length) {
        throw new Error('הקובץ לא מכיל גיליונות נתונים.');
      }
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, { header: 1 });
      if (!rows.length) {
        throw new Error('הקובץ ריק או שאינו בפורמט נתמך.');
      }
      const headerRow = rows[0].map(cell => normalizeHebrewString(cell));
      const isHeaderValid =
        headerRow.length >= ACCESS_REQUIRED_HEADERS.length &&
        ACCESS_REQUIRED_HEADERS.every((header, index) => headerRow[index] === header);
      if (!isHeaderValid) {
        throw new Error('כותרות הקובץ אינן תואמות את הפורמט הנדרש.');
      }

      const now = new Date().toISOString();
      const existingKeys = new Set(items.map(item => `${item.accountNumber.trim()}__${item.demandDate ?? ''}`));
      const imported: AccessCollectionItem[] = [];
      let skipped = 0;

      rows.slice(1).forEach(row => {
        const [accountCell, insuredCell, caseCell, amountCell, dateCell] = row;
        const accountNumber = normalizeHebrewString(accountCell);
        if (!accountNumber) {
          skipped += 1;
          return;
        }
        const amountValue = parseNumericCell(amountCell);
        if (amountValue === null || !Number.isFinite(amountValue) || amountValue <= 0) {
          skipped += 1;
          return;
        }
        const demandDate = normalizeExcelDate(dateCell);
        const duplicateKey = `${accountNumber}__${demandDate ?? ''}`;
        if (existingKeys.has(duplicateKey)) {
          skipped += 1;
          return;
        }
        const nextItem: AccessCollectionItem = {
          id: crypto.randomUUID(),
          accountNumber,
          insuredName: normalizeHebrewString(insuredCell),
          caseName: normalizeHebrewString(caseCell),
          demandDate,
          amount: amountValue,
          totalDeductible: 0,
          outstandingBalance: amountValue,
          category: 'legal_fee',
          isPaid: false,
          createdAt: now,
          updatedAt: now,
        };
        imported.push(nextItem);
        existingKeys.add(duplicateKey);
      });

      if (!imported.length) {
        setImportFeedback({
          type: 'error',
          message: skipped
            ? 'כל השורות בקובץ נדחו (כפילויות או נתונים חסרים).'
            : 'הקובץ לא הכיל שורות לייבוא.',
        });
        return;
      }

      onChange([...items, ...imported]);
      setImportFeedback({
        type: 'success',
        message: `ייבוא הסתיים: נוספו ${imported.length} רשומות${skipped ? `, דילגנו על ${skipped} שורות` : ''}.`,
      });
    } catch (error) {
      console.error('Access import failed', error);
      const message =
        error instanceof Error ? error.message : 'אירעה שגיאה בעת קריאת הקובץ. ודא שהקובץ בפורמט התקין.';
      setImportFeedback({ type: 'error', message });
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    handleImportFile(file).finally(() => {
      event.target.value = '';
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {importFeedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            importFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {importFeedback.message}
        </div>
      )}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              ייבוא מרשימת חייבים (Excel)
            </button>
            <button
              onClick={handleAdd}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
            >
              הוסף רשומה
            </button>
          </div>
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
                <tr key={item.id} id={`access-row-${item.id}`} className={rowClasses}>
                  <td className="px-3 py-3 text-xs text-slate-500 font-semibold hidden md:table-cell">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold">
                    <div className="flex items-center gap-2 justify-end">
                      {isHighRisk && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span>{item.accountNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.insuredName ? (
                      <button
                        type="button"
                        onClick={() =>
                          onClientInsightRequest?.({
                            name: item.insuredName,
                            source: 'access',
                          })
                        }
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        {item.insuredName}
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
};

export default AccessCollectionTracker;

