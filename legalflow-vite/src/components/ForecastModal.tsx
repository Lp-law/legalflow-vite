import React, { useMemo, useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Activity, Wallet, AlertCircle, Ban, Pencil, RotateCcw } from 'lucide-react';
import type { Transaction } from '../types';
import { computeYearEndForecast } from '../utils/forecast';
import {
  getForecastItemOverrides,
  setForecastItemOverride,
  removeForecastItemOverride,
  getForecastMonthlyBuffer,
  setForecastMonthlyBuffer,
  getForecastManualMonthlyTotal,
  setForecastManualMonthlyTotal,
  STORAGE_EVENT,
} from '../services/storageService';
import type { ForecastItemOverride } from '../services/storageService';

interface ForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const renderCurrency = (value: number) =>
  `₪${Math.round(value).toLocaleString('he-IL')}`;

const Row: React.FC<{
  label: string;
  value: number;
  hint?: string;
  bold?: boolean;
  total?: boolean;
  negative?: boolean;
}> = ({ label, value, hint, bold, total, negative }) => (
  <div
    className={`flex items-baseline justify-between gap-4 py-1.5 ${
      total ? 'border-t border-slate-300 pt-2 font-bold' : ''
    } ${bold ? 'font-semibold' : ''}`}
  >
    <div className="flex flex-col">
      <span className={total ? 'text-slate-900' : 'text-slate-700'}>{label}</span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
    <span
      className={`tabular-nums ${
        total
          ? value < 0
            ? 'text-rose-700 text-lg'
            : 'text-emerald-700 text-lg'
          : negative
          ? 'text-rose-600'
          : 'text-slate-800'
      }`}
    >
      {negative ? `-${renderCurrency(Math.abs(value))}` : renderCurrency(value)}
    </span>
  </div>
);

