import React, { useMemo, useState, useEffect } from 'react';
import { X, Calendar, Stethoscope, Scale, ArrowRight } from 'lucide-react';
import type { Transaction } from '../types';
import { formatDateKey, parseDateKey } from '../utils/date';
import {
  getUserMedicalTokens,
  addUserMedicalToken,
  removeUserMedicalToken,
  STORAGE_EVENT,
} from '../services/storageService';

// Hardcoded medical-negligence client tokens. Any fee transaction whose
// description contains any of these (case-insensitive, ignoring punctuation
// and whitespace) is classified to the medical-negligence department.
const MEDICAL_NEGLIGENCE_TOKENS: string[] = [
  'לוידס', 'lloyds', 'loyds',
  'מ.א.ר', 'מאר',
  'מד"א', 'מדא', 'mda',
  'טרם ריטיינר', 'terem retainer',
  'שירותי בריאות כללית', 'clalit', 'כללית',
  'טרם חשבונות השלמת שכט', 'השלמת שכט',
  'ניו תדהר', 'new tidhar',
  'עמנואל אלייאב', 'אלייאב',
  'מרון בחות', 'מארון בחות',
  'מדנס',
  'איגור נמירובסקי', 'נמירובסקי',
  'אמל נגם',
  'אנגלברג סימונה', 'אנגלברג',
  'ילנה סקליארוק', 'סקליארוק',
  'ד"ר שבי מזור', 'שבי מזור',
  'נידאל יאסין',
  'נדים יוסף',
  'אדנטיקה',
  'איגור חייקין', 'חייקין',
  'שיפי גיטר',
  'שכ"ט פקדונות', 'שכט פקדונות', 'פקדונות',
  'ריטיינר לאון', 'לאון',
];

type Department = 'medical' | 'civil';

interface DepartmentBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
}

const normalize = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .replace(/[\s"'\-_.]/g, '');

const DepartmentBreakdownModal: React.FC<DepartmentBreakdownModalProps> = ({
  isOpen,
  onClose,
  transactions,
}) => {
  const today = new Date();
  const defaultStart = formatDateKey(new Date(today.getFullYear(), 0, 1));
  const defaultEnd = formatDateKey(today);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [userTokens, setUserTokens] = useState<string[]>(() => getUserMedicalTokens());

  useEffect(() => {
    const handler = () => setUserTokens(getUserMedicalTokens());
    window.addEventListener(STORAGE_EVENT, handler);
    return () => window.removeEventListener(STORAGE_EVENT, handler);
  }, []);

  const allMedicalTokensNormalized = useMemo(
    () => [...MEDICAL_NEGLIGENCE_TOKENS, ...userTokens].map(normalize).filter(Boolean),
    [userTokens]
  );

  const userTokensNormalized = useMemo(
    () => userTokens.map(normalize).filter(Boolean),
    [userTokens]
  );

  const classify = (description: string | undefined, clientReference?: string): Department => {
    const haystack = `${normalize(description)} ${normalize(clientReference)}`;
    return allMedicalTokensNormalized.some(token => haystack.includes(token))
      ? 'medical'
      : 'civil';
  };

  const wasClassifiedByUserToken = (description: string | undefined, clientReference?: string): boolean => {
    if (userTokensNormalized.length === 0) return false;
    const haystack = `${normalize(description)} ${normalize(clientReference)}`;
    // Hardcoded match wins; only if NO hardcoded matches AND a user token matches do we say it's a user-classified one.
    const hardcodedMatches = MEDICAL_NEGLIGENCE_TOKENS.map(normalize).some(token => haystack.includes(token));
    if (hardcodedMatches) return false;
    return userTokensNormalized.some(token => haystack.includes(token));
  };

  const summary = useMemo(() => {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    end.setHours(23, 59, 59, 999);

    const medical: Transaction[] = [];
    const civil: Transaction[] = [];

    transactions
      .filter(t => t.group === 'fee' && t.type === 'income')
      .forEach(transaction => {
        const date = parseDateKey(transaction.date);
        if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) return;
        const dept = classify(transaction.description, transaction.clientReference);
        if (dept === 'medical') medical.push(transaction);
        else civil.push(transaction);
      });

    const sumGross = (list: Transaction[]) => list.reduce((s, t) => s + t.amount, 0);
    const medicalGross = sumGross(medical);
    const civilGross = sumGross(civil);

    return {
      medical: {
        transactions: medical,
        gross: medicalGross,
        net: medicalGross / 1.18,
        count: medical.length,
      },
      civil: {
        transactions: civil,
        gross: civilGross,
        net: civilGross / 1.18,
        count: civil.length,
      },
      totalGross: medicalGross + civilGross,
    };
  }, [transactions, startDate, endDate, allMedicalTokensNormalized]);

  if (!isOpen) return null;

  const handlePromoteToMedical = (description: string | undefined) => {
    if (!description || !description.trim()) return;
    addUserMedicalToken(description.trim());
    setUserTokens(getUserMedicalTokens());
  };

  const handleDemoteToCivil = (description: string | undefined) => {
    if (!description || !description.trim()) return;
    removeUserMedicalToken(description.trim());
    setUserTokens(getUserMedicalTokens());
  };

  const renderCurrency = (value: number) =>
    `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">פילוח שכר טרחה לפי מחלקה</h2>
            <p className="text-sm text-slate-500 mt-1">
              חלוקת ההכנסות בין מחלקת רשלנות רפואית למחלקת ליטיגציה אזרחית מסחרית. ניתן להוסיף לקוחות חדשים למחלקת רשלנות רפואית בלחיצה על הכפתור הצמוד לתנועה.
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

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm">
              <Calendar className="w-4 h-4 text-blue-600" />
              בחר טווח תאריכים
            </div>
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <label className="text-xs font-medium text-slate-500 flex flex-col">
                מתאריך
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </label>
              <label className="text-xs font-medium text-slate-500 flex flex-col">
                עד תאריך
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="p-6 border-b border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5" />
                  מחלקת רשלנות רפואית
                </h3>
                <span className="text-xs font-semibold bg-white/70 text-emerald-700 px-2 py-1 rounded-full">
                  {summary.medical.count} תנועות
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-emerald-700">ברוטו (כולל מע"מ)</p>
                <p className="text-3xl font-bold text-emerald-900">{renderCurrency(summary.medical.gross)}</p>
                <p className="text-xs text-emerald-700 mt-3">נטו (לפני מע"מ)</p>
                <p className="text-xl font-semibold text-emerald-800">{renderCurrency(summary.medical.net)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                  <Scale className="w-5 h-5" />
                  מחלקת ליטיגציה אזרחית מסחרית
                </h3>
                <span className="text-xs font-semibold bg-white/70 text-blue-700 px-2 py-1 rounded-full">
                  {summary.civil.count} תנועות
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-blue-700">ברוטו (כולל מע"מ)</p>
                <p className="text-3xl font-bold text-blue-900">{renderCurrency(summary.civil.gross)}</p>
                <p className="text-xs text-blue-700 mt-3">נטו (לפני מע"מ)</p>
                <p className="text-xl font-semibold text-blue-800">{renderCurrency(summary.civil.net)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction lists */}
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
          {/* Medical list */}
          <div className="p-6 space-y-3">
            <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
              <Stethoscope className="w-4 h-4" />
              תנועות במחלקת רשלנות רפואית
            </h4>
            {summary.medical.transactions.length === 0 ? (
              <p className="text-sm text-slate-400">אין תנועות בקבוצה זו בתקופה הנבחרת.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-right px-4 py-2 font-medium">תאריך</th>
                      <th className="text-right px-4 py-2 font-medium">תיאור</th>
                      <th className="text-right px-4 py-2 font-medium">סכום (ברוטו)</th>
                      <th className="text-right px-4 py-2 font-medium">פעולה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.medical.transactions.map(t => {
                      const isUserToken = wasClassifiedByUserToken(t.description, t.clientReference);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">
                            {parseDateKey(t.date).toLocaleDateString('he-IL')}
                          </td>
                          <td className="px-4 py-2 text-slate-700 font-medium">{t.description || 'ללא תיאור'}</td>
                          <td className="px-4 py-2 font-bold text-emerald-700">{renderCurrency(t.amount)}</td>
                          <td className="px-4 py-2">
                            {isUserToken ? (
                              <button
                                type="button"
                                onClick={() => handleDemoteToCivil(t.description)}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                                title="הסר את התיאור הזה מרשימת רשלנות רפואית"
                              >
                                <ArrowRight className="w-3 h-3" />
                                החזר לליטיגציה
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">קבוע</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Civil list with promote buttons */}
          <div className="p-6 space-y-3">
            <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              תנועות במחלקת ליטיגציה אזרחית מסחרית
            </h4>
            {summary.civil.transactions.length === 0 ? (
              <p className="text-sm text-slate-400">אין תנועות בקבוצה זו בתקופה הנבחרת.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-right px-4 py-2 font-medium">תאריך</th>
                      <th className="text-right px-4 py-2 font-medium">תיאור</th>
                      <th className="text-right px-4 py-2 font-medium">סכום (ברוטו)</th>
                      <th className="text-right px-4 py-2 font-medium">פעולה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.civil.transactions.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">
                          {parseDateKey(t.date).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-4 py-2 text-slate-700 font-medium">{t.description || 'ללא תיאור'}</td>
                        <td className="px-4 py-2 font-bold text-blue-700">{renderCurrency(t.amount)}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => handlePromoteToMedical(t.description)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                            title="העבר את התיאור הזה למחלקת רשלנות רפואית (תקף גם לתנועות עתידיות עם אותו תיאור)"
                          >
                            <Stethoscope className="w-3 h-3" />
                            העבר לרשלנות רפואית
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/60">
          <div className="text-slate-600 text-sm">
            סך הכנסות שכר טרחה בתקופה: <span className="font-bold text-slate-900">{renderCurrency(summary.totalGross)}</span> (ברוטו)
          </div>
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

export default DepartmentBreakdownModal;
