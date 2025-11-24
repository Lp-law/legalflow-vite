import React, { useState } from 'react';
import type {
  Transaction,
  LloydsCollectionItem,
  GenericCollectionItem,
  AccessCollectionItem,
} from '../types';
import { generateExecutiveSummary } from '../services/reportService';
import { exportToCSV } from '../services/exportService';
import { FileText, Copy, Check, Sparkles, Download, PieChart } from 'lucide-react';
import ExecutiveSegmentsPanel from './ExecutiveSegmentsPanel';

interface ExecutiveSummaryProps {
  transactions: Transaction[];
  initialBalance: number;
  lloydsItems: LloydsCollectionItem[];
  genericItems: GenericCollectionItem[];
  accessItems: AccessCollectionItem[];
}

const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  transactions,
  initialBalance,
  lloydsItems,
  genericItems,
  accessItems,
}) => {
  const [reportText, setReportText] = useState<string>('');
  const [currentPeriod, setCurrentPeriod] = useState<'month' | 'quarter' | 'year' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const handleGenerate = (period: 'month' | 'quarter' | 'year') => {
    setCurrentPeriod(period);
    const text = generateExecutiveSummary(period, transactions, initialBalance);
    setReportText(text);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportReport = () => {
    if (!reportText) return;
    const headers = ['סעיף'];
    const rows = reportText
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => [line.trim()]);

    exportToCSV(
      `תקציר_${currentPeriod ?? 'report'}.csv`,
      headers,
      rows
    );
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto text-slate-100">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">תקציר מנהלים</h2>
        <p className="text-slate-300">בחר את טווח הזמן הרצוי לקבלת דוח מילולי מקיף על מצב המשרד</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <button 
          onClick={() => handleGenerate('month')}
          className={`relative overflow-hidden p-8 rounded-3xl border-2 transition-all group ${
            currentPeriod === 'month'
              ? 'border-[var(--law-gold)] bg-white/10 shadow-xl'
              : 'border-white/10 bg-white/5 hover:border-[var(--law-gold)]'
          }`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[var(--law-gold)] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <FileText className={`w-10 h-10 mb-4 ${currentPeriod === 'month' ? 'text-[var(--law-gold)]' : 'text-slate-400 group-hover:text-[var(--law-gold)]'}`} />
          <span className="block text-xl font-bold text-white mb-2">סיכום חודשי</span>
          <span className="text-sm text-slate-300">כתוב לי סיכום מנהלים חודשי</span>
        </button>

        <button 
          onClick={() => handleGenerate('quarter')}
          className={`relative overflow-hidden p-8 rounded-3xl border-2 transition-all group ${
            currentPeriod === 'quarter'
              ? 'border-[var(--law-gold)] bg-white/10 shadow-xl'
              : 'border-white/10 bg-white/5 hover:border-[var(--law-gold)]'
          }`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[var(--law-gold)] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <FileText className={`w-10 h-10 mb-4 ${currentPeriod === 'quarter' ? 'text-[var(--law-gold)]' : 'text-slate-400 group-hover:text-[var(--law-gold)]'}`} />
          <span className="block text-xl font-bold text-white mb-2">סיכום רבעוני</span>
          <span className="text-sm text-slate-300">כתוב לי סיכום מנהלים רבעוני</span>
        </button>

        <button 
          onClick={() => handleGenerate('year')}
          className={`relative overflow-hidden p-8 rounded-3xl border-2 transition-all group ${
            currentPeriod === 'year'
              ? 'border-[var(--law-gold)] bg-white/10 shadow-xl'
              : 'border-white/10 bg-white/5 hover:border-[var(--law-gold)]'
          }`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[var(--law-gold)] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <Sparkles className={`w-10 h-10 mb-4 ${currentPeriod === 'year' ? 'text-[var(--law-gold)]' : 'text-slate-400 group-hover:text-[var(--law-gold)]'}`} />
          <span className="block text-xl font-bold text-white mb-2">סיכום שנתי</span>
          <span className="text-sm text-slate-300">כתוב לי סיכום מנהלים שנתי</span>
        </button>

        <button
          onClick={() => setShowSegments(true)}
          className="relative overflow-hidden p-8 rounded-3xl border-2 transition-all group border-white/10 bg-white/5 hover:border-[var(--law-gold)] hover:shadow-xl"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[var(--law-gold)] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <PieChart className="w-10 h-10 mb-4 text-slate-400 group-hover:text-[var(--law-gold)]" />
          <span className="block text-xl font-bold text-white mb-2">פילוחים</span>
          <span className="text-sm text-slate-300">
            בדיקת מצב מעקבי הגבייה לפי טווחי זמן וחובות פתוחים
          </span>
        </button>
      </div>

      {showSegments && (
        <ExecutiveSegmentsPanel
          lloyds={lloydsItems}
          generic={genericItems}
          access={accessItems}
          onClose={() => setShowSegments(false)}
        />
      )}

      {reportText && (
        <div className="bg-white/5 rounded-3xl border border-white/10 shadow-xl overflow-hidden animate-fade-in-up">
          <div className="bg-[#050b18]/80 px-6 py-3 flex justify-between items-center text-white border-b border-white/10">
            <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
                <span className="text-sm font-bold tracking-wider">דוח נוצר בהצלחה</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors border border-white/10"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'הועתק ללוח' : 'העתק טקסט'}
              </button>
              <button 
                onClick={handleExportReport}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-l from-[#d4af37] to-[#b37a12] text-xs font-semibold text-slate-900 transition-colors"
              >
                <Download className="w-3 h-3" />
                ייצוא אקסל
              </button>
            </div>
          </div>
          <div className="p-8 bg-[#0b1426]/70">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
                <pre className="whitespace-pre-wrap font-sans text-base text-slate-100 leading-loose">
                {reportText}
                </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveSummary;