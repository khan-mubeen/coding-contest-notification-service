# Coding Contest Notification Service

Auxiliary service for the Coding Contest System.

It polls the main API, detects contest-related events, and sends notifications by email. This keeps notification delivery and third-party integration outside the main API server.

## Why this service exists

Notification delivery has different responsibilities than the main contest API:
- external SMTP integration
- retry and dedup logic
- periodic polling work
- delivery tracking

Keeping this in a separate service avoids coupling and keeps the core API simpler.

## Features

- Subscription API (CRUD)
- Delivery log API
- Polling worker with configurable interval
- Event detection:
  - `CONTEST_BECAME_ACTIVE`
  - `NEW_SUBMISSION`
  - `LEADERBOARD_TOP_CHANGED`
  - `RESULTS_UPDATED`
- Email sending via Nodemailer
- Dedup by event key
- Retry with exponential backoff
- JSON-file persistence (simple MVP storage)

## Architecture

- API style: REST (Express)
- Worker model: periodic polling (`setInterval`)
- Storage: local JSON file (`service-data.json`)
- Communication:
  - Notification Service -> Main API: HTTP GET polling
  - Notification Service -> SMTP: email send

## Endpoints

- `GET /health`
- `POST /poll` manual polling trigger
- `GET /subscriptions`
- `POST /subscriptions`
- `PATCH /subscriptions/:id`
- `DELETE /subscriptions/:id`
- `GET /deliveries?limit=100`

## Setup

```bash
npm install
cp .env.example .env
```

Set `.env` values:
- `API_BASE_URL=http://localhost:3000`
- `API_PREFIX=/api`
- `API_TOKEN=<jwt-or-pat>`

SMTP options:
- If `SMTP_HOST/SMTP_USER/SMTP_PASS` are empty, service uses Nodemailer stream transport (prints message content to logs), useful for demo.

## Run

Development:
```bash
npm run dev
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

## Example API usage

Create subscription:
```bash
curl -X POST http://localhost:4001/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "email":"team@example.com",
    "contestId":null,
    "eventTypes":["NEW_SUBMISSION","RESULTS_UPDATED"],
    "enabled":true
  }'
```

List deliveries:
```bash
curl http://localhost:4001/deliveries?limit=20
```

Trigger manual poll:
```bash
curl -X POST http://localhost:4001/poll
```

## Quality commands

```bash
npm run lint
npm test
npm run build
```
