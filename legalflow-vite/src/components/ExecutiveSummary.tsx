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
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-800">תקציר מנהלים</h2>
        <p className="text-slate-500">בחר את טווח הזמן הרצוי לקבלת דוח מילולי מקיף על מצב המשרד</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <button 
          onClick={() => handleGenerate('month')}
          className={`relative overflow-hidden p-8 rounded-2xl border-2 transition-all group ${currentPeriod === 'month' ? 'border-blue-600 bg-blue-50 shadow-lg' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md'}`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <FileText className={`w-10 h-10 mb-4 ${currentPeriod === 'month' ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
          <span className="block text-xl font-bold text-slate-800 mb-2">סיכום חודשי</span>
          <span className="text-sm text-slate-500">כתוב לי סיכום מנהלים חודשי</span>
        </button>

        <button 
          onClick={() => handleGenerate('quarter')}
          className={`relative overflow-hidden p-8 rounded-2xl border-2 transition-all group ${currentPeriod === 'quarter' ? 'border-blue-600 bg-blue-50 shadow-lg' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md'}`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <FileText className={`w-10 h-10 mb-4 ${currentPeriod === 'quarter' ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
          <span className="block text-xl font-bold text-slate-800 mb-2">סיכום רבעוני</span>
          <span className="text-sm text-slate-500">כתוב לי סיכום מנהלים רבעוני</span>
        </button>

        <button 
          onClick={() => handleGenerate('year')}
          className={`relative overflow-hidden p-8 rounded-2xl border-2 transition-all group ${currentPeriod === 'year' ? 'border-blue-600 bg-blue-50 shadow-lg' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md'}`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <Sparkles className={`w-10 h-10 mb-4 ${currentPeriod === 'year' ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
          <span className="block text-xl font-bold text-slate-800 mb-2">סיכום שנתי</span>
          <span className="text-sm text-slate-500">כתוב לי סיכום מנהלים שנתי</span>
        </button>

        <button
          onClick={() => setShowSegments(true)}
          className="relative overflow-hidden p-8 rounded-2xl border-2 transition-all group border-slate-200 bg-white hover:border-blue-400 hover:shadow-md"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          <PieChart className="w-10 h-10 mb-4 text-slate-400 group-hover:text-blue-500" />
          <span className="block text-xl font-bold text-slate-800 mb-2">פילוחים</span>
          <span className="text-sm text-slate-500">
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in-up">
          <div className="bg-slate-900 px-6 py-3 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
                <span className="text-sm font-bold tracking-wider">דוח נוצר בהצלחה</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium transition-colors border border-slate-700"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'הועתק ללוח' : 'העתק טקסט'}
              </button>
              <button 
                onClick={handleExportReport}
                className="flex items-center gap-2 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors border border-white/20"
              >
                <Download className="w-3 h-3" />
                ייצוא אקסל
              </button>
            </div>
          </div>
          <div className="p-8 bg-slate-50">
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <pre className="whitespace-pre-wrap font-sans text-base text-slate-800 leading-loose">
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