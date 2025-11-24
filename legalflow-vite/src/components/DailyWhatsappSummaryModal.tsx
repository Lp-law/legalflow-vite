import React, { useEffect, useState } from 'react';
import { X, Copy } from 'lucide-react';

interface DailyWhatsappSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryText: string;
}

const DailyWhatsappSummaryModal: React.FC<DailyWhatsappSummaryModalProps> = ({
  isOpen,
  onClose,
  summaryText,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setCopyStatus('idle');
  }, [summaryText, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyStatus('success');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } catch (error) {
      console.error('clipboard copy failed', error);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay">
      <div className="bg-[#0b1426] text-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl border border-white/10 modal-content">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-xl font-bold">תקציר מנהלים יומי ל-WhatsApp</h3>
            <p className="text-xs text-slate-400 mt-1">
              העתק את הטקסט ושלח ידנית ב-WhatsApp לליאור / לידור.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="סגור מודל"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <textarea
            readOnly
            value={summaryText}
            className="w-full h-72 bg-black/20 border border-white/10 rounded-2xl p-4 text-sm leading-relaxed font-mono resize-none outline-none"
          />
          <p className="text-[11px] text-slate-400">
            הטקסט לא נשלח אוטומטית. ניתן להעתיק ולהדביק ידנית בשיחת WhatsApp הרצויה.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-white/10 px-6 py-4">
          <div className="text-xs text-slate-400 h-5">
            {copyStatus === 'success' && <span className="text-emerald-300">הטקסט הועתק ✅</span>}
            {copyStatus === 'error' && (
              <span className="text-rose-300">העתקה נכשלה. אנא נסה שוב או העתק ידנית.</span>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#25d366] text-slate-900 font-semibold hover:brightness-110 transition-colors"
            >
              <Copy className="w-4 h-4" />
              העתק טקסט
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-full border border-white/20 text-sm text-white hover:bg-white/10 transition-colors"
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyWhatsappSummaryModal;


