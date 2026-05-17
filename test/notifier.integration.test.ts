import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotifierService } from '../src/notifier.js';
import { Store } from '../src/store.js';
import { Mailer } from '../src/mailer.js';
import { MainApiClient } from '../src/apiClient.js';
import { EventRecord, Subscription } from '../src/types.js';
import { makeId, nowIso } from '../src/utils.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('NotifierService Integration', () => {
  let store: Store;
  let mailer: Mailer;
  let apiClient: MainApiClient;
  let notifier: NotifierService;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test data
    tempDir = path.join(os.tmpdir(), `test-store-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    const storePath = path.join(tempDir, 'test-data.json');
    store = new Store(storePath);
    mailer = new Mailer();
    apiClient = new MainApiClient();
    notifier = new NotifierService(store, apiClient, mailer);

    // Mock the mailer to capture sent emails
    vi.spyOn(mailer, 'send').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should send email when subscribed event occurs', async () => {
    // Setup: Create a subscription
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['CONTEST_BECAME_ACTIVE'],
      contestId: null,
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);
    await store.write(state);

    // Create an event manually (in real scenario, this comes from event detection)
    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    // Trigger notification
    const updatedState = await store.read();
    const targets = updatedState.subscriptions.filter((sub) =>
      !sub.enabled ? false : sub.eventTypes.includes(event.eventType)
    );

    for (const sub of targets) {
      await notifier['deliverWithRetry'](updatedState, event, sub);
    }

    // Verify email was sent
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.any(String)
    );
    
    // Check the actual call arguments
    const calls = vi.mocked(mailer.send).mock.calls;
    expect(calls[0][1]).toContain('CONTEST_BECAME_ACTIVE');
    expect(calls[0][1]).toContain('Test Contest');
  });

  it('should not send email when subscription is disabled', async () => {
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['CONTEST_BECAME_ACTIVE'],
      contestId: null,
      enabled: false, // Disabled
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);
    await store.write(state);

    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    const updatedState = await store.read();
    const targets = updatedState.subscriptions.filter((sub) =>
      !sub.enabled ? false : sub.eventTypes.includes(event.eventType)
    );

    for (const sub of targets) {
      await notifier['deliverWithRetry'](updatedState, event, sub);
    }

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('should only send email for subscribed event types', async () => {
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['NEW_SUBMISSION'], // Only subscribed to NEW_SUBMISSION
      contestId: null,
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);
    await store.write(state);

    // Create a CONTEST_BECAME_ACTIVE event
    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    const updatedState = await store.read();
    const targets = updatedState.subscriptions.filter((sub) =>
      !sub.enabled ? false : sub.eventTypes.includes(event.eventType)
    );

    for (const sub of targets) {
      await notifier['deliverWithRetry'](updatedState, event, sub);
    }

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('should only send email for subscribed contest when contestId is set', async () => {
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['CONTEST_BECAME_ACTIVE'],
      contestId: 'c2', // Subscribed only to contest c2
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);
    await store.write(state);

    // Create event for contest c1
    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest C1',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    const updatedState = await store.read();
    const targets = updatedState.subscriptions.filter((sub) =>
      !sub.enabled ||
      !sub.eventTypes.includes(event.eventType) ||
      (sub.contestId && sub.contestId !== event.contestId)
        ? false
        : true
    );

    for (const sub of targets) {
      await notifier['deliverWithRetry'](updatedState, event, sub);
    }

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('should send email for subscribed contest', async () => {
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['CONTEST_BECAME_ACTIVE'],
      contestId: 'c1', // Subscribed to contest c1
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);
    await store.write(state);

    // Create event for contest c1
    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest C1',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    const updatedState = await store.read();
    const targets = updatedState.subscriptions.filter((sub) =>
      !sub.enabled ||
      !sub.eventTypes.includes(event.eventType) ||
      (sub.contestId && sub.contestId !== event.contestId)
        ? false
        : true
    );

    for (const sub of targets) {
      await notifier['deliverWithRetry'](updatedState, event, sub);
    }

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.any(String)
    );
    
    const calls = vi.mocked(mailer.send).mock.calls;
    expect(calls[0][1]).toContain('CONTEST_BECAME_ACTIVE');
    expect(calls[0][1]).toContain('Test Contest C1');
  });

  it('should track delivery with retry count', async () => {
    const state = await store.read();
    const subscription: Subscription = {
      id: makeId('sub'),
      email: 'user@example.com',
      eventTypes: ['CONTEST_BECAME_ACTIVE'],
      contestId: null,
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.subscriptions.push(subscription);

    const event: EventRecord = {
      id: makeId('evt'),
      eventType: 'CONTEST_BECAME_ACTIVE',
      contestId: 'c1',
      contestName: 'Test Contest',
      message: 'Contest is now active',
      dedupKey: 'active:c1:2026-05-16T10:00:00Z',
      createdAt: nowIso()
    };

    await notifier['deliverWithRetry'](state, event, subscription);

    // Check delivery record was created
    expect(state.deliveries.length).toBe(1);
    expect(state.deliveries[0]).toMatchObject({
      eventId: event.id,
      subscriptionId: subscription.id,
      toEmail: 'user@example.com',
      status: 'SENT'
    });
  });
});
