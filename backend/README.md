# Kombuwaedu Backend API

**Node.js · Express · PostgreSQL · Redis**  
Sri Lanka G.C.E. A/L MCQ, SRP, Past Papers & Q&A Platform

---

## Quick Start

```bash
# 1. Install dependencies
cd kombuwaedu-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DB credentials, Redis URL, JWT secrets, SMS keys

# 3. Create database
psql -U postgres -c "CREATE DATABASE kombuwaedu;"
psql -U postgres -c "CREATE USER kombuwaedu_user WITH PASSWORD 'your_password';"
psql -U postgres -c "GRANT ALL ON DATABASE kombuwaedu TO kombuwaedu_user;"

# 4. Run migrations (creates all tables)
npm run migrate

# 5. Seed subjects, topics, admin user
npm run seed

# 6. Start server
npm run dev        # development (nodemon)
npm start          # production
```

---

## Stack

| Layer       | Technology                            |
|-------------|---------------------------------------|
| Runtime     | Node.js 20 LTS                        |
| Framework   | Express 4                             |
| Database    | PostgreSQL 15                         |
| Cache/LB    | Redis 7                               |
| Auth        | JWT (RS256) + bcrypt (cost 12)        |
| SMS OTP     | Dialog Axiata / Mobitel API           |
| File upload | Multer → local disk (swap for S3)     |
| Scheduler   | node-cron                             |
| Logging     | Winston                               |
| Validation  | express-validator                     |

---

## Project Structure

```
src/
  server.js              ← Express app + boot
  config/
    db.js                ← PostgreSQL pool
    redis.js             ← Redis client
    migrate.js           ← Run: npm run migrate
    seed.js              ← Run: npm run seed
  middleware/
    auth.js              ← JWT authenticate, requireRole
    errors.js            ← errorHandler, validate, notFound
    upload.js            ← Multer configs (images, PDFs)
  routes/
    auth.routes.js       ← /api/v1/auth/*
    papers.routes.js     ← /api/v1/papers/*
    pastpapers.routes.js ← /api/v1/past-papers/*
    forum.routes.js      ← /api/v1/forum/*
    admin.routes.js      ← /api/v1/admin/*
  services/
    auth.service.js      ← OTP, JWT, bcrypt helpers
    ranking.service.js   ← Score → rank computation
    cron.service.js      ← Scheduled jobs
  utils/
    logger.js            ← Winston logger
uploads/
  papers/                ← Question images
  essays/                ← Essay question PDFs
  marking-schemes/       ← Marking scheme PDFs
  forum-images/          ← Q&A photo attachments
logs/
  combined.log
  error.log
```

---

## API Reference

### Authentication `POST /api/v1/auth/`

| Method | Path               | Auth | Description                        |
|--------|--------------------|------|------------------------------------|
| POST   | `/register`        | —    | Register student, send OTP         |
| POST   | `/verify-otp`      | —    | Verify OTP, activate account       |
| POST   | `/login`           | —    | Login, receive JWT                 |
| POST   | `/logout`          | JWT  | Revoke token                       |
| POST   | `/forgot-password` | —    | Send reset OTP                     |
| POST   | `/reset-password`  | —    | Verify OTP + set new password      |
| GET    | `/me`              | JWT  | Get own profile                    |
| PATCH  | `/me`              | JWT  | Update name, school, district      |

**Register body:**
```json
{
  "mobile": "+94771234567",
  "name": "Amaya Silva",
  "password": "SecurePass123",
  "stream": "phy",
  "grade": "12",
  "district": "gampaha",
  "school": "Ananda College",
  "exam_year": 2026
}
```

---

### Papers `GET /api/v1/papers/`

| Method | Path                          | Auth  | Description                    |
|--------|-------------------------------|-------|--------------------------------|
| GET    | `/`                           | JWT   | List papers (filter by type, subject, grade) |
| GET    | `/:id/questions`              | JWT   | Get questions (no answers)     |
| POST   | `/:id/submit`                 | JWT   | Submit answers, get score      |
| GET    | `/:id/marking-scheme`         | JWT   | Get answers (if ms_available)  |
| GET    | `/:id/rankings`               | JWT   | Leaderboard for a paper        |
| POST   | `/`                           | Admin | Create paper + questions       |
| PATCH  | `/:id/marking-scheme`         | Admin | Release marking scheme         |

