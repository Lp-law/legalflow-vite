import React, { useMemo, useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Activity, Wallet, AlertCircle, Hand } from 'lucide-react';
import type { Transaction } from '../types';
import { computeYearEndForecast, DEFAULT_PERSONAL_WITHDRAWAL_TOKENS } from '../utils/forecast';
import {
  getUserForecastWithdrawalTokens,
  addToForecastWithdrawals,
  removeFromForecastWithdrawals,
  STORAGE_EVENT,
} from '../services/storageService';

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
  const [userWithdrawalTokens, setUserWithdrawalTokens] = useState<string[]>(() => getUserForecastWithdrawalTokens());
  const f = useMemo(
    () => computeYearEndForecast(transactions, today, userWithdrawalTokens),
    [transactions, today, userWithdrawalTokens],
  );
  const [showFixedList, setShowFixedList] = useState(false);
  const [showExcludedList, setShowExcludedList] = useState(false);
  const [showWithdrawalManager, setShowWithdrawalManager] = useState(false);

  useEffect(() => {
    const handler = () => setUserWithdrawalTokens(getUserForecastWithdrawalTokens());
    window.addEventListener(STORAGE_EVENT, handler);
    return () => window.removeEventListener(STORAGE_EVENT, handler);
  }, []);

  const handleReclassifyAsWithdrawal = (description: string) => {
    if (!description.trim()) return;
    addToForecastWithdrawals(description.trim());
    setUserWithdrawalTokens(getUserForecastWithdrawalTokens());
  };

  const handleRemoveWithdrawalToken = (token: string) => {
    removeFromForecastWithdrawals(token);
    setUserWithdrawalTokens(getUserForecastWithdrawalTokens());
  };

  if (!isOpen) return null;

  const noClosedMonths = f.closedMonthsCount === 0;

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
              ℹ התחזית מתעדכנת אוטומטית בכל פתיחה - ככל שעוברים חודשים, יש יותר נתונים בפועל ופחות הערכה.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="סגור"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {noClosedMonths ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              אין חודש שנסגר עדיין השנה. אי-אפשר לחשב תחזית.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Forecast 1: Operating profit */}
            <section className="border border-emerald-200 rounded-xl bg-emerald-50/30 p-5">
              <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                תחזית 1: רווח תפעולי לסוף שנה
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
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2">הוצאות תפעוליות</h4>
                  <Row
                    label="הוצאות בפועל YTD"
                    value={f.operationalExpensesYTDActual}
                    hint="כל ההוצאות התפעוליות שכבר ירדו (כולל חד-פעמיות)"
                    negative
                  />
                  <Row
                    label="צפי הוצאות קבועות לחודשים הנותרים"
                    value={f.fixedExpensesRemainingForecast}
                    hint={`${renderCurrency(f.avgFixedMonthlyExpense)} ממוצע קבוע × ${f.remainingMonthsCount} חודשים`}
                    negative
                  />
                  <Row label="סה״כ הוצאות צפויות" value={f.operationalExpensesTotal} bold negative />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-200">
                <Row label="רווח תפעולי צפוי לסוף שנה" value={f.operatingProfit} total />
              </div>
              <div className="mt-3 text-[11px] text-emerald-800 bg-white/70 rounded p-2 space-y-2">
                <div>
                  💡 הוצאות "קבועות" = מופיעות ב-≥50% מ-{f.closedMonthsCount} החודשים שנסגרו (לפחות {Math.max(1, Math.ceil(f.closedMonthsCount * 0.5))} חודשים).
                  ממוצע חודשי קבוע: <strong>{renderCurrency(f.avgFixedMonthlyExpense)}</strong>.
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {f.fixedExpenseBreakdown.length > 0 && (
                    <button onClick={() => setShowFixedList(s => !s)} className="text-blue-700 hover:underline">
                      {showFixedList ? '↑ הסתר' : '↓ הצג'} {f.fixedExpenseBreakdown.length} הוצאות שזוהו כקבועות (סה"כ {renderCurrency(f.fixedExpensesYTDTotal)})
                    </button>
                  )}
                  {f.excludedOneTimeDescriptions.length > 0 && (
                    <button onClick={() => setShowExcludedList(s => !s)} className="text-amber-700 hover:underline">
                      {showExcludedList ? '↑ הסתר' : '↓ הצג'} {f.excludedOneTimeDescriptions.length} הוצאות חד-פעמיות שהוצאו ({renderCurrency(f.excludedOneTimeAmount)})
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
                          <th className="text-right py-1">ממוצע/חודש</th>
                          <th className="text-right py-1">סה"כ YTD</th>
                          <th className="text-center py-1 w-20">פעולה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.fixedExpenseBreakdown.map(item => (
                          <tr key={item.description} className="border-t border-emerald-200">
                            <td className="py-1">{item.description}</td>
                            <td className="py-1 text-emerald-700">{item.monthsAppeared}/{f.closedMonthsCount}</td>
                            <td className="py-1 text-emerald-700">{renderCurrency(item.avgPerMonth)}</td>
                            <td className="py-1 font-bold text-emerald-900">{renderCurrency(item.total)}</td>
                            <td className="py-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleReclassifyAsWithdrawal(item.description)}
                                className="text-[9px] text-violet-700 hover:text-violet-900 inline-flex items-center gap-0.5"
                                title="סמן כמשיכה פרטית - יוצא מתחזית 1 ויורד בתחזית 3"
                              >
                                <Hand className="w-2.5 h-2.5" />
                                סווג כמשיכה
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {showExcludedList && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-amber-700 font-semibold">הוצאות שהופיעו רק ב-{Math.max(1, Math.ceil(f.closedMonthsCount * 0.5)) - 1} חודשים או פחות (חד-פעמיות):</p>
                    <table className="w-full text-[10px]">
                      <tbody>
                        {f.excludedOneTimeDescriptions.map(item => (
                          <tr key={item.description} className="border-t border-amber-200">
                            <td className="py-1">{item.description}</td>
                            <td className="py-1 text-amber-700">{item.monthsAppeared}/{f.closedMonthsCount} חודשים</td>
                            <td className="py-1 text-left font-bold text-amber-900">{renderCurrency(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-amber-700 italic">
                      אם משהו ברשימה הזו אמור להיות "קבוע" - תיתכן שיש בתיאור וריאציות שלא זוהו כזהות. אפשר לאחד אותן ידנית בתזרים.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Forecast 2: Profit after tax */}
            <section className="border border-amber-200 rounded-xl bg-amber-50/30 p-5">
              <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5" />
                תחזית 2: רווח לאחר מס (משוער)
              </h3>
              <div className="space-y-1">
                <Row label="רווח תפעולי צפוי" value={f.operatingProfit} bold />
                <Row
                  label="מקדמות מס הכנסה YTD (חודשים שנסגרו)"
                  value={f.taxAdvancesYTDActual}
                  hint="כל הרשומות מקבוצת מס שאינן מע״מ - שולם או צפוי"
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
                ⚠ מקדמות הן פירעון על חשבון. החיוב הסופי בהגשת הדו״ח השנתי עשוי להיות שונה (החזר או השלמה).
              </div>
            </section>

            {/* Forecast 3: Net cash flow */}
            <section className="border border-violet-200 rounded-xl bg-violet-50/30 p-5">
              <h3 className="text-lg font-bold text-violet-900 flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5" />
                תחזית 3: תזרים נטו לסוף שנה (אחרי הכל)
              </h3>
              <div className="space-y-1">
                <Row label="רווח לאחר מס (משוער)" value={f.profitAfterTax} bold />
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
                <Row
                  label="משיכות פרטיות שולמו YTD"
                  value={f.withdrawalsYTDActual}
                  negative
                />
                <Row
                  label="משיכות פרטיות צפויות"
                  value={f.withdrawalsRemainingForecast}
                  hint={`ממוצע ${renderCurrency(f.withdrawalsYTDActual / Math.max(1, f.closedMonthsCount))} × ${f.remainingMonthsCount} חודשים`}
                  negative
                />
              </div>
              <div className="mt-4 pt-3 border-t border-violet-200">
                <Row label="תזרים נטו ב-31.12 (כמה יישאר)" value={f.netCashFlowEoY} total />
              </div>
              <div className="mt-3 text-[11px] text-violet-800 bg-white/70 rounded p-2 space-y-2">
                <div>
                  💰 משיכות פרטיות = פריטים שסיווגת כמשיכה. ברירת מחדל כוללת "מזונות" - כל היתר מקבוצת personal נחשבים הוצאה עסקית ויורדים בתחזית 1.
                </div>
                <button
                  type="button"
                  onClick={() => setShowWithdrawalManager(s => !s)}
                  className="text-blue-700 hover:underline"
                >
                  {showWithdrawalManager ? '↑ הסתר ניהול משיכות' : '↓ נהל סיווג משיכות פרטיות'}
                </button>
                {showWithdrawalManager && (
                  <div className="space-y-2 pt-2">
                    <div>
                      <p className="text-[10px] font-semibold text-violet-700 mb-1">משיכות מובנות (תמיד פעילות):</p>
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_PERSONAL_WITHDRAWAL_TOKENS.map(item => (
                          <span key={item} className="inline-block text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    {userWithdrawalTokens.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-violet-700 mb-1">סיווג שלך ({userWithdrawalTokens.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {userWithdrawalTokens.map(token => (
                            <span key={token} className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                              {token}
                              <button
                                type="button"
                                onClick={() => handleRemoveWithdrawalToken(token)}
                                className="hover:text-violet-900"
                                aria-label="החזר להוצאות עסקיות"
                                title="החזר להוצאות עסקיות (יחזור לתחזית 1)"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-violet-600 italic">
                      להוסיף פריט - לך לתחזית 1, פתח את "הצג הוצאות שזוהו כקבועות", ולחץ "🤚 סווג כמשיכה" ליד הפריט.
                    </p>
                  </div>
                )}
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
