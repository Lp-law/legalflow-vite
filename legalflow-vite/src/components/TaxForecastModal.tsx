import React, { useMemo, useState } from 'react';
import { X, Calculator, AlertTriangle, CheckCircle2, Info, ArrowDown, ArrowUp, Equal } from 'lucide-react';
import type { Transaction } from '../types';
import {
  calculateTaxForecast,
  MIN_CREDIT_POINTS,
  CREDIT_POINT_MONTHLY_VALUE,
  INCOME_TAX_ADVANCE_RATE,
} from '../services/taxForecastService';

interface TaxForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const renderCurrency = (value: number) =>
  `₪${Math.round(value).toLocaleString('he-IL')}`;

const renderPct = (rate: number) => `${(rate * 100).toFixed(0)}%`;

const StepRow: React.FC<{
  label: string;
  value: number;
  hint?: string;
  emphasis?: 'add' | 'sub' | 'equals';
  bold?: boolean;
  total?: boolean;
}> = ({ label, value, hint, emphasis, bold, total }) => {
  const Icon = emphasis === 'add' ? ArrowUp : emphasis === 'sub' ? ArrowDown : emphasis === 'equals' ? Equal : null;
  const iconColor =
    emphasis === 'add' ? 'text-emerald-600' : emphasis === 'sub' ? 'text-rose-600' : 'text-slate-500';
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        total ? 'border-t-2 border-slate-300 pt-2 font-bold' : ''
      } ${bold ? 'font-semibold' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />}
        <div className="flex flex-col min-w-0">
          <span className={total ? 'text-slate-900' : 'text-slate-700'}>{label}</span>
          {hint && <span className="text-[11px] text-slate-400 mt-0.5">{hint}</span>}
        </div>
      </div>
      <span className={`tabular-nums whitespace-nowrap ${total ? 'text-lg text-slate-900' : 'text-slate-800'}`}>
        {emphasis === 'sub' && value > 0 ? `-${renderCurrency(value)}` : renderCurrency(value)}
      </span>
    </div>
  );
};

const Step: React.FC<{ num: number; title: string; children: React.ReactNode; subtitle?: string }> = ({
  num,
  title,
  children,
  subtitle,
}) => (
  <section className="rounded-2xl border border-slate-200 p-4 bg-slate-50/40">
    <div className="flex items-center gap-2 mb-3">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold">
        {num}
      </span>
      <h3 className="font-bold text-slate-800">{title}</h3>
    </div>
    {subtitle && <p className="text-[11px] text-slate-500 mb-2">{subtitle}</p>}
    {children}
  </section>
);

