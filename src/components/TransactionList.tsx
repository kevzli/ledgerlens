import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Search, Filter } from 'lucide-react';
import { BudgetCategory, Transaction } from '../types';

interface Props {
  transactions: Transaction[];
  categories: BudgetCategory[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onDelete: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function stepMonth(ym: string, dir: 1 | -1): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function TransactionList({ transactions, categories, selectedMonth, onMonthChange, onCategoryChange, onDelete, onDeleteAll }: Props) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');

  const monthTransactions = useMemo(() =>
    transactions.filter(t => t.date.startsWith(selectedMonth)),
    [transactions, selectedMonth]
  );

  const filtered = useMemo(() => {
    let list = monthTransactions;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.description.toLowerCase().includes(q) || t.bank.toLowerCase().includes(q));
    }
    if (filterCat === 'uncategorized') {
      list = list.filter(t => t.type === 'expense' && !t.categoryId);
    } else if (filterCat === 'income') {
      list = list.filter(t => t.type === 'income');
    } else if (filterCat !== 'all') {
      list = list.filter(t => t.categoryId === filterCat);
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [monthTransactions, search, filterCat]);

  const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalCredits = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const summaryText = () => {
    const parts: string[] = [];
    if (totalExpenses > 0) parts.push(`$${totalExpenses.toFixed(2)} spent`);
    if (totalCredits > 0) parts.push(`+$${totalCredits.toFixed(2)} income`);
    return `${filtered.length} transactions · ${parts.join(' · ')}`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
          <p className="text-gray-500 text-sm mt-0.5">{summaryText()}</p>
        </div>
        <div className="flex items-center gap-3">
          {monthTransactions.length > 0 && (
            <button
              onClick={() => {
                {
                  onDeleteAll(monthTransactions.map(t => t.id));
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              Delete {monthLabel(selectedMonth)}
            </button>
          )}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <button onClick={() => onMonthChange(stepMonth(selectedMonth, -1))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">{monthLabel(selectedMonth)}</span>
            <button onClick={() => onMonthChange(stepMonth(selectedMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none"
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
          >
            <option value="all">All</option>
            <option value="income">Income</option>
            <option value="uncategorized">Uncategorized</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center text-gray-400">
          <p className="text-sm">No transactions found for {monthLabel(selectedMonth)}.</p>
          <p className="text-xs mt-1">Upload your bank statements to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => {
                  const cat = categories.find(c => c.id === t.categoryId);
                  const isIncome = t.type === 'income';
                  return (
                    <tr key={t.id} className={`transition-colors ${isIncome ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">{t.date}</td>
                      <td className="px-5 py-3 font-medium">
                        <span className={`break-words ${isIncome ? 'text-emerald-700' : 'text-gray-800'}`}>{t.description}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap text-xs">{t.bank}</td>
                      <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">
                        {isIncome
                          ? <span className="text-emerald-600">+${t.amount.toFixed(2)}</span>
                          : <span className="text-gray-800">${t.amount.toFixed(2)}</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        {isIncome ? (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Income</span>
                        ) : (
                          <>
                            <select
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-[160px]"
                              value={t.categoryId ?? ''}
                              onChange={e => onCategoryChange(t.id, e.target.value || null)}
                            >
                              <option value="">Uncategorized</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            {cat && (
                              <span
                                className="inline-block ml-2 w-2 h-2 rounded-full align-middle"
                                style={{ backgroundColor: cat.color }}
                              />
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => onDelete(t.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
