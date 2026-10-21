import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../types';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const parseDate = (s: string): string => {
  const t = s.trim();
  // MM/DD/YYYY or MM/DD/YY
  const m1 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    return `${y}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
  }
  // MM/DD (current year)
  const m2 = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) {
    const y = new Date().getFullYear();
    return `${y}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  }
  // "Jan 15, 2024" or "Jan 15"
  const m3 = t.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})?$/);
  if (m3 && MONTHS[m3[1].toLowerCase()]) {
    const y = m3[3] ?? String(new Date().getFullYear());
    return `${y}-${MONTHS[m3[1].toLowerCase()]}-${m3[2].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return t;
};

const detectBank = (text: string): string => {
  const l = text.toLowerCase();
  if (l.includes('discover')) return 'Discover';
  if (l.includes('bank of america')) return 'Bank of America';
  if (l.includes('chase') || l.includes('jpmorgan')) return 'Chase';
  if (l.includes('capital one')) return 'Capital One';
  return 'Generic';
};

// Try to extract transactions from OCR text using two strategies:
//   1. Single-line: "MM/DD[/YYYY]  Description  $amount" on one line
//   2. Multi-line: date line, then description line(s), then amount line
const extractTransactions = (text: string, bank: string): Transaction[] => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const transactions: Transaction[] = [];
  const used = new Set<number>();

  // Strategy 1: single-line pattern
  const singleLine = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Za-z]{3}\s+\d{1,2},?\s*\d{0,4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(singleLine);
    if (!m) continue;
    const [, dateStr, desc, amtStr] = m;
    const raw = parseFloat(amtStr.replace(/[$,]/g, ''));
    if (isNaN(raw) || raw === 0 || /^[\d,.$\s]+$/.test(desc)) continue;
    transactions.push({
      id: uuidv4(),
      date: parseDate(dateStr),
      description: desc.trim(),
      amount: Math.abs(raw),
      type: raw < 0 ? 'income' : 'expense',
      bank,
      categoryId: null,
    });
    used.add(i);
  }

  if (transactions.length > 0) return transactions;

  // Strategy 2: multi-line — look for a date, then collect desc lines, then find an amount
  const dateRe = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$|^[A-Za-z]{3}\s+\d{1,2},?\s*(?:\d{4})?$/;
  const amtRe = /(-?\$?[\d,]+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i) || !dateRe.test(lines[i])) continue;

    const descParts: string[] = [];
    let amtStr: string | null = null;
    let amtIdx = -1;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (used.has(j)) break;
      const amtMatch = lines[j].match(amtRe);
      if (amtMatch && /^\$?-?[\d,]+\.\d{2}$/.test(lines[j].trim())) {
        amtStr = amtMatch[1];
        amtIdx = j;
        break;
      }
      // Inline: "MERCHANT NAME $45.67" on one line after the date
      const inlineMatch = lines[j].match(/^(.+?)\s+(-?\$?[\d,]+\.\d{2})$/);
      if (inlineMatch && !/^[\d,.$\s]+$/.test(inlineMatch[1])) {
        descParts.push(inlineMatch[1]);
        amtStr = inlineMatch[2];
        amtIdx = j;
        break;
      }
      if (!/^[\d,.$\s]+$/.test(lines[j])) descParts.push(lines[j]);
    }

    if (!amtStr || amtIdx < 0) continue;
    const raw = parseFloat(amtStr.replace(/[$,]/g, ''));
    if (isNaN(raw) || raw === 0) continue;

    const desc = descParts.join(' ').trim();
    if (!desc) continue;

    transactions.push({
      id: uuidv4(),
      date: parseDate(lines[i]),
      description: desc,
      amount: Math.abs(raw),
      type: raw < 0 ? 'income' : 'expense',
      bank,
      categoryId: null,
    });
    used.add(i);
    used.add(amtIdx);
    for (let k = i + 1; k < amtIdx; k++) used.add(k);
  }

  return transactions;
};

export const parseImage = async (
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ transactions: Transaction[]; bank: string }> => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/worker.min.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    corePath: '/tesseract-core-simd-lstm.wasm.js',
    logger: onProgress
      ? (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress(Math.round(m.progress * 100));
        }
      : undefined,
  });

  try {
    const { data: { text } } = await worker.recognize(file);
    const bank = detectBank(text);
    const transactions = extractTransactions(text, bank);

    if (transactions.length === 0) {
      throw new Error(
        'No transactions found in this image. Make sure the screenshot clearly shows transaction rows with dates and amounts.',
      );
    }

    return { transactions, bank };
  } finally {
    await worker.terminate();
  }
};
