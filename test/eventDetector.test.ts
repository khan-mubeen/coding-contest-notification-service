import { describe, expect, it } from 'vitest';
import { detectEvents } from '../src/eventDetector.js';
import { PollResult, SnapshotState } from '../src/types.js';

const emptySnapshot: SnapshotState = {
  contestActive: {},
  submissionCount: {},
  topTeamByContest: {},
  scoreTotalByContest: {}
};

describe('detectEvents', () => {
  it('returns no events on first snapshot', () => {
    const result: PollResult = {
      contests: [{ id: 'c1', name: 'Contest 1', isActive: false, updatedAt: '2026-01-01T00:00:00Z' }],
      submissionsByContest: { c1: [] },
      scoresBySubmission: {}
    };

    const output = detectEvents(emptySnapshot, result);
    expect(output.events.length).toBe(0);
    expect(output.next.contestActive.c1).toBe(false);
  });

  it('detects activation and new submissions', () => {
    const previous: SnapshotState = {
      contestActive: { c1: false },
      submissionCount: { c1: 1 },
      topTeamByContest: { c1: null },
      scoreTotalByContest: { c1: 0 }
    };

    const result: PollResult = {
      contests: [{ id: 'c1', name: 'Contest 1', isActive: true, updatedAt: '2026-01-01T01:00:00Z' }],
      submissionsByContest: {
        c1: [
          { id: 's1', contestId: 'c1', teamId: 't1', status: 'SUBMITTED', updatedAt: '2026-01-01T01:00:00Z' },
          { id: 's2', contestId: 'c1', teamId: 't2', status: 'SUBMITTED', updatedAt: '2026-01-01T01:00:00Z' }
        ]
      },
      scoresBySubmission: {}
    };

    const output = detectEvents(previous, result);
    const types = output.events.map((event) => event.eventType);

    expect(types).toContain('CONTEST_BECAME_ACTIVE');
    expect(types).toContain('NEW_SUBMISSION');
  });
});
