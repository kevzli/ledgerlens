import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../types';

export type AccountType = 'credit' | 'debit';

type ParsedRow = Record<string, string>;

const parseDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const m1 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return trimmed;
};

const parseAmount = (str: string): number => {
  if (!str) return 0;
  const cleaned = str.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

type BankName = 'Discover' | 'Bank of America' | 'Chase' | 'Capital One' | 'Generic';

const detectBank = (headers: string[]): BankName => {
  const h = headers.map(x => x.toLowerCase().trim()).join('|');
  if (h.includes('trans. date') || h.includes('trans date')) return 'Discover';
  if (h.includes('reference number') && h.includes('payee')) return 'Bank of America';
  if (h.includes('transaction date') && h.includes('memo')) return 'Chase';
  if (h.includes('card no')) return 'Capital One';
  return 'Generic';
};

const toTransaction = (
  partial: { date: string; description: string; amount: number; type: 'expense' | 'income'; bank: string }
): Transaction => ({ ...partial, id: uuidv4(), categoryId: null });

// Discover is always a credit card — positive = charge, skip negatives (payments)
const parseDiscover = (rows: ParsedRow[]): Transaction[] =>
  rows
    .map(row => {
      const raw = parseAmount(row['Amount'] ?? '0');
      if (raw <= 0) return null;
      const desc = (row['Description'] ?? '').trim();
      if (!desc) return null;
      return toTransaction({ date: parseDate(row['Trans. Date'] ?? row['Transaction Date'] ?? ''), description: desc, amount: raw, type: 'expense', bank: 'Discover' });
    })
    .filter((t): t is Transaction => t !== null);

// BoA: credit mode → all abs as expense; debit mode → negative=expense, positive=income
const parseBoA = (rows: ParsedRow[], accountType: AccountType): Transaction[] =>
  rows
    .map(row => {
      const raw = parseAmount(row['Amount'] ?? '0');
      if (raw === 0) return null;
      const desc = (row['Payee'] ?? row['Description'] ?? '').trim();
      if (!desc) return null;
      const type: 'expense' | 'income' = accountType === 'credit' ? 'expense' : (raw < 0 ? 'expense' : 'income');
      return toTransaction({ date: parseDate(row['Posted Date'] ?? row['Date'] ?? ''), description: desc, amount: Math.abs(raw), type, bank: 'Bank of America' });
    })
    .filter((t): t is Transaction => t !== null);

// Chase: credit mode → Sale=expense, Credit=income (refund), Payment=skip
//        debit mode  → negative=expense, positive=income
const parseChase = (rows: ParsedRow[], accountType: AccountType): Transaction[] =>
  rows
    .map(row => {
      const typeCol = (row['Type'] ?? '').toLowerCase();
      const raw = parseAmount(row['Amount'] ?? '0');
      if (raw === 0) return null;
      const desc = (row['Description'] ?? '').trim();
      if (!desc) return null;
      if (accountType === 'credit') {
        if (typeCol === 'payment') return null;
        const type: 'expense' | 'income' = typeCol === 'credit' ? 'income' : 'expense';
        return toTransaction({ date: parseDate(row['Transaction Date'] ?? ''), description: desc, amount: Math.abs(raw), type, bank: 'Chase' });
      } else {
        const type: 'expense' | 'income' = raw < 0 ? 'expense' : 'income';
        return toTransaction({ date: parseDate(row['Transaction Date'] ?? ''), description: desc, amount: Math.abs(raw), type, bank: 'Chase' });
      }
    })
    .filter((t): t is Transaction => t !== null);

// Capital One: Debit col = expense; Credit col = income (refund or deposit)
const parseCapitalOne = (rows: ParsedRow[]): Transaction[] =>
  rows
    .map(row => {
      const debit = parseAmount(row['Debit'] ?? '0');
      const credit = parseAmount(row['Credit'] ?? '0');
      if (debit === 0 && credit === 0) return null;
      const desc = (row['Description'] ?? '').trim();
      if (!desc) return null;
      if (debit > 0) {
        return toTransaction({ date: parseDate(row['Transaction Date'] ?? ''), description: desc, amount: debit, type: 'expense', bank: 'Capital One' });
      } else {
        return toTransaction({ date: parseDate(row['Transaction Date'] ?? ''), description: desc, amount: credit, type: 'income', bank: 'Capital One' });
      }
    })
    .filter((t): t is Transaction => t !== null);

// Generic: credit mode → all as expense (abs); debit mode → negative=expense, positive=income
const parseGeneric = (rows: ParsedRow[], headers: string[], accountType: AccountType): Transaction[] => {
  const dateCol = headers.find(h => /date|time/i.test(h));
  const descCol = headers.find(h => /desc|payee|merchant|name/i.test(h));
  const amtCol = headers.find(h => /^amount$|^amt$/i.test(h)) ?? headers.find(h => /amount|price|total/i.test(h));
  if (!dateCol || !descCol || !amtCol) return [];
  return rows
    .map(row => {
      const raw = parseAmount(row[amtCol] ?? '0');
      if (raw === 0) return null;
      const desc = (row[descCol] ?? '').trim();
      if (!desc) return null;
      const type: 'expense' | 'income' = accountType === 'credit' ? 'expense' : (raw >= 0 ? 'income' : 'expense');
      return toTransaction({ date: parseDate(row[dateCol] ?? ''), description: desc, amount: Math.abs(raw), type, bank: 'Unknown Bank' });
    })
    .filter((t): t is Transaction => t !== null);
};

export const parseCSV = (csvText: string, accountType: AccountType): { transactions: Transaction[]; bank: string } => {
  const result = Papa.parse<ParsedRow>(csvText, { header: true, skipEmptyLines: true });
  if (result.data.length === 0) throw new Error('No data found in CSV file.');

  const headers = result.meta.fields ?? [];
  const bank = detectBank(headers);

  let transactions: Transaction[];
  switch (bank) {
    case 'Discover':       transactions = parseDiscover(result.data); break;
    case 'Bank of America': transactions = parseBoA(result.data, accountType); break;
    case 'Chase':          transactions = parseChase(result.data, accountType); break;
    case 'Capital One':    transactions = parseCapitalOne(result.data); break;
    default:               transactions = parseGeneric(result.data, headers, accountType);
  }

  return { transactions, bank };
};

// Extracts a short merchant core from a description for fuzzy memory matching.
// "AplPay CHIPOTLE 0797 0797 NEW YORK NY" → "chipotle"
// "AplPay NYCT PAYGO NEW YORK NY"         → "nyct paygo"
// Strips "AplPay" prefix, stops at the first digit token or known city-prefix word.
export const normalizeMerchant = (desc: string): string => {
  const CITY_PREFIXES = new Set(['new', 'los', 'san', 'fort', 'saint', 'north', 'south', 'east', 'west']);
  let s = desc.toLowerCase().trim().replace(/^aplpay\s+/i, '');
  const words = s.split(/\s+/);
  const core: string[] = [];
  for (const w of words) {
    if (/^\d/.test(w)) break;
    if (CITY_PREFIXES.has(w) && core.length > 0) break;
    core.push(w);
  }
  const result = core.join(' ');
  return result.length > 3 ? result : s.slice(0, 30);
};

export const autoCategorize = (
  transactions: Transaction[],
  categories: import('../types').BudgetCategory[]
): Transaction[] =>
  transactions.map(t => {
    if (t.type === 'income') return t;
    const desc = t.description.toLowerCase();
    const match = categories.find(cat =>
      cat.keywords.some(kw => desc.includes(kw.toLowerCase()))
    );
    return { ...t, categoryId: match?.id ?? null };
  });
