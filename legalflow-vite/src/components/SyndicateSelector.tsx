import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { getLloydsSyndicates, saveLloydsSyndicates, STORAGE_EVENT } from '../services/storageService';

interface SyndicateSelectorProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}

const SyndicateSelector: React.FC<SyndicateSelectorProps> = ({
  value,
  onChange,
  placeholder = 'בחר סינדיקט',
}) => {
  const [options, setOptions] = useState<string[]>(() => getLloydsSyndicates());
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleStorageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === 'lloydsSyndicates') {
        setOptions(getLloydsSyndicates());
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(STORAGE_EVENT, handleStorageUpdate as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(STORAGE_EVENT, handleStorageUpdate as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (name: string) => {
    onChange(name);
    setIsOpen(false);
    setCustomValue('');
  };

  const handleAddCustom = () => {
    const trimmed = customValue.trim();
    if (!trimmed) {
      return;
    }
    setCustomValue('');
    const updated = saveLloydsSyndicates([...options, trimmed]);
    setOptions(updated);
    onChange(trimmed);
    setIsOpen(false);
  };

  return (
    <div className="relative mt-1" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm font-medium text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>
          {value || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="max-h-48 overflow-auto space-y-1">
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => handleSelect(option)}
                className={`w-full rounded-lg px-3 py-2 text-right text-sm transition ${
                  option === value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {option}
              </button>
            ))}
            {options.length === 0 && (
              <p className="py-2 text-center text-xs text-slate-500">
                אין סינדיקטים זמינים
              </p>
            )}
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500">הוספת סינדיקט חדש</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="שם הסינדיקט"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customValue.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <Plus className="w-4 h-4" />
                הוסף
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyndicateSelector;

