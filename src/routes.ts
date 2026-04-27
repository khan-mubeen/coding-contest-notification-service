import { Router } from 'express';
import { Store } from './store.js';
import { EventType, Subscription } from './types.js';
import { makeId, nowIso } from './utils.js';
import { NotifierService } from './notifier.js';

const allowedEvents: EventType[] = [
  'CONTEST_BECAME_ACTIVE',
  'NEW_SUBMISSION',
  'LEADERBOARD_TOP_CHANGED',
  'RESULTS_UPDATED'
];

const isEventTypeArray = (value: unknown): value is EventType[] => {
  return Array.isArray(value) && value.every((item) => allowedEvents.includes(item as EventType));
};

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export const createRouter = (store: Store, notifier: NotifierService): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.post('/poll', async (_req, res) => {
    await notifier.pollOnce();
    res.status(202).json({ message: 'poll triggered' });
  });

  router.get('/subscriptions', async (_req, res) => {
    const state = await store.read();
    res.json(state.subscriptions);
  });

  router.post('/subscriptions', async (req, res) => {
    const { email, contestId, eventTypes, enabled } = req.body;

    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ message: 'valid email is required' });
    }

    if (!isEventTypeArray(eventTypes) || eventTypes.length === 0) {
      return res.status(400).json({ message: 'eventTypes must be a non-empty array of valid events' });
    }

    if (contestId !== null && contestId !== undefined && typeof contestId !== 'string') {
      return res.status(400).json({ message: 'contestId must be string or null' });
    }

    const now = nowIso();
    const sub: Subscription = {
      id: makeId('sub'),
      email,
      contestId: contestId ?? null,
      eventTypes,
      enabled: typeof enabled === 'boolean' ? enabled : true,
      createdAt: now,
      updatedAt: now
    };

    const state = await store.read();
    state.subscriptions.push(sub);
    await store.write(state);

    return res.status(201).json(sub);
  });

  router.patch('/subscriptions/:id', async (req, res) => {
    const state = await store.read();
    const sub = state.subscriptions.find((item) => item.id === req.params.id);

    if (!sub) {
      return res.status(404).json({ message: 'subscription not found' });
    }

    const { email, contestId, eventTypes, enabled } = req.body;

    if (email !== undefined) {
      if (typeof email !== 'string' || !isValidEmail(email)) {
        return res.status(400).json({ message: 'valid email is required' });
      }
      sub.email = email;
    }

    if (contestId !== undefined) {
      if (contestId !== null && typeof contestId !== 'string') {
        return res.status(400).json({ message: 'contestId must be string or null' });
      }
      sub.contestId = contestId;
    }

    if (eventTypes !== undefined) {
      if (!isEventTypeArray(eventTypes) || eventTypes.length === 0) {
        return res.status(400).json({ message: 'eventTypes must be a non-empty array of valid events' });
      }
      sub.eventTypes = eventTypes;
    }

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'enabled must be boolean' });
      }
      sub.enabled = enabled;
    }

    sub.updatedAt = nowIso();
    await store.write(state);
    return res.json(sub);
  });

  router.delete('/subscriptions/:id', async (req, res) => {
    const state = await store.read();
    const index = state.subscriptions.findIndex((item) => item.id === req.params.id);

    if (index < 0) {
      return res.status(404).json({ message: 'subscription not found' });
    }

    state.subscriptions.splice(index, 1);
    await store.write(state);
    return res.status(204).send();
  });

  router.get('/deliveries', async (req, res) => {
    const state = await store.read();
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === 'string' ? Number(limitRaw) : 100;
    const result = state.deliveries.slice(-Math.max(1, Math.min(500, Number.isFinite(limit) ? limit : 100))).reverse();
    return res.json(result);
  });

  return router;
};