const TaxForecastModal: React.FC<TaxForecastModalProps> = ({ isOpen, onClose, transactions }) => {
  const today = useMemo(() => new Date(), []);
  const [creditPoints, setCreditPoints] = useState<number>(MIN_CREDIT_POINTS);
  const annualCreditValue = creditPoints * CREDIT_POINT_MONTHLY_VALUE * 12;

  const result = useMemo(
    () =>
      calculateTaxForecast({
        transactions,
        referenceDate: today,
        annualCreditPointValue: annualCreditValue,
      }),
    [transactions, today, annualCreditValue]
  );

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  // Decide the dominant action message.
  const adjustment = result.monthlyAdvanceAdjustment;
  const balance = result.balanceVsAdvances;
  const monthsLeft = result.monthsRemainingForAdvance;
  const recommendation = (() => {
    if (monthsLeft === 0 || Math.abs(adjustment) < 200) {
      return {
        tone: 'neutral' as const,
        title: monthsLeft === 0 ? 'השנה כבר נסגרה' : 'המקדמה החודשית תקינה',
        body:
          monthsLeft === 0
            ? `יתרת המס לסוף השנה: ${renderCurrency(Math.abs(balance))} ${balance > 0 ? 'לתשלום' : 'החזר'}.`
            : 'לפי התחזית הנוכחית המקדמה שלך מספיקה. תמשיך לעקוב מדי חודש.',
      };
    }
    if (adjustment > 0) {
      return {
        tone: 'warn' as const,
        title: `מומלץ להגדיל את המקדמה החודשית ב-${renderCurrency(adjustment)}/חודש למשך ${monthsLeft} חודשים שנותרו`,
        body: `ללא הגדלה תיווצר יתרת מס לתשלום של ${renderCurrency(balance)} בסוף השנה. הגדלה זו תאזן את היתרה.`,
      };
    }
    return {
      tone: 'good' as const,
      title: `אפשר להפחית את המקדמה החודשית ב-${renderCurrency(Math.abs(adjustment))}/חודש למשך ${monthsLeft} חודשים שנותרו`,
      body: `המקדמות עד כה + הצפויות גבוהות מהנדרש. צפי החזר מס: ${renderCurrency(Math.abs(balance))}.`,
    };
  })();

  const recBg =
    recommendation.tone === 'warn'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : recommendation.tone === 'good'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : 'bg-slate-50 border-slate-200 text-slate-700';
  const RecIcon =
    recommendation.tone === 'warn' ? AlertTriangle : recommendation.tone === 'good' ? CheckCircle2 : Info;

  const accuracyHint =
    result.closedMonthsCount === 0
      ? 'אין עדיין חודשים סגורים — דיוק נמוך, בדוק שוב בעוד חודש'
      : result.closedMonthsCount < 3
      ? `${result.closedMonthsCount} חודשים סגורים — דיוק נמוך, התחזית תשתפר עם הזמן`
      : result.closedMonthsCount < 6
      ? `${result.closedMonthsCount} חודשים סגורים — דיוק בינוני`
      : `${result.closedMonthsCount} חודשים סגורים — דיוק גבוה`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Calculator className="w-6 h-6 text-amber-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">תחזית מס - {result.year}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{accuracyHint}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* ACTIONABLE BANNER */}
          <div className={`rounded-2xl border p-4 ${recBg}`}>
            <div className="flex items-start gap-3">
              <RecIcon className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-base mb-1">{recommendation.title}</div>
                <div className="text-sm opacity-90">{recommendation.body}</div>
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-current/20">
                  <div>
                    <div className="text-xs opacity-70">
                      ממוצע ששולם ב-{result.closedMonthsCount} חודשים סגורים
                    </div>
                    <div className="font-bold tabular-nums text-lg">
                      {renderCurrency(result.currentMonthlyAdvance)}/חודש
                    </div>
                  </div>
                  <div>
                    <div className="text-xs opacity-70">
                      התאמה מומלצת ל-{monthsLeft} חודשים שנותרו
                    </div>
                    <div className="font-bold tabular-nums text-lg">
                      {adjustment > 0 ? '+' : ''}
                      {renderCurrency(Math.round(adjustment))}/חודש
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 1: Income */}
          <Step
            num={1}
            title="הכנסות שנתיות (לפני מע&quot;מ)"
            subtitle="כל תקבולי שכ&quot;ט שבוצעו השנה + תחזית לחודשים שנותרו"
          >
            <StepRow label="הכנסות שכ&quot;ט שבוצעו עד כה" value={result.ytdIncome} />
            {result.closedMonthsCount > 0 && result.monthsRemaining > 0 && (
              <StepRow
                label="תחזית לחודשים שנותרו"
                value={result.projectedAnnualIncome - result.ytdIncome}
                hint={`ממוצע ${renderCurrency(result.averageMonthlyIncome)}/חודש × יתרת חודשים`}
                emphasis="add"
              />
            )}
            <StepRow
              label="סה&quot;כ הכנסות שנתיות צפויות"
              value={result.projectedAnnualIncome}
              total
              emphasis="equals"
            />
          </Step>

          {/* STEP 2: Deductible Expenses */}
          <Step
            num={2}
            title="הוצאות מוכרות שנתיות"
            subtitle="הוצאות תפעוליות בלבד. לא כולל: הלוואות, מזונות, משיכות פרטיות, מסים."
          >
            <StepRow label="הוצאות שבוצעו עד כה" value={result.ytdDeductibleExpenses} />
            {result.closedMonthsCount > 0 && result.monthsRemaining > 0 && (
              <StepRow
                label="תחזית לחודשים שנותרו"
                value={result.projectedAnnualDeductibleExpenses - result.ytdDeductibleExpenses}
                hint={`ממוצע ${renderCurrency(result.averageMonthlyDeductibleExpenses)}/חודש × יתרת חודשים`}
                emphasis="add"
              />
            )}
            <StepRow
              label="סה&quot;כ הוצאות שנתיות צפויות"
              value={result.projectedAnnualDeductibleExpenses}
              total
              emphasis="equals"
            />
          </Step>

          {/* STEP 3: Taxable income */}
          <Step num={3} title="חישוב הכנסה חייבת">
            <StepRow label="הכנסות שנתיות" value={result.projectedAnnualIncome} />
            <StepRow
              label="פחות הוצאות מוכרות"
              value={result.projectedAnnualDeductibleExpenses}
              emphasis="sub"
            />
            <StepRow label="הכנסה חייבת" value={result.taxableIncome} total emphasis="equals" />
          </Step>

          {/* STEP 4: Tax brackets */}
          <Step
            num={4}
            title={`חישוב מס לפי מדרגות ${result.year}`}
            subtitle="מס הכנסה ליחיד מיגיעה אישית"
          >
            <div className="space-y-1 text-sm">
              {result.bracketBreakdown.length === 0 ? (
                <div className="text-slate-500 italic py-2">אין הכנסה חייבת השנה</div>
              ) : (
                result.bracketBreakdown.map((b, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline justify-between gap-3 py-1 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="inline-block w-12 text-amber-700 font-semibold tabular-nums">
                        {renderPct(b.rate)}
                      </span>
                      <span className="text-slate-600">
                        על {renderCurrency(b.taxableInBracket)}
                        {b.upTo !== Infinity && (
                          <span className="text-[11px] text-slate-400 mr-1">
                            (עד {renderCurrency(b.upTo)})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="tabular-nums font-medium text-slate-800 whitespace-nowrap">
                      {renderCurrency(b.taxInBracket)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-2">
              <StepRow label="סה&quot;כ מס ברוטו" value={result.grossTax} total emphasis="equals" />
            </div>
          </Step>

          {/* STEP 5: Credit points */}
          <Step
            num={5}
            title="ניכוי נקודות זיכוי"
            subtitle={`מינימום: ${MIN_CREDIT_POINTS} נק' (תושב ישראל). לעדכן אם זכאי לנוספות (ילדים/תואר/וכד')`}
          >
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-slate-700">נקודות זיכוי:</label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={creditPoints}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCreditPoints(Number.isFinite(v) && v >= 0 ? v : MIN_CREDIT_POINTS);
                }}
                className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {creditPoints !== MIN_CREDIT_POINTS && (
                <button
                  onClick={() => setCreditPoints(MIN_CREDIT_POINTS)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  איפוס למינימום
                </button>
              )}
            </div>
            <StepRow label="מס ברוטו" value={result.grossTax} />
            <StepRow
              label={`פחות זיכוי נקודות (${creditPoints} × ${CREDIT_POINT_MONTHLY_VALUE} ₪ × 12)`}
              value={annualCreditValue}
              emphasis="sub"
            />
            <StepRow label="מס נטו לשנה" value={result.netTaxOwed} total emphasis="equals" />
          </Step>

          {/* STEP 6: Reconcile against advances */}
          <Step
            num={6}
            title="התחשבנות מול מקדמות מס הכנסה"
            subtitle={`חודשים שטרם הוזנה להם הכנסה ינתחזו ב-${(INCOME_TAX_ADVANCE_RATE * 100).toFixed(0)}% × ההכנסה הצפויה (לפי הכלל האוטומטי במערכת)`}
          >
            <StepRow label="מס נטו לשנה" value={result.netTaxOwed} />
            <StepRow
              label="מקדמות ששולמו בחודשים סגורים"
              value={result.ytdAdvancesPaid}
              hint={
                result.closedMonthsCount > 0
                  ? `${result.closedMonthsCount} חודשים, ממוצע ${renderCurrency(result.currentMonthlyAdvance)}/חודש`
                  : undefined
              }
              emphasis="sub"
            />
            {result.remainingAdvancesForecast > 0 && (
              <StepRow
                label={`תחזית מקדמות לחודשים שנותרו (${(INCOME_TAX_ADVANCE_RATE * 100).toFixed(0)}% × ממוצע הכנסה נטו)`}
                value={result.remainingAdvancesForecast}
                hint={`${result.monthsRemainingForAdvance} חודשים × 14% × ${renderCurrency(result.averageMonthlyIncome)}/חודש`}
                emphasis="sub"
              />
            )}
            <StepRow
              label="סה&quot;כ מקדמות צפויות לשנה"
              value={result.projectedAnnualAdvances}
              bold
            />
            <StepRow
              label={
                balance > 0
                  ? 'יתרה לתשלום בסוף השנה'
                  : balance < 0
                  ? 'החזר מס צפוי'
                  : 'יתרה מאוזנת'
              }
              value={Math.abs(balance)}
              total
              emphasis="equals"
            />
          </Step>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-blue-50/50 border border-blue-100 rounded-xl p-3">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <strong>הערה:</strong> תחזית בלבד, אינה תחליף לרו"ח. אינה כוללת ניכוי הפקדות פנסיה/קה"ש,
              דמי ביטוח לאומי, או הכנסות שלא מופיעות בתזרים. סטייה של 10–15% סבירה. מחושב לפי מדרגות {result.year}.
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaxForecastModal;
