# Coding Contest Notification Service

Notification service for the Contest System. It runs in the background, watches for contest events, and sends emails when things happen.

## Overview

This service does one job: keep people in the loop about what's happening in contests. It sits separately from the main API and handles all the email stuff (subscriptions, retries, delivery tracking). Every 15 seconds or so, it polls the main API to check for new events like contest activations, submissions, and leaderboard changes. If a subscriber is interested in an event, they get an email.

The main idea is to keep notification complexity out of the core API. That way the API stays simple, and we can upgrade or fix the notification system without touching the contest logic.

## Why Separate It Out?

You could build email notifications straight into the main API, but that's messy:

SMTP is unreliable. Mail servers are slow and sometimes break. If email integration is in the main API, a SMTP failure can take down the whole contest system. Not good.

Retry logic is complicated. Handling duplicates, intelligent backoffs, and failed deliveries needs its own state management. It doesn't belong tangled up in API request handlers.

Different performance profiles. Email is I/O-heavy (waiting for SMTP). The contest API is CPU/database-heavy. These should scale independently.

Easier to iterate. With a separate service, you can improve notifications without risking the core API. Want to add Slack messages later? Add it here, not in the contest API.

Basically: notifications and contest logic have different reasons to change, so keep them separate.

## How It Works

Pretty straightforward setup:

```
Notification Service
  ├─ REST API for managing subscriptions (user-facing)
  ├─ Background worker polling the main API every 15s
  └─ Mailer that sends actual emails
         ↓
    Talks to Main API (HTTP)
    Talks to SMTP (email)
```

The service keeps a snapshot of the last poll: submission counts, leaderboard state, contest status. When the next poll runs, it compares the new state with the snapshot. If anything changed, that's an event. If contest C1 had 3 submissions and now has 5, boom—2 new submission events. This snapshot is stored in `service-data.json` with subscriptions and delivery history.

If the service crashes, it just resumes from where it left off when it restarts. No missing events, no duplicates.

## Ecosystem Integration

Here's how this service fits into the overall system:

```
┌─────────────────────────────────────────────────────────────────┐
│                        External World                            │
├─────────────────────────────────────────────────────────────────┤
│                     SMTP Email Server                            │
│                  (Gmail, AWS SES, etc.)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ SMTP (port 587/465)
                           │ Email delivery
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│           Coding Contest Notification Service                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ REST API (:4001)                                         │    │
│  │  - POST /subscriptions (create subscription)             │    │
│  │  - PATCH /subscriptions/:id (update preferences)         │    │
│  │  - GET /deliveries (audit trail)                         │    │
│  │  - POST /poll (manual trigger)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Background Worker (every 15 seconds)                     │    │
│  │  1. Poll Main API for contests/submissions/scores        │    │
│  │  2. Compare with previous snapshot                       │    │
│  │  3. Detect new events                                    │    │
│  │  4. Send emails to subscribers matching events           │    │
│  │  5. Log delivery status                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Storage: service-data.json                                      │
│  - Subscriptions list                                            │
│  - Delivery history                                              │
│  - State snapshots                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTP GET (polls every 15s)
                           │ Fetch: /contests, /submissions, /scores
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│              Main Contest API (:3000)                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ /api/contests (contest info, is_active status)          │    │
│  │ /api/contests/{id}/submissions (submission list)         │    │
│  │ /api/submissions/{id}/scores (scoring info)              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Communication Flow:**
1. **Notification Service → Main API**: Polls via HTTP GET every 15s (Bearer token auth)
2. **Notification Service → SMTP**: Sends emails when events detected
3. **External Clients → Notification Service**: REST API calls to manage subscriptions
4. **Data Persistence**: JSON file-based storage (can upgrade to database)

**Event Detection Pipeline:**
```
Snapshot State                    New Poll                   Action
(last known)        ────────→  (current data)  ─────────→  (Events)
│                                   │                          │
├─ C1: 3 submissions      ├─ C1: 5 submissions      ├─ NEW_SUBMISSION
├─ C1: active=false       ├─ C1: active=true        ├─ CONTEST_BECAME_ACTIVE
└─ Leader: Team A         └─ Leader: Team B         └─ LEADERBOARD_TOP_CHANGED
                                     │
                                     ↓
                          Apply subscription filters
                          (who wants these events?)
                                     │
                                     ↓
                          Send emails + log deliveries
