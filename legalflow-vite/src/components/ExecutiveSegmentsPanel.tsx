import React, { useMemo, useState } from 'react';
import type {
  LloydsCollectionItem,
  GenericCollectionItem,
  AccessCollectionItem,
} from '../types';
import { parseDateKey } from '../utils/date';

type SourceKey = 'lloyds' | 'generic' | 'access';

interface ExecutiveSegmentsPanelProps {
  lloyds: LloydsCollectionItem[];
  generic: GenericCollectionItem[];
  access: AccessCollectionItem[];
  onClose: () => void;
}

type StatusFilter = 'open' | 'paid' | 'all';
type DaysOperator = '>' | '>=' | '=';

interface FilteredRow {
  id: string;
  source: SourceKey;
  accountNumber: string;
  name: string;
  amount: number;
  demandDate: string | null;
  isPaid: boolean;
  overdueDays: number | null;
}

const SOURCE_META: Record<
  SourceKey,
  { label: string; accent: string; description: string }
> = {
  lloyds: {
    label: 'מעקב גבייה – לוידס',
    accent: 'border-blue-200 bg-blue-50',
    description: 'חובות מול לוידס',
  },
  generic: {
    label: 'מעקב גבייה – לקוחות שונים',
    accent: 'border-emerald-200 bg-emerald-50',
    description: 'לקוחות פרטיים',
  },
  access: {
    label: 'מעקב גבייה – אקסס',
    accent: 'border-amber-200 bg-amber-50',
    description: 'השתתפויות עצמאיות',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatCurrency = (value: number) =>
  `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

const formatDateDisplay = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('he-IL') : '—';

const DEFAULT_THRESHOLD = 45;

const ExecutiveSegmentsPanel: React.FC<ExecutiveSegmentsPanelProps> = ({
  lloyds,
  generic,
  access,
  onClose,
}) => {
  const [selectedSources, setSelectedSources] = useState<Record<SourceKey, boolean>>({
    lloyds: true,
    generic: true,
    access: true,
  });
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [daysOperator, setDaysOperator] = useState<DaysOperator>('>');
  const [daysValue, setDaysValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  const baseRows = useMemo<FilteredRow[]>(() => {
    const today = new Date();

    const mapRows = <T,>(
      items: T[],
      source: SourceKey,
      getName: (item: T) => string
    ): FilteredRow[] =>
      items.map(item => {
        const typed = item as LloydsCollectionItem &
          GenericCollectionItem &
          AccessCollectionItem;
        const demandDate = typed.demandDate ?? null;
        const demandDateObj = demandDate ? parseDateKey(demandDate) : null;
        const overdue =
          demandDateObj && !Number.isNaN(demandDateObj.getTime())
            ? Math.max(
                0,
                Math.floor((today.getTime() - demandDateObj.getTime()) / DAY_MS)
              )
            : null;
        return {
          id: typed.id,
          source,
          accountNumber: typed.accountNumber,
          name: getName(item),
          amount: typed.amount,
          demandDate,
          isPaid: Boolean(typed.isPaid),
          overdueDays: overdue,
        };
      });

    return [
      ...mapRows(lloyds, 'lloyds', item => item.claimantName || item.insuredName || 'ללא שם'),
      ...mapRows(generic, 'generic', item => item.clientName || item.caseName || 'ללא שם'),
      ...mapRows(access, 'access', item => item.insuredName || item.caseName || 'ללא שם'),
    ];
  }, [lloyds, generic, access]);

  const filteredRows = useMemo(() => {
    const fromDate = dateRange.from ? parseDateKey(dateRange.from) : null;
    const toDate = dateRange.to ? parseDateKey(dateRange.to) : null;
    const hasDaysFilter = daysValue.trim().length > 0 && !Number.isNaN(Number(daysValue));
    const numericDays = hasDaysFilter ? Number(daysValue) : null;

    return baseRows.filter(row => {
      if (!selectedSources[row.source]) {
        return false;
      }

      if (statusFilter === 'open' && row.isPaid) {
        return false;
      }
      if (statusFilter === 'paid' && !row.isPaid) {
        return false;
      }

      if (fromDate) {
        if (!row.demandDate) return false;
        const demand = parseDateKey(row.demandDate);
        if (demand < fromDate) return false;
      }

      if (toDate) {
        if (!row.demandDate) return false;
        const demand = parseDateKey(row.demandDate);
        if (demand > toDate) return false;
      }

      if (hasDaysFilter && numericDays !== null) {
        // Days filter applies only to unpaid/open rows per requirements
        if (row.isPaid) return false;
        if (row.overdueDays === null) return false;
        if (daysOperator === '>' && !(row.overdueDays > numericDays)) return false;
        if (daysOperator === '>=' && !(row.overdueDays >= numericDays)) return false;
        if (daysOperator === '=' && row.overdueDays !== numericDays) return false;
      }

      return true;
    });
  }, [baseRows, selectedSources, dateRange, daysOperator, daysValue, statusFilter]);

  const metrics = useMemo(() => {
    const perSource: Record<
      SourceKey,
      { total: number; count: number; overdueSum: number; overdueCount: number }
    > = {
      lloyds: { total: 0, count: 0, overdueSum: 0, overdueCount: 0 },
      generic: { total: 0, count: 0, overdueSum: 0, overdueCount: 0 },
      access: { total: 0, count: 0, overdueSum: 0, overdueCount: 0 },
    };

    filteredRows.forEach(row => {
      if (!perSource[row.source]) return;
      if (!row.isPaid) {
        perSource[row.source].total += row.amount;
        perSource[row.source].count += 1;
      }
      if (!row.isPaid && row.overdueDays !== null) {
        perSource[row.source].overdueSum += row.overdueDays;
        perSource[row.source].overdueCount += 1;
      }
    });

    const allOpen = filteredRows.filter(row => !row.isPaid);
    const combinedTotal = allOpen.reduce((sum, row) => sum + row.amount, 0);
    const combinedCount = allOpen.length;

    let threshold = DEFAULT_THRESHOLD;
    let showThresholdLabel = false;
    if (daysValue && (daysOperator === '>' || daysOperator === '>=')) {
      const numeric = Number(daysValue);
      if (!Number.isNaN(numeric)) {
        threshold = numeric;
        showThresholdLabel = true;
      }
    }

    const overdueAboveThreshold = allOpen.filter(row => {
      if (row.overdueDays === null) return false;
      if (showThresholdLabel) {
        return daysOperator === '>' ? row.overdueDays > threshold : row.overdueDays >= threshold;
      }
      return row.overdueDays > threshold;
    });

    return {
      perSource,
      combinedTotal,
      combinedCount,
      threshold,
      thresholdCount: overdueAboveThreshold.length,
      thresholdLabelType: showThresholdLabel ? daysOperator : null,
    };
  }, [filteredRows, daysOperator, daysValue]);

  const tableRows = useMemo(() => filteredRows.slice(0, 100), [filteredRows]);

  const toggleSource = (key: SourceKey) => {
    setSelectedSources(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetFilters = () => {
    setSelectedSources({ lloyds: true, generic: true, access: true });
    setDateRange({ from: '', to: '' });
    setDaysOperator('>');
    setDaysValue('');
    setStatusFilter('open');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            פילוחים
          </h3>
          <p className="text-sm text-slate-500">
            בדיקת מצב מעקבי הגבייה לפי טווחי זמן וחובות פתוחים
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={resetFilters}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            אפס מסננים
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            חזרה לכרטיסים
          </button>
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">מקורות גבייה</p>
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              {(Object.keys(SOURCE_META) as SourceKey[]).map(key => (
                <label key={key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSources[key]}
                    onChange={() => toggleSource(key)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  {SOURCE_META[key].label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">טווח תאריכים לדרישה</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-slate-500">מ־</label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-slate-500">עד</label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">סינון לפי ימי פיגור</p>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-[11px] text-slate-500">אופרטור</label>
                <select
                  value={daysOperator}
                  onChange={e => setDaysOperator(e.target.value as DaysOperator)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value=">">&gt;</option>
                  <option value=">=">&ge;</option>
                  <option value="=">=</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-slate-500">מספר ימים</label>
                <input
                  type="number"
                  min="0"
                  value={daysValue}
                  onChange={e => setDaysValue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="לדוגמה 45"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              הסינון חל רק על דרישות פתוחות
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">סטטוס תשלום</p>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="open">פתוח</option>
              <option value="paid">סגור</option>
              <option value="all">הכל</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(SOURCE_META) as SourceKey[])
          .filter(key => selectedSources[key])
          .map(key => {
            const meta = SOURCE_META[key];
            const data = metrics.perSource[key];
            const avg =
              data.overdueCount > 0
                ? Math.round(data.overdueSum / data.overdueCount)
                : null;

            return (
              <div
                key={key}
                className={`rounded-2xl border ${meta.accent} p-4 flex flex-col gap-2`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-600">{meta.label}</p>
                  <span className="text-[11px] text-slate-400">{meta.description}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(data.total)}
                </div>
                <div className="text-xs text-slate-500 flex justify-between">
                  <span>מספר דרישות פתוחות</span>
                  <span className="font-semibold text-slate-700">{data.count}</span>
                </div>
                <div className="text-xs text-slate-500 flex justify-between">
                  <span>ממוצע ימי פיגור</span>
                  <span className="font-semibold text-slate-700">
                    {avg !== null ? `${avg} ימים` : '—'}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white p-6">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>סה"כ חוב פתוח (כל המקורות)</span>
            <span className="font-semibold">{formatCurrency(metrics.combinedTotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-white/80">
            <span>מספר דרישות פתוחות</span>
            <span className="font-semibold">{metrics.combinedCount}</span>
          </div>
          <div className="flex justify-between text-sm text-white/80">
            <span>
              {`סה"כ חובות מעל ${
                metrics.thresholdLabelType ? `${metrics.thresholdLabelType} ` : '> '
              }${metrics.threshold} ימים`}
            </span>
            <span className="font-semibold">{metrics.thresholdCount}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h4 className="text-sm font-semibold text-slate-700">דרישות תואמות</h4>
          <span className="text-xs text-slate-400">
            מציג עד 100 רשומות ({filteredRows.length} נמצאו)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 hidden md:table-cell w-12">#</th>
                <th className="px-4 py-3 font-semibold">מקור</th>
                <th className="px-4 py-3 font-semibold">מספר חשבון עסקה</th>
                <th className="px-4 py-3 font-semibold">שם</th>
                <th className="px-4 py-3 font-semibold">מועד דרישה</th>
                <th className="px-4 py-3 font-semibold">סכום</th>
                <th className="px-4 py-3 font-semibold">ימי פיגור</th>
                <th className="px-4 py-3 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500 text-sm">
                    אין רשומות התואמות למסננים הנוכחיים.
                  </td>
                </tr>
              )}
              {tableRows.map((row, index) => (
                <tr
                  key={`${row.source}-${row.id}`}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-[#f8f8f8]'} hover:bg-[#eef5ff] transition-colors`}
                >
                  <td className="px-3 py-3 text-xs text-slate-500 hidden md:table-cell">{index + 1}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs font-semibold">
                    {SOURCE_META[row.source].label}
                  </td>
                  <td className="px-4 py-3 font-semibold">{row.accountNumber || '—'}</td>
                  <td className="px-4 py-3">{row.name || '—'}</td>
                  <td className="px-4 py-3">{formatDateDisplay(row.demandDate)}</td>
                  <td className="px-4 py-3">{formatCurrency(row.amount)}</td>
                  <td className="px-4 py-3">{row.overdueDays !== null ? row.overdueDays : '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        row.isPaid
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {row.isPaid ? 'שולם' : 'פתוח'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveSegmentsPanel;

