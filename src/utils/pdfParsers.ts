import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../types';
import { AccountType } from './bankParsers';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfBankName = 'Discover' | 'Bank of America' | 'Chase' | 'Capital One' | 'American Express' | 'Generic';

const parseDate = (dateStr: string): string => {
  const trimmed = dateStr.trim();
  const m1 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
  const m2 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  const m3 = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m3) {
    const year = new Date().getFullYear();
    return `${year}-${m3[1].padStart(2, '0')}-${m3[2].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return trimmed;
};

const detectBankFromText = (text: string): PdfBankName => {
  const lower = text.toLowerCase();
  if (lower.includes('american express') || lower.includes('americanexpress')) return 'American Express';
  if (lower.includes('chase') || lower.includes('jpmorgan')) return 'Chase';
  if (lower.includes('capital one')) return 'Capital One';
  if (lower.includes('discover')) return 'Discover';
  return 'Generic';
};

// Extract text from PDF, grouping items by Y coordinate into lines.
// pdfjs-dist is loaded dynamically so it doesn't crash the app on startup.
const extractPdfLines = async (file: File): Promise<string[]> => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const yGroups = new Map<number, { x: number; str: string }[]>();
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = (item as { str: string; transform: number[] }).transform;
      const y = Math.round(transform[5]);
      const x = transform[4];
      if (!yGroups.has(y)) yGroups.set(y, []);
      yGroups.get(y)!.push({ x, str: item.str });
    }

    const sortedYs = [...yGroups.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = yGroups.get(y)!.sort((a, b) => a.x - b.x);
      const line = items.map(i => i.str).join(' ').trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
};

// Discover "Recent Activity" PDF format:
//   Posted:  MM/DD/YY MM/DD/YY DESCRIPTION $ AMOUNT CATEGORY
//   Pending: MM/DD/YY PENDING  DESCRIPTION $ AMOUNT PROCESSING
const parseDiscoverLines = (lines: string[]): Transaction[] => {
  const transactions: Transaction[] = [];
  const dateRe = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
  const postedRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+(.+?)\s+\$\s*(-?[\d,]+\.\d{2})(?:\s+\S.*)?$/;
  const pendingRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+PENDING\s+(.+?)\s+\$\s*(-?[\d,]+\.\d{2})(?:\s+\S.*)?$/;

  for (const line of lines) {
    const m = line.match(postedRe) || line.match(pendingRe);
    if (!m) continue;
    const [, dateStr, desc, amtStr] = m;
    const raw = parseFloat(amtStr.replace(/,/g, ''));
    if (isNaN(raw) || raw <= 0) continue; // negative = payment to card, skip
    const description = desc.trim();
    if (!description || dateRe.test(description)) continue;
    transactions.push({
      id: uuidv4(),
      date: parseDate(dateStr),
      description,
      amount: raw,
      type: 'expense',
      bank: 'Discover',
      categoryId: null,
    });
  }
  return transactions;
};

// Section headers that indicate the type of transactions that follow in the statement
const DEPOSIT_SECTION_RE = /deposits?\s+and\s+other\s+additions|credits?\s+and\s+deposits?/i;
const WITHDRAWAL_SECTION_RE = /withdrawals?\s+and\s+other\s+subtractions?|other\s+subtractions?|checks?\s+and\s+other\s+debits?|payments?\s+and\s+transfers?|atm\s+and\s+debit\s+card/i;

// Bank of America statement parser.
// BoA amounts have NO $ sign, use negative for withdrawals, positive for deposits.
// Descriptions can wrap to a second line; the amount may appear on that continuation line.
// Section headers tell us withdrawal vs deposit context.
const parseBoALines = (lines: string[], accountType: AccountType): Transaction[] => {
  const transactions: Transaction[] = [];
  const dateRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*(?:-?[\d,]+\.\d{2}\s*)?$/;
  const dateOnly = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

  type Section = 'deposits' | 'withdrawals' | 'unknown';
  let currentSection: Section = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    if (!dateOnly.test(line)) {
      if (DEPOSIT_SECTION_RE.test(line)) { currentSection = 'deposits'; continue; }
      if (WITHDRAWAL_SECTION_RE.test(line)) { currentSection = 'withdrawals'; continue; }
      continue;
    }

    // Try single-line match first
    const m = line.match(dateRe);
    if (m) {
      const [, dateStr, desc, amtStr] = m;
      const raw = parseFloat(amtStr.replace(/,/g, ''));
      if (!isNaN(raw) && raw !== 0 && !/^[\d,.\s]+$/.test(desc)) {
        let type: 'expense' | 'income';
        if (accountType === 'credit') {
          if (raw <= 0) continue;
          type = 'expense';
        } else {
          if (currentSection === 'deposits') type = 'income';
          else if (currentSection === 'withdrawals') type = 'expense';
          else type = raw < 0 ? 'expense' : 'income';
        }
        transactions.push({ id: uuidv4(), date: parseDate(dateStr), description: desc.trim(), amount: Math.abs(raw), type, bank: 'Bank of America', categoryId: null });
      }
      continue;
    }

    // No amount on this line — description may wrap to next line(s)
    const dateStart = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)/);
    if (!dateStart) continue;
    const dateStr = dateStart[1];
    const descParts = [dateStart[2]];

    // Look ahead up to 3 lines for the amount
    const amtRe = /(-?[\d,]+\.\d{2})(?:\s+-?[\d,]+\.\d{2})?$/;
    let found = false;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const next = lines[j];
      if (dateOnly.test(next)) break; // new transaction started
      const amtMatch = next.match(amtRe);
      if (amtMatch) {
        // The text before the amount is part of the description
        const textBefore = next.slice(0, next.lastIndexOf(amtMatch[1])).trim();
        if (textBefore) descParts.push(textBefore);
        const raw = parseFloat(amtMatch[1].replace(/,/g, ''));
        if (!isNaN(raw) && raw !== 0) {
          const desc = descParts.join(' ').trim();
          if (desc && !/^[\d,.\s]+$/.test(desc)) {
            let type: 'expense' | 'income';
            if (accountType === 'credit') {
              if (raw <= 0) { i = j; found = true; break; }
              type = 'expense';
            } else {
              if (currentSection === 'deposits') type = 'income';
              else if (currentSection === 'withdrawals') type = 'expense';
              else type = raw < 0 ? 'expense' : 'income';
            }
            transactions.push({ id: uuidv4(), date: parseDate(dateStr), description: desc, amount: Math.abs(raw), type, bank: 'Bank of America', categoryId: null });
          }
        }
        i = j;
        found = true;
        break;
      }
      if (!/^[\d,.\s]+$/.test(next)) descParts.push(next);
    }
    if (!found) { /* no amount found, skip */ }
  }

  return transactions;
};

// American Express statement parser.
//
// pdfjs layout (descending Y sort within each page):
//   lines[i-1] = "AplPay MERCHANT CITY STATE ⧫"  ← description at slightly higher Y
//   lines[i]   = "06/28/26 $55.32"                ← date + amount grouped at same Y
//
// Amex marks every transaction row with ⧫ (U+29EB) — used to confirm description lines.
// Credits/payments have negative amounts (−$7.00) and are skipped via negative lookbehind.
const parseAmexLines = (lines: string[]): Transaction[] => {
  const transactions: Transaction[] = [];
  const dateLineRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\*?\s*(.*)/;
  // Negative lookbehind: skip amounts preceded by '-' (credits/payments like -$7.00)
  const amountRe = /(?<!-)\$([\d,]+\.\d{2})/g;
  const dateOnly = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

  const findAmt = (line: string): number | null => {
    const matches = [...line.matchAll(amountRe)];
    if (!matches.length) return null;
    const v = parseFloat(matches[matches.length - 1][1].replace(/,/g, ''));
    return isNaN(v) || v <= 0 ? null : v;
  };

  // ⧫ (U+29EB) appears on every Amex transaction row — reliable signal that a line is a real entry.
  // However, in some rows pdfjs extracts ⧫ at a slightly different Y than the description text,
  // so the description line at i-1 may not contain ⧫ even when it is the correct description.
  const LOZENGE = '⧫';
  const isTransactionDesc = (s: string) =>
    s.includes(LOZENGE) && /^[A-Za-z]/.test(s) && !dateOnly.test(s) &&
    !s.includes('Pay Over Time'); // exclude page-section headers like "Detail Continued ⧫ - Pay Over Time..."
  const cleanDesc = (s: string) => s.replace(new RegExp(`\\s*${LOZENGE}\\s*`, 'g'), ' ').trim();
  // Merchant names: start with a letter, have multiple words, no email address
  const looksLikeMerchant = (s: string) =>
    s.length > 5 && /^[A-Za-z]/.test(s) && s.includes(' ') && !dateOnly.test(s) && !s.includes('@');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dateMatch = line.match(dateLineRe);
    if (!dateMatch) continue;

    const [, dateStr, afterDate] = dateMatch;

    // Skip admin lines like "08/12/26. This date may not be..." (afterDate starts with '.')
    if (afterDate && !/^[$A-Za-z-]/.test(afterDate.trim())) continue;
    // Skip credits/payments where afterDate IS the negative amount (e.g. "-$7.00")
    if (/^-\$/.test(afterDate.trim())) continue;

    // Build description.
    // In Amex PDFs the description sits at a slightly higher Y than the date+amount,
    // so it appears at i-1 in the descending-Y sorted array.
    // – dollarPos > 0: rare "MERCHANT $55.32" same-line format
    // – dollarPos === 0 or empty afterDate: amount-only line → look at i-1 (then i+1..i+3)
    const dollarPos = afterDate.search(/\$/);
    let desc = '';

    if (dollarPos > 0) {
      desc = afterDate.slice(0, dollarPos).trim();
    } else {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (isTransactionDesc(prevLine)) {
        desc = cleanDesc(prevLine);
      } else if (looksLikeMerchant(prevLine)) {
        // ⧫ was extracted at a slightly different Y — description without ⧫ is still correct
        desc = prevLine;
      } else {
        for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
          const kl = lines[k].trim();
          if (!kl || dateOnly.test(kl)) break;
          if (isTransactionDesc(kl)) { desc = cleanDesc(kl); break; }
        }
      }
    }

    if (!desc) continue;

    let amount: number | null = null;
    let amountLine = i;

    // 1. Amount on the same line as the date (most common: "06/28/26 $55.32")
    if (dollarPos >= 0) amount = findAmt(afterDate);

    // 2. Backward: amount column at slightly higher Y appears at i-1..i-3
    if (amount === null) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (dateOnly.test(lines[j].trim())) break;
        const v = findAmt(lines[j]);
        if (v !== null) { amount = v; break; }
      }
    }

    // 3. Forward: multi-line transactions (reference, foreign currency, then USD amount)
    if (amount === null) {
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (dateOnly.test(lines[j].trim())) break;
        const v = findAmt(lines[j]);
        if (v !== null) { amount = v; amountLine = j; break; }
      }
    }

    if (amount === null) continue;

    transactions.push({
      id: uuidv4(),
      date: parseDate(dateStr),
      description: desc,
      amount,
      type: 'expense',
      bank: 'American Express',
      categoryId: null,
    });
    i = amountLine;
  }

  return transactions;
};

const parseTransactionsFromLines = (lines: string[], bank: PdfBankName, accountType: AccountType): Transaction[] => {
  const transactions: Transaction[] = [];
  const txPattern = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*(?:-?\$?[\d,]+\.\d{2}\s*)?$/;

  // For debit statements, track which section we're in.
  // Banks like BoA list all amounts as positive and use section headers to
  // distinguish deposits from withdrawals, so we can't rely on the amount sign alone.
  type Section = 'deposits' | 'withdrawals' | 'unknown';
  let currentSection: Section = 'unknown';

  for (const line of lines) {
    // Detect section headers (lines without a date are headers, not transactions)
    if (accountType === 'debit' && !/^\d{1,2}\/\d{1,2}/.test(line)) {
      if (DEPOSIT_SECTION_RE.test(line)) { currentSection = 'deposits'; continue; }
      if (WITHDRAWAL_SECTION_RE.test(line)) { currentSection = 'withdrawals'; continue; }
    }

    const match = line.match(txPattern);
    if (!match) continue;

    const [, dateStr, desc, amtStr] = match;
    const rawAmount = parseFloat(amtStr.replace(/[$,]/g, ''));
    if (isNaN(rawAmount) || rawAmount === 0) continue;

    const description = desc.trim();
    if (!description || /^[\d,.$\s]+$/.test(description)) continue;

    let type: 'expense' | 'income';
    if (accountType === 'credit') {
      if (rawAmount <= 0) continue; // skip payments/credits on credit card statements
      type = 'expense';
    } else {
      // Use section context when available (handles BoA and similar all-positive formats).
      // Fall back to sign when no section header was seen (Chase, etc. use negative for withdrawals).
      if (currentSection === 'deposits') type = 'income';
      else if (currentSection === 'withdrawals') type = 'expense';
      else type = rawAmount < 0 ? 'expense' : 'income';
    }

    transactions.push({
      id: uuidv4(),
      date: parseDate(dateStr),
      description,
      amount: Math.abs(rawAmount),
      type,
      bank,
      categoryId: null,
    });
  }

  return transactions;
};

export const parsePDF = async (file: File, accountType: AccountType): Promise<{ transactions: Transaction[]; bank: string }> => {
  const lines = await extractPdfLines(file);
  if (lines.length === 0) throw new Error('Could not extract text from PDF. The file may be scanned or encrypted.');

  const bank: PdfBankName = accountType === 'debit'
    ? 'Bank of America'
    : detectBankFromText(lines.join('\n'));

  const transactions = bank === 'Discover'
    ? parseDiscoverLines(lines)
    : bank === 'Bank of America'
      ? parseBoALines(lines, accountType)
      : bank === 'American Express'
        ? parseAmexLines(lines)
        : parseTransactionsFromLines(lines, bank, accountType);

  if (transactions.length === 0) {
    const dateLines = lines.filter(l => /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l.trim())).slice(0, 3);
    const preview = dateLines.length > 0
      ? `Date lines: ${dateLines.map(l => l.slice(0, 80)).join(' || ')}`
      : `No date lines found. First 3 lines: ${lines.slice(0, 3).join(' || ')}`;
    throw new Error(`No transactions found (bank: ${bank}, ${lines.length} lines extracted). ${preview}`);
  }

  return { transactions, bank };
};