**Submit body:** `{ "answers": { "0": "A", "1": "C", "2": "B", ... } }`

**Rankings query:** `?district=gampaha&page=1&limit=50`

---

### Past Papers `GET /api/v1/past-papers/`

| Method | Path                        | Auth  | Description                          |
|--------|-----------------------------|-------|--------------------------------------|
| GET    | `/`                         | JWT   | Subject → Topic → Year tree          |
| GET    | `/:id/questions`            | JWT   | MCQ questions (answers if uploaded)  |
| GET    | `/:id/essay-pdf`            | JWT   | Stream essay PDF                     |
| GET    | `/:id/marking-scheme-pdf`   | JWT   | Stream marking scheme PDF            |
| POST   | `/`                         | Admin | Create past paper record             |
| POST   | `/:id/questions`            | Admin | Bulk upload MCQ questions            |
| POST   | `/:id/answer-key`           | Admin | Upload MCQ answer key                |
| POST   | `/:id/essay-pdf`            | Admin | Upload essay PDF (multipart)         |
| POST   | `/:id/marking-scheme-pdf`   | Admin | Upload marking scheme PDF            |

**Filter:** `?subject=m&grade=13&year=2023`

---

### Forum `GET /api/v1/forum/`

| Method | Path                          | Auth    | Description              |
|--------|-------------------------------|---------|--------------------------|
| GET    | `/threads`                    | JWT     | List threads             |
| GET    | `/threads/:id`                | JWT     | Thread + replies         |
| POST   | `/threads`                    | JWT     | Post question (+ images) |
| POST   | `/threads/:id/replies`        | JWT     | Post reply               |
| PATCH  | `/replies/:id/verify`         | Teacher | Mark reply verified      |

**Thread POST:** `multipart/form-data` — fields: `subject_id`, `title`, `body`, `images[]`

---

### Admin `GET /api/v1/admin/`

| Method | Path                            | Auth  | Description              |
|--------|---------------------------------|-------|--------------------------|
| GET    | `/stats`                        | Admin | DAU/WAU/MAU + counts     |
| GET    | `/papers`                       | Admin | All papers with attempts |
| PATCH  | `/papers/:id/publish`           | Admin | Publish / unpublish      |
| POST   | `/papers/:id/trigger-rankings`  | Admin | Manually compute ranks   |
| GET    | `/users`                        | Admin | Student list             |
| GET    | `/subjects`                     | Admin | Subjects + topics        |
| POST   | `/topics`                       | Admin | Add topic                |

---

## Scheduled Jobs (Automatic)

| Job                     | Schedule           | Action                                     |
|-------------------------|--------------------|--------------------------------------------|
| SRP Ranking Compute     | Every 5 minutes    | Ranks any SRP whose window just closed     |
| Marking Scheme Release  | 00:00 SLST (daily) | Sets ms_available=TRUE for yesterday's papers |
| OTP Cleanup             | 01:00 UTC (daily)  | Deletes expired OTP records               |

---

## Security

- Passwords: **bcrypt cost 12**
- Tokens: **JWT (HS256)**, blocklisted in Redis on logout
- Scoring: **server-side only** — client answers never trusted
- Rate limits: OTP 10/15min, Login 20/15min, Global 500/15min
- CORS: whitelist only
- Helmet: security headers
- Input: express-validator on every route
- SQL: parameterised queries only (no string interpolation)

---

## Deployment

```bash
# Environment
NODE_ENV=production
PORT=3000

# PostgreSQL connection pool: 20 connections
# Redis: enable persistence (appendonly yes) for leaderboard durability

# Serve static uploads through nginx in production:
# location /uploads/ { alias /var/www/kombuwaedu/uploads/; }

# Process manager
npm install -g pm2
pm2 start src/server.js --name kombuwaedu-api --instances 2
pm2 save && pm2 startup
```

---

## Admin Credentials (After Seed)

| Field    | Value            |
|----------|------------------|
| Mobile   | +94770000000     |
| Password | Admin@2026!      |

**Change this immediately in production.**
