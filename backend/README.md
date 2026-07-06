# MIEDVANCE API (Go)

REST API for the MIEDVANCE A/L exam-prep platform — rewritten from Node 20/Express to Go for
improved performance and binary deployability.

---

## Quick start (Docker)

```bash
cp .env.example .env        # fill in DB_PASSWORD and JWT secrets
make docker-up              # starts api + postgres + redis
curl http://localhost:3000/health
```

## Local development

Prerequisites: Go 1.25+, PostgreSQL 15, Redis 7.

```bash
# 1. Copy and edit environment
cp .env.example .env

# 2. Create DB and apply schema
psql -U postgres -c "CREATE DATABASE MIEDVANCE; CREATE USER MIEDVANCE_user WITH PASSWORD 'yourpw';"
psql -U MIEDVANCE_user -d MIEDVANCE -f sql/schema.sql

# 3. Start Redis
redis-server

# 4. Run
make run
```

## Environment variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `3000` | | HTTP listen port |
| `NODE_ENV` | `development` | | `production` enables JSON file logging |
| `DB_HOST` | `localhost` | | PostgreSQL host |
| `DB_PORT` | `5432` | | PostgreSQL port |
| `DB_NAME` | `MIEDVANCE` | | Database name |
| `DB_USER` | `MIEDVANCE_user` | | DB username |
| `DB_PASSWORD` | — | **Yes** | DB password |
| `REDIS_URL` | `redis://localhost:6379` | | Redis connection URL |
| `JWT_SECRET` | — | **Yes (≥32 chars)** | HMAC secret for access tokens |
| `JWT_EXPIRES_IN` | `30d` | | Access token lifetime (`30d`, `24h`, etc.) |
| `JWT_REFRESH_SECRET` | `JWT_SECRET` | | HMAC secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | | Refresh token lifetime |
| `SMS_API_URL` | | | Dialog/Mobitel SMS API endpoint |
| `SMS_API_KEY` | | | SMS API key |
| `SMS_SENDER_ID` | `MIEDVANCE` | | SMS sender name |
| `UPLOAD_DIR` | `./uploads` | | Root directory for file uploads |
| `MAX_FILE_SIZE_MB` | `10` | | Upload size limit per file |
| `CORS_ORIGIN` | `http://localhost:8080` | | Comma-separated allowed origins |
| `OTP_EXPIRE_MINUTES` | `5` | | OTP validity window |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | | Redis cooldown between OTP resends |
| `OTP_MAX_ATTEMPTS` | `5` | | Max wrong OTP attempts before lockout |

## API routes

### Auth `/api/v1/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register (sends OTP) |
| POST | `/verify-otp` | — | Verify OTP → issue tokens |
| POST | `/login` | — | Login with password |
| POST | `/logout` | Bearer | Blocklist access token |
| POST | `/resend-otp` | — | Resend OTP (rate-limited) |
| POST | `/forgot-password` | — | Send reset OTP (enumeration-safe) |
| POST | `/reset-password` | — | Reset password via OTP |
| POST | `/refresh` | — | Exchange refresh token for new access token |
| GET | `/me` | Bearer | Get own profile |
| PATCH | `/me` | Bearer | Update name / school / district / examYear |

### Papers `/api/v1/papers`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Bearer | List papers (filtered by type/subject/grade) |
| GET | `/{id}/overview` | Bearer | Pre-start lobby data — status + timing, no questions/answers |
| POST | `/{id}/start` | Bearer | Start exam (consumes single attempt, idempotent) → questions without answers |
| POST | `/{id}/submit` | Bearer | Submit answers → server-side score |
| GET | `/{id}/marking-scheme` | Bearer | Answers + student review (if ms_available) |
| GET | `/{id}/rankings` | Bearer | Leaderboard (Redis-cached 5 min) |
| POST | `/` | Admin | Create paper + questions |
| PATCH | `/{id}/marking-scheme` | Admin | Release marking scheme |

### Past Papers
Past papers are `papers` with `type='pastpaper'` — they run through the exam
engine (see Papers) with multiple attempts + elapsed timing. Student practice:
`GET /papers/practice-list`, `GET /papers/{id}/practice/overview`,
`POST /papers/{id}/practice/start`, `POST /papers/{id}/practice/{attemptId}/submit`,
`GET /papers/{id}/practice/attempts`, `GET /papers/{id}/pdf/{slot}` (structured /
essay / answers). Admin manages them via the Papers admin routes + `POST|DELETE
/admin/papers/{id}/pdf/{slot}`. (The old `/api/v1/past-papers` archive was removed.)

### Forum `/api/v1/forum`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/threads` | Bearer | List threads (filter by subject/status) |
| POST | `/threads` | Bearer | Create thread (multipart: up to 3 images) |
| GET | `/threads/{id}` | Bearer | Thread detail + replies |
| POST | `/threads/{id}/replies` | Bearer | Add reply |
| PATCH | `/replies/{id}/verify` | Teacher/Admin | Single verified reply + resolve thread |

### Admin `/api/v1/admin`
| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Dashboard aggregate counts |
| GET | `/papers` | All papers with attempt counts |
| PATCH | `/papers/{id}/publish` | Toggle is_published |
| POST | `/papers/{id}/trigger-rankings` | Manual ranking recompute |
| GET | `/users` | Student list (filter stream/grade, paged 50) |
| GET | `/subjects` | Subjects with nested topics |
| POST | `/topics` | Create topic |

### Health
```
GET /health   → {"status":"ok","timestamp":"...","env":"development"}
```

## Cron jobs

| Schedule | Job | Description |
|---|---|---|
| `*/5 * * * *` | SRP Ranking | Rank papers whose window closed in last 5 min |
| `30 18 * * *` | Marking Scheme | Release MS for yesterday's papers (SLST midnight) |
| `0 1 * * *` | OTP Cleanup | Delete expired OTPs older than 1 hour |

## Logging

- **Development**: coloured console output via `zap.NewDevelopment()`.
- **Production** (`NODE_ENV=production`): JSON to stdout + `logs/combined.log` (Info+) + `logs/error.log` (Error+). File rotation is handled by Docker's `--log-opt max-size` / `logrotate(8)` on bare metal.

## Architecture notes

| Decision | Why |
|---|---|
| chi router | Stdlib-compatible, same middleware model as Express |
| Hand-written pgx queries | sqlc not available on CI — equally type-safe, avoids codegen step |
| UUID scanned as string | Avoids pgtype codec complexity; portable across pgx versions |
| `redisclient` package name | Avoids import collision with `go-redis/v9` package alias `redis` |
| Refresh token one-time-use | Stricter than Node (which never revokes refresh tokens); adds security |
| `AppError` pattern | Services return structured errors with HTTP status; handlers don't need switch cases |
| Async ranking goroutine | Mirrors Node `computeRankings().catch()` — submit returns fast, rank computed after |
| Disk-local uploads | Same limitation as Node service; S3/GCS recommended for multi-replica deployments |

## Deviations from Node service

1. **`POST /api/v1/auth/refresh`** — added (was missing; refresh tokens were issued but never consumable).
2. **Refresh tokens are one-time-use** — old token blocklisted on use (Node never revoked them).

All other API behaviour, response shapes, status codes, and business rules are preserved exactly.
