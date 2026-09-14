# Xero Research Assistant

A small TypeScript web application that gathers public Xero research and answers questions using traceable stored evidence.

## Development setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is available at `http://localhost:3001/api/health`.

## Current status

The TypeScript, React, Vite, and Express foundation is in place. Research gathering, persistence, retrieval, model-backed answers, evaluation, and final documentation will be implemented in subsequent milestones.
