import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutDashboard, Wallet, Upload, List, Download, FolderOpen } from 'lucide-react';
import { AppData, BudgetCategory, Page, Transaction } from './types';
import { loadData, saveData, exportData, parseBackup } from './utils/storage';
import { normalizeMerchant } from './utils/bankParsers';
import Dashboard from './components/Dashboard';
import BudgetSetup from './components/BudgetSetup';
import UploadTransactions from './components/UploadTransactions';
import TransactionList from './components/TransactionList';

const NAV_ITEMS: { page: Page; label: string; icon: React.ReactNode }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { page: 'budget', label: 'Budget Setup', icon: <Wallet size={20} /> },
  { page: 'upload', label: 'Upload Transactions', icon: <Upload size={20} /> },
  { page: 'transactions', label: 'Transactions', icon: <List size={20} /> },
];

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackup(await file.text());
      setData(imported);
      setBackupMsg({ ok: true, text: `Imported ${imported.transactions.length} transactions and ${imported.categories.length} categories.` });
    } catch (e) {
      setBackupMsg({ ok: false, text: e instanceof Error ? e.message : 'Import failed.' });
    }
  };

  const updateCategories = useCallback((categories: BudgetCategory[]) => {
    setData(prev => ({ ...prev, categories }));
  }, []);

  const addTransactions = useCallback((transactions: Transaction[]) => {
    setData(prev => {
      const existingIds = new Set(prev.transactions.map(t => `${t.date}|${t.description}|${t.amount}`));
      const newOnes = transactions
        .filter(t => !existingIds.has(`${t.date}|${t.description}|${t.amount}`))
        .map(t => {
          if (t.type === 'income' || t.categoryId) return t;
          const exactKey = t.description.toLowerCase().trim();
          const remembered = prev.categoryMemory[exactKey]
            ?? prev.categoryMemory[normalizeMerchant(t.description)];
          return remembered ? { ...t, categoryId: remembered } : t;
        });
      return { ...prev, transactions: [...prev.transactions, ...newOnes] };
    });
  }, []);

  const updateTransaction = useCallback((id: string, categoryId: string | null) => {
    setData(prev => {
      const tx = prev.transactions.find(t => t.id === id);
      if (!tx) return prev;
      const exactKey = tx.description.toLowerCase().trim();
      const coreKey = normalizeMerchant(tx.description);
      const newMemory = { ...prev.categoryMemory };
      if (categoryId) {
        newMemory[exactKey] = categoryId;
        if (coreKey !== exactKey) newMemory[coreKey] = categoryId;
      } else {
        delete newMemory[exactKey];
        if (coreKey !== exactKey) delete newMemory[coreKey];
      }
      return {
        ...prev,
        transactions: prev.transactions.map(t => t.id === id ? { ...t, categoryId } : t),
        categoryMemory: newMemory,
      };
    });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
    }));
  }, []);

  const deleteTransactions = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => !idSet.has(t.id)),
    }));
  }, []);

  const updateIncome = useCallback((monthlyIncome: number) => {
    setData(prev => ({ ...prev, monthlyIncome }));
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <h1 className="text-white font-bold text-lg tracking-tight">Budget Tracker</h1>
          <p className="text-gray-400 text-xs mt-0.5">Personal Finance</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV_ITEMS.map(({ page: p, label, icon }) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                page === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-700 space-y-1">
          <button
            onClick={() => { exportData(data); setBackupMsg(null); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Download size={16} />
            Export data
          </button>
          <button
            onClick={() => importInput.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <FolderOpen size={16} />
            Import data
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) importBackup(file);
              e.target.value = '';
            }}
          />
          {backupMsg && (
            <p className={`px-3 pt-1 text-xs ${backupMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{backupMsg.text}</p>
          )}
          <p className="px-3 pt-2 text-gray-500 text-xs">Data saved locally on this device</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {page === 'dashboard' && (
          <Dashboard
            categories={data.categories}
            transactions={data.transactions}
            monthlyIncome={data.monthlyIncome}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onIncomeChange={updateIncome}
          />
        )}
        {page === 'budget' && (
          <BudgetSetup
            categories={data.categories}
            onUpdate={updateCategories}
          />
        )}
        {page === 'upload' && (
          <UploadTransactions
            categories={data.categories}
            categoryMemory={data.categoryMemory}
            onAdd={addTransactions}
            onNavigate={setPage}
          />
        )}
        {page === 'transactions' && (
          <TransactionList
            transactions={data.transactions}
            categories={data.categories}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onCategoryChange={updateTransaction}
            onDelete={deleteTransaction}
            onDeleteAll={deleteTransactions}
          />
        )}
      </main>
    </div>
  );
}
