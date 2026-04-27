import { config } from './config.js';
import { MainApiClient } from './apiClient.js';
import { detectEvents } from './eventDetector.js';
import { Store } from './store.js';
import { Delivery, EventRecord, ServiceData, Subscription } from './types.js';
import { Mailer } from './mailer.js';
import { makeId, nowIso, sleep } from './utils.js';

const eventMatchesSubscription = (event: EventRecord, subscription: Subscription): boolean => {
  if (!subscription.enabled) return false;
  if (!subscription.eventTypes.includes(event.eventType)) return false;
  if (subscription.contestId && subscription.contestId !== event.contestId) return false;
  return true;
};

export class NotifierService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly store: Store,
    private readonly api: MainApiClient,
    private readonly mailer: Mailer
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, config.pollIntervalMs);

    void this.pollOnce();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollOnce(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    try {
      const state = await this.store.read();
      const result = await this.api.poll();
      const { events, next } = detectEvents(state.snapshot, result);
      state.snapshot = next;
      await this.processEvents(state, events);
      await this.store.write(state);
    } catch (error) {
      console.error('[Notifier poll error]', error);
    } finally {
      this.busy = false;
    }
  }

  private async processEvents(state: ServiceData, events: EventRecord[]): Promise<void> {
    for (const event of events) {
      if (state.sentDedupKeys.includes(event.dedupKey)) {
        continue;
      }

      const targets = state.subscriptions.filter((sub) => eventMatchesSubscription(event, sub));
      for (const sub of targets) {
        await this.deliverWithRetry(state, event, sub);
      }

      state.sentDedupKeys.push(event.dedupKey);
      if (state.sentDedupKeys.length > 1000) {
        state.sentDedupKeys = state.sentDedupKeys.slice(-1000);
      }
    }
  }

  private async deliverWithRetry(state: ServiceData, event: EventRecord, sub: Subscription): Promise<void> {
    const subject = `[Contest Notification] ${event.eventType} - ${event.contestName}`;
    const body = `${event.message}\n\nContest ID: ${event.contestId}\nEvent ID: ${event.id}\nTime: ${event.createdAt}`;

    const delivery: Delivery = {
      id: makeId('dly'),
      eventId: event.id,
      subscriptionId: sub.id,
      toEmail: sub.email,
      subject,
      body,
      status: 'PENDING',
      retries: 0,
      errorMessage: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    state.deliveries.push(delivery);

    let attempt = 0;
    while (attempt <= config.maxDeliveryRetries) {
      try {
        await this.mailer.send(sub.email, subject, body);
        delivery.status = 'SENT';
        delivery.updatedAt = nowIso();
        delivery.retries = attempt;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        delivery.status = 'FAILED';
        delivery.errorMessage = message;
        delivery.retries = attempt;
        delivery.updatedAt = nowIso();

        if (attempt >= config.maxDeliveryRetries) {
          return;
        }

        const delay = config.retryBaseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }

      attempt += 1;
    }
  }
}