const ForecastModal: React.FC<ForecastModalProps> = ({ isOpen, onClose, transactions }) => {
  const today = useMemo(() => new Date(), []);
  const [overrides, setOverrides] = useState<Record<string, ForecastItemOverride>>(() => getForecastItemOverrides());
  const [monthlyBuffer, setBuffer] = useState<number>(() => getForecastMonthlyBuffer());
  const [bufferDraft, setBufferDraft] = useState<string>(() => String(getForecastMonthlyBuffer()));
  const [manualMonthlyTotal, setManualMonthlyTotal] = useState<number>(() => getForecastManualMonthlyTotal());
  const [manualTotalDraft, setManualTotalDraft] = useState<string>(() => String(getForecastManualMonthlyTotal()));
  const [editingAmountKey, setEditingAmountKey] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState<string>('');

  const f = useMemo(
    () => computeYearEndForecast(transactions, today, overrides, monthlyBuffer, manualMonthlyTotal),
    [transactions, today, overrides, monthlyBuffer, manualMonthlyTotal],
  );

  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [showFixedList, setShowFixedList] = useState(false);
  const [showExcludedList, setShowExcludedList] = useState(false);
  const [showHiddenItems, setShowHiddenItems] = useState(false);

  useEffect(() => {
    const handler = () => {
      setOverrides(getForecastItemOverrides());
      setBuffer(getForecastMonthlyBuffer());
      setBufferDraft(String(getForecastMonthlyBuffer()));
      setManualMonthlyTotal(getForecastManualMonthlyTotal());
      setManualTotalDraft(String(getForecastManualMonthlyTotal()));
    };
    window.addEventListener(STORAGE_EVENT, handler);
    return () => window.removeEventListener(STORAGE_EVENT, handler);
  }, []);

  const handleExcludeItem = (bucketKey: string) => {
    const current = overrides[bucketKey] ?? {};
    const next = setForecastItemOverride(bucketKey, { ...current, excluded: true });
    setOverrides(next);
  };

  const handleClearOverride = (bucketKey: string) => {
    const next = removeForecastItemOverride(bucketKey);
    setOverrides(next);
  };

  const handleStartAmountEdit = (bucketKey: string, currentAmount: number) => {
    setEditingAmountKey(bucketKey);
    setAmountDraft(String(Math.round(currentAmount)));
  };

  const handleSaveAmountOverride = (bucketKey: string) => {
    const parsed = Number(amountDraft.replace(/[, ₪]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert('נא להזין סכום חוקי');
      return;
    }
    const current = overrides[bucketKey] ?? {};
    const next = setForecastItemOverride(bucketKey, { ...current, monthlyAmount: parsed });
    setOverrides(next);
    setEditingAmountKey(null);
    setAmountDraft('');
  };

  const handleCancelAmountEdit = () => {
    setEditingAmountKey(null);
    setAmountDraft('');
  };

  const handleSaveBuffer = () => {
    const parsed = Number(bufferDraft.replace(/[, ₪]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert('נא להזין סכום חוקי');
      setBufferDraft(String(monthlyBuffer));
      return;
    }
    const next = setForecastMonthlyBuffer(parsed);
    setBuffer(next);
    setBufferDraft(String(next));
  };

  const handleSaveManualTotal = () => {
    const parsed = Number(manualTotalDraft.replace(/[, ₪]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert('נא להזין סכום חוקי');
      setManualTotalDraft(String(manualMonthlyTotal));
      return;
    }
    const next = setForecastManualMonthlyTotal(parsed);
    setManualMonthlyTotal(next);
    setManualTotalDraft(String(next));
  };

  if (!isOpen) return null;

  const noClosedMonths = f.closedMonthsCount === 0;
  const hasAnyOverride = Object.keys(overrides).length > 0;
  const activeFixedItems = f.fixedExpenseBreakdown.filter(item => !item.isExcluded);
  const hiddenFixedItems = f.fixedExpenseBreakdown.filter(item => item.isExcluded);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto pt-12">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-violet-600" />
              תחזית סוף שנה {f.year}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              נכון ל-{today.toLocaleDateString('he-IL')} · {f.closedMonthsCount} חודשים שנסגרו · {f.remainingMonthsCount} חודשים שנותרו
            </p>
            <p className="text-xs text-blue-600 mt-1">
              ℹ התחזית מתעדכנת אוטומטית בכל פתיחה. ככל שעוברים חודשים, יש יותר נתונים בפועל ופחות הערכה.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="סגור">
            <X className="w-6 h-6" />
          </button>
        </div>

        {noClosedMonths ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">אין חודש שנסגר עדיין השנה. אי-אפשר לחשב תחזית.</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Forecast 1: Operating profit */}
            <section className="border border-emerald-200 rounded-xl bg-emerald-50/30 p-5">
              <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                תחזית 1: רווח לאחר הוצאות קבועות
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2">הכנסות (נטו, לפני מע"מ)</h4>
                  <Row
                    label="הכנסות בפועל YTD"
                    value={f.incomeYTDActual}
                    hint={`שכר טרחה ÷ 1.18 + הכנסות אחרות, מ-${f.closedMonthsCount} חודשים שנסגרו`}
                  />
                  <Row
                    label="צפי הכנסות לחודשים הנותרים"
                    value={f.incomeRemainingForecast}
                    hint={`${renderCurrency(f.avgMonthlyIncome)} ממוצע × ${f.remainingMonthsCount} חודשים`}
                  />
                  <Row label="סה״כ הכנסות צפויות" value={f.incomeTotal} bold />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2">הוצאות תפעוליות</h4>
                  <Row
                    label="הוצאות בפועל YTD"
                    value={f.operationalExpensesYTDActual}
                    hint={`סה"כ ב-${f.closedMonthsCount} חודשים שנסגרו (רק קבוצת operational)`}
                    negative
                  />
                  {/* Manual monthly expense input - the user's authoritative number */}
                  <div className="bg-white rounded-lg border border-emerald-300 p-3 mt-2">
                    <label className="block text-xs font-semibold text-emerald-900 mb-1">
                      הוצאה קבועה מוערכת לחודש (כולל בלתי צפוי):
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        value={manualTotalDraft}
                        onChange={(e) => setManualTotalDraft(e.target.value)}
                        onBlur={handleSaveManualTotal}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        min="0"
                        step="500"
                        className="w-32 border border-emerald-400 rounded px-2 py-1 text-sm font-bold"
                      />
                      <span className="text-xs text-emerald-700">
                        ₪/חודש × {f.remainingMonthsCount} חודשים = <strong>{renderCurrency(f.effectiveMonthlyExpense * f.remainingMonthsCount)}</strong>
                      </span>
                    </div>
                  </div>
                  <Row label="סה״כ הוצאות צפויות לשנה" value={f.operationalExpensesTotal} bold negative />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-200">
                <Row label="רווח צפוי לסוף שנה (אחרי הוצאות קבועות)" value={f.operatingProfit} total />
              </div>

              {/* Monthly verification table - always visible */}
              <div className="mt-4 bg-white rounded-lg border border-emerald-200 p-3">
                <h4 className="text-sm font-semibold text-emerald-900 mb-2">📊 פירוט חודשי - בקרה (חודשים שנסגרו)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-emerald-700 border-b border-emerald-200">
                      <tr>
                        <th className="text-right py-1">חודש</th>
                        <th className="text-right py-1">הכנסה (לפני מע"מ)</th>
                        <th className="text-right py-1">הוצאה תפעולית</th>
                        <th className="text-right py-1">רווח</th>
                        <th className="text-center py-1 text-slate-400">תנועות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.monthlyBreakdown.map(row => {
                        const profit = row.netIncome - row.operationalExpenses;
                        return (
                          <tr key={row.monthKey} className="border-t border-emerald-100">
                            <td className="py-1 font-semibold">{row.monthLabel}</td>
                            <td className="py-1 text-emerald-700 font-medium">{renderCurrency(row.netIncome)}</td>
                            <td className="py-1 text-rose-600">-{renderCurrency(row.operationalExpenses)}</td>
                            <td className={`py-1 font-bold ${profit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                              {profit < 0 ? '-' : ''}{renderCurrency(Math.abs(profit))}
                            </td>
                            <td className="py-1 text-center text-slate-400">{row.completedTransactionCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-emerald-300 font-bold">
                      <tr>
                        <td className="py-1">סה"כ {f.closedMonthsCount} חודשים</td>
                        <td className="py-1 text-emerald-800">{renderCurrency(f.incomeYTDActual)}</td>
                        <td className="py-1 text-rose-700">-{renderCurrency(f.operationalExpensesYTDActual)}</td>
                        <td className={`py-1 ${(f.incomeYTDActual - f.operationalExpensesYTDActual) >= 0 ? 'text-emerald-900' : 'text-rose-800'}`}>
                          {renderCurrency(f.incomeYTDActual - f.operationalExpensesYTDActual)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  טבלה זו מציגה את הנתונים בפועל לכל חודש שנסגר - לבקרה שהחישוב של ה-YTD נכון. ההוצאה לחודשים הבאים מבוססת על המספר ידני שלמעלה.
                </p>
              </div>

              {/* Advanced details - collapsed by default */}
              <button
                type="button"
                onClick={() => setShowAdvancedDetails(s => !s)}
                className="mt-3 text-[11px] text-blue-700 hover:underline"
              >
                {showAdvancedDetails ? '↑ הסתר' : '↓ הצג'} פירוט מתקדם (זיהוי אוטומטי + override פר-פריט + באפר)
              </button>

              {showAdvancedDetails && (
              <div className="mt-3 text-[11px] text-emerald-800 bg-white/70 rounded p-2 space-y-2">
                {/* Buffer input */}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-semibold">באפר חודשי לבלתי צפוי:</label>
                  <input
                    type="number"
                    value={bufferDraft}
                    onChange={(e) => setBufferDraft(e.target.value)}
                    onBlur={handleSaveBuffer}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    min="0"
                    step="100"
                    className="w-24 border border-emerald-300 rounded px-2 py-0.5 text-[11px]"
                  />
                  <span className="text-emerald-700">₪/חודש (יורד בתחזית לעוד {f.remainingMonthsCount} חודשים = {renderCurrency(f.bufferRemainingForecast)})</span>
                </div>

                <div>
                  💡 הוצאות "קבועות" = מופיעות ב-≥50% מ-{f.closedMonthsCount} החודשים שנסגרו (לפחות {Math.max(1, Math.ceil(f.closedMonthsCount * 0.5))} חודשים).
                  ממוצע חודשי קבוע (אחרי overrides): <strong>{renderCurrency(f.avgFixedMonthlyExpense)}</strong>.
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {activeFixedItems.length > 0 && (
                    <button onClick={() => setShowFixedList(s => !s)} className="text-blue-700 hover:underline">
                      {showFixedList ? '↑ הסתר' : '↓ הצג'} {activeFixedItems.length} הוצאות פעילות בתחזית
                    </button>
                  )}
                  {hiddenFixedItems.length > 0 && (
                    <button onClick={() => setShowHiddenItems(s => !s)} className="text-rose-700 hover:underline">
                      {showHiddenItems ? '↑ הסתר' : '↓ הצג'} {hiddenFixedItems.length} פריטים שהסרת
                    </button>
                  )}
                  {f.excludedOneTimeDescriptions.length > 0 && (
                    <button onClick={() => setShowExcludedList(s => !s)} className="text-amber-700 hover:underline">
                      {showExcludedList ? '↑ הסתר' : '↓ הצג'} {f.excludedOneTimeDescriptions.length} הוצאות חד-פעמיות (לא בתחזית) ({renderCurrency(f.excludedOneTimeAmount)})
                    </button>
                  )}
                </div>

                {showFixedList && (
                  <div className="space-y-1">
                    <table className="w-full text-[10px]">
                      <thead className="text-emerald-700">
                        <tr>
                          <th className="text-right py-1">תיאור</th>
                          <th className="text-right py-1">חודשים</th>
                          <th className="text-right py-1">ממוצע</th>
                          <th className="text-right py-1">סה"כ YTD</th>
                          <th className="text-center py-1 w-32">פעולה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeFixedItems.map(item => (
                          <tr
                            key={item.bucketKey}
                            className="border-t border-emerald-200"
                          >
                            <td className="py-1">
                              {item.description}
                              {item.isAmountOverridden && (
                                <span className="mr-1 inline-block text-[9px] bg-blue-100 text-blue-700 px-1 rounded">override</span>
                              )}
                            </td>
                            <td className="py-1 text-emerald-700">{item.monthsAppeared}/{f.closedMonthsCount}</td>
                            <td className="py-1 text-emerald-700">
                              {editingAmountKey === item.bucketKey ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={amountDraft}
                                    onChange={(e) => setAmountDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveAmountOverride(item.bucketKey);
                                      if (e.key === 'Escape') handleCancelAmountEdit();
                                    }}
                                    autoFocus
                                    className="w-16 border border-emerald-400 rounded px-1 py-0.5 text-[10px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveAmountOverride(item.bucketKey)}
                                    className="text-[9px] text-emerald-700 font-bold"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelAmountEdit}
                                    className="text-[9px] text-slate-500"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span>
                                  {renderCurrency(item.effectiveMonthlyAmount)}
                                  {item.isAmountOverridden && (
                                    <span className="text-[9px] text-slate-500 ml-1">(היה {renderCurrency(item.avgPerMonth)})</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="py-1 font-bold text-emerald-900">{renderCurrency(item.total)}</td>
                            <td className="py-1 text-center">
                              <div className="flex gap-1 justify-center flex-wrap">
                                {editingAmountKey !== item.bucketKey && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartAmountEdit(item.bucketKey, item.effectiveMonthlyAmount)}
                                    className="text-[9px] text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
                                    title="עדכן את הסכום החודשי המוערך"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                    סכום
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleExcludeItem(item.bucketKey)}
                                  className="text-[9px] text-rose-700 hover:text-rose-900 inline-flex items-center gap-0.5"
                                  title="הסר את הפריט מהתחזית"
                                >
                                  <Ban className="w-2.5 h-2.5" />
                                  הסר
                                </button>
                                {item.isAmountOverridden && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearOverride(item.bucketKey)}
                                    className="text-[9px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5"
                                    title="בטל override - חזור לחישוב אוטומטי"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    בטל
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {hasAnyOverride && (
                      <p className="text-[10px] text-blue-700 italic mt-1">
                        💡 שינויים נשמרים אוטומטית. לחיצה על "↺ בטל" מחזירה לחישוב אוטומטי.
                      </p>
                    )}
                  </div>
                )}

                {showExcludedList && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-amber-700 font-semibold">הוצאות שהופיעו ב-{Math.max(1, Math.ceil(f.closedMonthsCount * 0.5)) - 1} חודשים או פחות (לא נכללות בצפי):</p>
                    <table className="w-full text-[10px]">
                      <tbody>
                        {f.excludedOneTimeDescriptions.map(item => (
                          <tr key={item.description} className="border-t border-amber-200">
                            <td className="py-1">{item.description}</td>
                            <td className="py-1 text-amber-700">{item.monthsAppeared}/{f.closedMonthsCount}</td>
                            <td className="py-1 text-left font-bold text-amber-900">{renderCurrency(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {showHiddenItems && hiddenFixedItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-rose-700 font-semibold">פריטים שהסרת מהתחזית (לחץ "↺ שחזר" כדי להחזיר):</p>
                    <table className="w-full text-[10px]">
                      <tbody>
                        {hiddenFixedItems.map(item => (
                          <tr key={item.bucketKey} className="border-t border-rose-200">
                            <td className="py-1 text-slate-600">{item.description}</td>
                            <td className="py-1 text-slate-500">{item.monthsAppeared}/{f.closedMonthsCount}</td>
                            <td className="py-1 text-slate-500">{renderCurrency(item.total)} YTD</td>
                            <td className="py-1 text-center w-20">
                              <button
                                type="button"
                                onClick={() => handleClearOverride(item.bucketKey)}
                                className="text-[9px] text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-0.5"
                                title="החזר את הפריט לתחזית"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                שחזר
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </section>

            {/* Forecast 2: Profit after tax */}
            <section className="border border-amber-200 rounded-xl bg-amber-50/30 p-5">
              <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5" />
                תחזית 2: רווח לאחר מס (משוער)
              </h3>
              <div className="space-y-1">
                <Row label="רווח אחרי הוצאות קבועות" value={f.operatingProfit} bold />
                <Row
                  label="מקדמות מס הכנסה YTD (חודשים שנסגרו)"
                  value={f.taxAdvancesYTDActual}
                  hint="כל הרשומות מקבוצת מס שאינן מע״מ"
                  negative
                />
                <Row
                  label="מקדמות מס צפויות לחודשים הנותרים"
                  value={f.taxAdvancesRemainingForecast}
                  hint={`14% × ${renderCurrency(f.avgMonthlyIncome)} ממוצע נטו × ${f.remainingMonthsCount} חודשים`}
                  negative
                />
              </div>
              <div className="mt-4 pt-3 border-t border-amber-200">
                <Row label="רווח לאחר מס (משוער)" value={f.profitAfterTax} total />
              </div>
              <div className="mt-3 text-[11px] text-amber-800 bg-white/70 rounded p-2">
                ⚠ מקדמות הן פירעון על חשבון. החיוב הסופי בהגשת הדו״ח השנתי עשוי להיות שונה.
              </div>
            </section>

            {/* Forecast 3: Net cash flow */}
            <section className="border border-violet-200 rounded-xl bg-violet-50/30 p-5">
              <h3 className="text-lg font-bold text-violet-900 flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5" />
                תחזית 3: תזרים מזומנים פנוי לסוף שנה
              </h3>
              <div className="space-y-1">
                <Row label="רווח לאחר מס (משוער)" value={f.profitAfterTax} bold />
              </div>
              <div className="mt-4 pt-3 border-t border-dashed border-violet-200">
                <p className="text-xs font-semibold text-violet-700 mb-2">פירעון חוב (לא הוצאה תפעולית):</p>
                <Row
                  label="החזרי הלוואות שולמו YTD"
                  value={f.loansYTDActual}
                  negative
                />
                <Row
                  label="החזרי הלוואות צפויים"
                  value={f.loansRemainingForecast}
                  hint={`ממוצע ${renderCurrency(f.loansYTDActual / Math.max(1, f.closedMonthsCount))} × ${f.remainingMonthsCount} חודשים`}
                  negative
                />
              </div>
              <div className="mt-4 pt-3 border-t border-violet-200">
                <Row label="תזרים מזומנים פנוי ב-31.12" value={f.netCashFlowEoY} total />
              </div>
              <div className="mt-3 text-[11px] text-violet-800 bg-white/70 rounded p-2 space-y-1">
                <div>
                  💰 <strong>פירעון חוב</strong> (קרן + ריבית של הלוואות) הוא תשלום שמקטין את המזומן אבל לא נחשב הוצאה תפעולית.
                </div>
                <div>
                  💰 <strong>משיכות פרטיות</strong> (כולל מזונות) הן חלק מהרווח שאתה לוקח לעצמך - <strong>לא יורדות מהתחזית</strong>. הרווח הזמין למשיכה מוצג בסעיף "רווח לאחר מס".
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="p-6 border-t border-slate-100 flex justify-end bg-slate-50/60">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForecastModal;
