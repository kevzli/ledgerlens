#!/bin/bash
cd "$(dirname "$0")"

# Kill any existing instance on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start the dev server silently in the background
npm run dev > /tmp/budgeting-app.log 2>&1 &

# Wait for it to be ready, then open in browser
sleep 3
open http://localhost:5173
