# Kombuwaedu — Full Stack Platform

## Project Structure

```
kombuwaedu-project/
  frontend/
    index.html           ← Complete SPA (open directly or serve via web server)
  backend/               ← Node.js REST API (see backend/README.md)
```

## Quick Start

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env    # edit DB credentials, JWT secrets, SMS keys
npm run migrate          # create PostgreSQL tables
npm run seed             # seed subjects, topics, admin user
npm run dev              # start on port 3000
```

### 2. Frontend
```bash
# Simplest: just open in browser (demo mode — no backend required)
open frontend/index.html

# Or serve with any static server:
npx serve frontend/
# Then visit http://localhost:3000 (or whatever port serve uses)
```

### 3. Connect Frontend to Backend
In `frontend/index.html`, line ~10:
```js
const BASE_URL = 'http://localhost:3000/api/v1';
```
Change to your deployed API URL for production.

## Features
- Registration with OTP (SMS via Dialog Axiata)
- 5 Subject Streams × Grade 12 + 13 paper access
- Daily MCQ (10Q, 10min) + SRP (30Q, 30min) with live timer
- Server-side scoring — answers never exposed to client
- Marking scheme released automatically at midnight SLST
- Island-wide + district rankings per paper
- Past papers 2015–2024 — MCQ interactive + Essay PDF + Marking Scheme PDF
- Q&A Forum with photo upload + teacher-verified answers
- Full demo mode if backend is offline

## Admin Credentials (after seed)
- Mobile: +94770000000
- Password: Admin@2026!