```

## What It Does

- **Subscriptions**: People can subscribe to contests and pick which events they care about. Simple CRUD endpoints.
- **Event Detection**: Watches for contests going live, new submissions, leaderboard changes, and score updates.
- **Email Delivery**: Sends emails to subscribers when events happen. Retries up to 3 times on failure with backoff. Won't send duplicates for the same event.
- **Background Worker**: Polls the main API every 15 seconds, detects changes, and sends emails. Runs async so it doesn't block the REST API.
- **Delivery Log**: Tracks every email attempt—what was sent, status, retries, errors.

## Design Notes

REST API: Standard HTTP resources. GET, POST, PATCH, DELETE for subscriptions. Nothing fancy, easy to test.

Polling over webhooks: We pull data from the main API on a schedule instead of waiting for push notifications. Simpler—the main API doesn't need to know we exist. Plus, if we crash and restart, we just resume polling with no missed events.

Background worker: Event detection and email sending run on a timer, separate from the subscription API. This way a slow email delivery doesn't block API requests.

Snapshot state: We store what we saw last poll—contest status, submission counts, leaderboard rankings. When we poll again, we compare. Any difference triggers an event. Simple and reliable.

## API Endpoints

**Health check** — useful for Docker / load balancers
```
GET /health
→ { "status": "ok" }
```

**Subscriptions**
```
GET /subscriptions
POST /subscriptions
{
  "email": "user@example.com",
  "contestId": "c1",        // or null for all contests
  "eventTypes": ["NEW_SUBMISSION", "RESULTS_UPDATED"],
  "enabled": true
}
PATCH /subscriptions/:id    // any field can be updated
DELETE /subscriptions/:id
```

**Delivery log** — see what emails were sent
```
GET /deliveries?limit=100
→ Returns recent deliveries with status (PENDING/SENT/FAILED) and error details
```

**Manual poll** — useful for testing or forcing a check right now
```
POST /poll
→ HTTP 202 (triggers async poll, returns immediately)
```

## Getting Started

**Requirements**: Node 18+ or Docker. You'll also need access to the Main Contest API and (eventually) SMTP credentials. For testing, you can skip SMTP—demo mode just prints emails to console.

**Clone and install**
```bash
git clone <repository>
cd coding-contest-notification-service
npm install
```

**Set up environment**
```bash
cp .env.example .env
```

Now edit `.env`. At minimum you need:
- `API_BASE_URL` — where the Contest API lives (probably `http://localhost:3000`)
- `API_PREFIX` — usually `/api`
- `API_TOKEN` — bearer token to call the Contest API

For email, if you have SMTP set up:
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`

If you skip SMTP, the service just logs emails to console. Great for development.

**Run it**

Development (with auto-reload):
```bash
npm run dev
# Listens on http://localhost:4001
```

Production:
```bash
npm run build
npm start
```

Docker:
```bash
docker compose up -d --build
```

**Check it's working**
```bash
curl http://localhost:4001/health
# Should return { "status": "ok" }
```

## Quality & Testing

**Lint the code**
```bash
npm run lint
```
Uses ESLint with TypeScript. All code in src/ and test/ gets checked. Before you commit, make sure this passes.

**Run tests**
```bash
npm test
```
Tests focus on event detection logic (making sure we spot the right events and don't duplicate them).

**Build it**
```bash
npm run build
```
TypeScript compiler runs in strict mode. If this works, the code is type-safe.
