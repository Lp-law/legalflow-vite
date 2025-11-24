import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { getClients, saveClient, STORAGE_EVENT } from '../services/storageService';

interface ClientSelectorProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}

const ClientSelector: React.FC<ClientSelectorProps> = ({
  value,
  onChange,
  placeholder = 'בחר לקוח',
}) => {
  const [clients, setClients] = useState<string[]>(() => getClients());
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleStorageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === 'clients') {
        setClients(getClients());
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
      setIsAddingNew(false);
      setNewClientName('');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsAddingNew(false);
        setNewClientName('');
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
    setIsAddingNew(false);
    setNewClientName('');
  };

  const handleSaveClient = () => {
    const trimmed = newClientName.trim();
    if (!trimmed) {
      return;
    }
    saveClient(trimmed);
    setClients(getClients());
    onChange(trimmed);
    setIsAddingNew(false);
    setNewClientName('');
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
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-xl space-y-3">
          {!isAddingNew && (
            <>
              <div className="max-h-48 overflow-auto space-y-1">
                {clients.map(client => (
                  <button
                    key={client}
                    type="button"
                    onClick={() => handleSelect(client)}
                    className={`w-full rounded-lg px-3 py-2 text-right text-sm transition ${
                      client === value
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {client}
                  </button>
                ))}
                {clients.length === 0 && (
                  <p className="py-2 text-center text-xs text-slate-500">
                    אין לקוחות זמינים
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
              >
                <Plus className="w-4 h-4" />
                הוסף לקוח חדש
              </button>
            </>
          )}

          {isAddingNew && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  שם הלקוח החדש
                </label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="שם הלקוח"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setNewClientName('');
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={!newClientName.trim()}
                  onClick={handleSaveClient}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  שמור
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientSelector;

