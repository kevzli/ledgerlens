import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Upload, CheckCircle, AlertCircle, X, ChevronRight, FileText, Image, CreditCard, Building2, PlusCircle } from 'lucide-react';
import { BudgetCategory, Page, Transaction } from '../types';
import { parseCSV, autoCategorize, normalizeMerchant, AccountType } from '../utils/bankParsers';
import { parsePDF } from '../utils/pdfParsers';
import { parseImage } from '../utils/imageParsers';
import { parseAmexXLSX } from '../utils/xlsxParsers';

interface Props {
  categories: BudgetCategory[];
  categoryMemory: Record<string, string>;
  onAdd: (transactions: Transaction[]) => void;
  onNavigate: (page: Page) => void;
}

interface ParseResult {
  transactions: Transaction[];
  bank: string;
  fileName: string;
  accountType: AccountType;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

const today = () => new Date().toISOString().split('T')[0];

interface ManualForm {
  date: string;
  description: string;
  amount: string;
  type: 'expense' | 'income';
  categoryId: string;
}

export default function UploadTransactions({ categories, categoryMemory, onAdd, onNavigate }: Props) {
  const [results, setResults] = useState<ParseResult[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<AccountType | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ file: string; pct: number } | null>(null);
  const creditInputRef = useRef<HTMLInputElement>(null);
  const debitInputRef = useRef<HTMLInputElement>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualAdded, setManualAdded] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>({
    date: today(), description: '', amount: '', type: 'expense', categoryId: '',
  });
  const [manualError, setManualError] = useState('');

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.date) return setManualError('Please enter a date.');
    if (!manualForm.description.trim()) return setManualError('Please enter a description.');
    if (isNaN(amt) || amt <= 0) return setManualError('Please enter a valid amount greater than 0.');
    setManualError('');
    const tx: Transaction = {
      id: uuidv4(),
      date: manualForm.date,
      description: manualForm.description.trim(),
      amount: amt,
      type: manualForm.type,
      categoryId: manualForm.type === 'expense' && manualForm.categoryId ? manualForm.categoryId : null,
      bank: 'Manual',
    };
    onAdd([tx]);
    setManualAdded(true);
    setManualForm({ date: today(), description: '', amount: '', type: 'expense', categoryId: '' });
    setTimeout(() => setManualAdded(false), 3000);
  };

  const processFiles = async (files: FileList | null, accountType: AccountType) => {
    if (!files || files.length === 0) return;
    setError('');
    setConfirmed(false);
    const newResults: ParseResult[] = [];

    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      const isPdf = name.endsWith('.pdf');
      const isCsv = name.endsWith('.csv');
      const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');
      const isImage = IMAGE_EXTS.some(ext => name.endsWith(ext));

      if (!isPdf && !isCsv && !isXlsx && !isImage) {
        setError(`"${file.name}" is not a supported file. Please upload a PDF, CSV, XLSX, or PNG/JPG screenshot.`);
        continue;
      }

      try {
        let transactions, bank;
        let xlsxCategoryHints: Record<string, string> = {};
        if (isImage) {
          setOcrProgress({ file: file.name, pct: 0 });
          ({ transactions, bank } = await parseImage(file, pct => setOcrProgress({ file: file.name, pct })));
          setOcrProgress(null);
        } else if (isPdf) {
          ({ transactions, bank } = await parsePDF(file, accountType));
        } else if (isXlsx) {
          const xlsxResult = await parseAmexXLSX(file);
          ({ transactions, bank } = xlsxResult);
          xlsxCategoryHints = xlsxResult.categoryHints;
        } else {
          const text = await file.text();
          ({ transactions, bank } = parseCSV(text, accountType));
        }
        const categorized = autoCategorize(transactions, categories).map(t => {
          if (t.type === 'income' || t.categoryId) return t;
          const remembered = categoryMemory[t.description.toLowerCase().trim()]
            ?? categoryMemory[normalizeMerchant(t.description)];
          if (remembered) return { ...t, categoryId: remembered };
          // Try matching Amex XLSX built-in category to user category names
          const amexCat = xlsxCategoryHints[t.id];
          if (amexCat) {
            const amexLower = amexCat.toLowerCase();
            const matched = categories.find(c =>
              c.name.toLowerCase().split(/\s+/).some(word => word.length > 3 && amexLower.includes(word))
            );
            if (matched) return { ...t, categoryId: matched.id };
          }
          return t;
        });
        newResults.push({ transactions: categorized, bank, fileName: file.name, accountType });
      } catch (e) {
        setOcrProgress(null);
        setError(`Failed to parse "${file.name}": ${(e as Error).message}`);
      }
    }

    if (newResults.length > 0) {
      setResults(prev => [...prev, ...newResults]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent, accountType: AccountType) => {
    e.preventDefault();
    setDragging(null);
    processFiles(e.dataTransfer.files, accountType);
  }, [categories, categoryMemory]);

  const handleConfirm = () => {
    onAdd(results.flatMap(r => r.transactions));
    setConfirmed(true);
    setResults([]);
  };

  const removeResult = (idx: number) => setResults(prev => prev.filter((_, i) => i !== idx));

  const totalTx = results.reduce((s, r) => s + r.transactions.length, 0);
  const autoCat = results.reduce((s, r) => s + r.transactions.filter(t => t.categoryId).length, 0);

  const DropZone = ({ accountType }: { accountType: AccountType }) => {
    const isCredit = accountType === 'credit';
    const inputRef = isCredit ? creditInputRef : debitInputRef;
    const isDragging = dragging === accountType;
    const isProcessing = !!ocrProgress;

    return (
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 mb-3 px-1`}>
          {isCredit
            ? <CreditCard size={16} className="text-indigo-500" />
            : <Building2 size={16} className="text-emerald-600" />
          }
          <span className={`text-sm font-semibold ${isCredit ? 'text-indigo-700' : 'text-emerald-700'}`}>
            {isCredit ? 'Credit Card' : 'Checking / Debit'}
          </span>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(accountType); }}
          onDragLeave={() => setDragging(null)}
          onDrop={e => handleDrop(e, accountType)}
          onClick={() => !isProcessing && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
            isProcessing ? 'cursor-wait opacity-60 border-gray-200 bg-gray-50'
            : isDragging
              ? isCredit ? 'border-indigo-500 bg-indigo-50' : 'border-emerald-500 bg-emerald-50'
              : isCredit
                ? 'border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50'
                : 'border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
          }`}
        >
          {isProcessing && ocrProgress ? (
            <>
              <div className="flex justify-center mb-2">
                <svg className="animate-spin h-7 w-7 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-indigo-700">OCR in progress… {ocrProgress.pct}%</p>
            </>
          ) : (
            <>
              <Upload size={24} className={`mx-auto mb-2 ${isDragging ? (isCredit ? 'text-indigo-500' : 'text-emerald-500') : 'text-gray-400'}`} />
              <p className="text-xs font-semibold text-gray-700">Drop files or <span className={isCredit ? 'text-indigo-600' : 'text-emerald-600'}>browse</span></p>
              <p className="text-xs text-gray-400 mt-0.5">PDF · CSV · XLSX · PNG/JPG</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
            multiple
            className="hidden"
            onChange={e => processFiles(e.target.files, accountType)}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2 px-1">
          {isCredit
            ? 'Amex · Discover · Chase · Capital One'
            : 'Chase checking · BoA checking · any debit account'}
        </p>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Upload Transactions</h2>
        <p className="text-gray-500 text-sm mt-0.5">Upload to the correct section so credits and debits are interpreted correctly</p>
      </div>

      {confirmed ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <CheckCircle size={48} className="text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800 mb-1">Transactions Added!</h3>
          <p className="text-sm text-gray-500 mb-6">Your transactions have been saved. Duplicates were automatically skipped.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => { setConfirmed(false); setError(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
              Upload More
            </button>
            <button onClick={() => onNavigate('transactions')} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              View Transactions <ChevronRight size={15} />
            </button>
            <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
              See Dashboard <ChevronRight size={15} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Two upload zones */}
          <div className="flex gap-4 mb-4">
            <DropZone accountType="credit" />
            <DropZone accountType="debit" />
          </div>

          {/* How it works */}
          <div className="bg-blue-50 rounded-xl p-4 mb-4 text-xs text-blue-700 space-y-1">
            <p className="font-semibold text-blue-800 mb-1">Which section do I use?</p>
            <p><strong>Credit Card:</strong> charges become expenses, payments to the card are ignored</p>
            <p><strong>Checking / Debit:</strong> withdrawals become expenses, deposits become income (paycheck, transfers in)</p>
          </div>

          {/* Manual entry */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
            <button
              onClick={() => setShowManual(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <PlusCircle size={16} className="text-indigo-500" />
                Add Transaction Manually
              </span>
              <span className={`text-gray-400 transition-transform ${showManual ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {showManual && (
              <form onSubmit={handleManualSubmit} className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <input
                      type="date"
                      value={manualForm.date}
                      onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={manualForm.amount}
                      onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Whole Foods, Paycheck"
                    value={manualForm.description}
                    onChange={e => setManualForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setManualForm(f => ({ ...f, type: 'expense', categoryId: '' }))}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${manualForm.type === 'expense' ? 'bg-red-50 text-red-700' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualForm(f => ({ ...f, type: 'income', categoryId: '' }))}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${manualForm.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        Income
                      </button>
                    </div>
                  </div>
                  {manualForm.type === 'expense' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category <span className="text-gray-400">(optional)</span></label>
                      <select
                        value={manualForm.categoryId}
                        onChange={e => setManualForm(f => ({ ...f, categoryId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {manualError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle size={13} /> {manualError}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"
                  >
                    Add Transaction
                  </button>
                  {manualAdded && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                      <CheckCircle size={15} /> Added!
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Parsed results */}
          {results.length > 0 && (
            <div className="space-y-4 mb-6">
              {results.map((r, idx) => {
                const catCount = r.transactions.filter(t => t.categoryId).length;
                const isImg = IMAGE_EXTS.some(ext => r.fileName.toLowerCase().endsWith(ext));
                const isCredit = r.accountType === 'credit';
                return (
                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        {isImg ? <Image size={18} className="text-indigo-500" /> : <FileText size={18} className="text-indigo-500" />}
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{r.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {r.bank} · {isCredit ? 'Credit Card' : 'Checking/Debit'} · {r.transactions.length} transactions · {catCount} auto-categorized
                          </p>
                        </div>
                      </div>
                      <button onClick={() => removeResult(idx)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <X size={15} />
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-52">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2 text-gray-500 font-medium">Date</th>
                            <th className="text-left px-4 py-2 text-gray-500 font-medium">Description</th>
                            <th className="text-right px-4 py-2 text-gray-500 font-medium">Amount</th>
                            <th className="text-left px-4 py-2 text-gray-500 font-medium">Category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {r.transactions.slice(0, 20).map(t => {
                            const cat = categories.find(c => c.id === t.categoryId);
                            return (
                              <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{t.date}</td>
                                <td className="px-4 py-2 text-gray-800 max-w-[200px] truncate">{t.description}</td>
                                <td className={`px-4 py-2 text-right font-medium ${t.type === 'income' ? 'text-emerald-600' : 'text-gray-800'}`}>
                                  {t.type === 'income' ? '+' : ''}${t.amount.toFixed(2)}
                                </td>
                                <td className="px-4 py-2">
                                  {t.type === 'income' ? (
                                    <span className="text-emerald-600 font-medium">Income</span>
                                  ) : cat ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-white text-[10px] font-medium" style={{ backgroundColor: cat.color }}>
                                      {cat.name}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 italic">Uncategorized</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {r.transactions.length > 20 && (
                        <p className="text-center text-xs text-gray-400 py-2">+ {r.transactions.length - 20} more transactions</p>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{totalTx} transactions ready to import</p>
                  <p className="text-xs text-gray-500">{autoCat} auto-categorized · {totalTx - autoCat} need manual categorization</p>
                </div>
                <button onClick={handleConfirm} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm">
                  Confirm Import
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
