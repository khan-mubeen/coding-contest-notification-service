import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: parseNumber(process.env.PORT, 4001),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX ?? '/api',
  apiToken: process.env.API_TOKEN ?? '',
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 15000),
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 20000),
  dataFile: process.env.DATA_FILE ?? './service-data.json',
  maxDeliveryRetries: parseNumber(process.env.MAX_DELIVERY_RETRIES, 3),
  retryBaseDelayMs: parseNumber(process.env.RETRY_BASE_DELAY_MS, 2000),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'no-reply@contest-system.local'
  }
};
