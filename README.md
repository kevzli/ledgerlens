# LedgerLens

A personal budgeting app that reads your bank and credit card statements — PDFs, screenshots (via OCR), CSV and Excel — and turns them into categorized transactions, budgets and spending charts. Everything runs locally in the browser; no data leaves your machine.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173 (or double-click `launch.command` on macOS).

## Mac desktop app

```bash
npm run build:mac
```

This builds `release/mac-arm64/LedgerLens.app` — drag it into Applications. (`npm run app` runs it without packaging.) The app is unsigned, so the first launch needs right-click → Open.

The browser version and the desktop app keep separate data. Use **Export data** in one and **Import data** in the other to move it across; the exported JSON also works as a backup.

Built with React, TypeScript, Vite, Tailwind, pdf.js, Tesseract.js and Recharts.
