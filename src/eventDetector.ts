import { ComputedLeaderboard, EventRecord, PollResult, SnapshotState } from './types.js';
import { makeId, nowIso } from './utils.js';

const computeLeaderboard = (contestId: string, data: PollResult): ComputedLeaderboard => {
  const submissions = data.submissionsByContest[contestId] ?? [];
  const scoreByTeam: Record<string, number> = {};

  for (const submission of submissions) {
    const scores = data.scoresBySubmission[submission.id] ?? [];
    const total = scores.reduce((sum, value) => sum + value.score, 0);
    scoreByTeam[submission.teamId] = (scoreByTeam[submission.teamId] ?? 0) + total;
  }

  let topTeamId: string | null = null;
  let topScore = -1;

  for (const [teamId, score] of Object.entries(scoreByTeam)) {
    if (score > topScore) {
      topScore = score;
      topTeamId = teamId;
    }
  }

  const totalScore = Object.values(scoreByTeam).reduce((sum, v) => sum + v, 0);
  return { topTeamId, totalScore };
};

export const detectEvents = (
  previous: SnapshotState,
  data: PollResult
): { events: EventRecord[]; next: SnapshotState } => {
  const events: EventRecord[] = [];
  const next: SnapshotState = {
    contestActive: { ...previous.contestActive },
    submissionCount: { ...previous.submissionCount },
    topTeamByContest: { ...previous.topTeamByContest },
    scoreTotalByContest: { ...previous.scoreTotalByContest }
  };

  for (const contest of data.contests) {
    const contestId = contest.id;
    const contestName = contest.name;

    const prevActive = previous.contestActive[contestId];
    if (prevActive !== undefined && prevActive === false && contest.isActive === true) {
      events.push({
        id: makeId('evt'),
        eventType: 'CONTEST_BECAME_ACTIVE',
        contestId,
        contestName,
        message: `Contest '${contestName}' is now active.`,
        dedupKey: `active:${contestId}:${contest.updatedAt}`,
        createdAt: nowIso()
      });
    }
    next.contestActive[contestId] = contest.isActive;

    const submissionCount = (data.submissionsByContest[contestId] ?? []).length;
    const prevCount = previous.submissionCount[contestId];
    if (prevCount !== undefined && submissionCount > prevCount) {
      events.push({
        id: makeId('evt'),
        eventType: 'NEW_SUBMISSION',
        contestId,
        contestName,
        message: `Contest '${contestName}' has ${submissionCount - prevCount} new submission(s).`,
        dedupKey: `submission:${contestId}:${submissionCount}`,
        createdAt: nowIso()
      });
    }
    next.submissionCount[contestId] = submissionCount;

    const board = computeLeaderboard(contestId, data);
    const prevTop = previous.topTeamByContest[contestId] ?? null;
    if (prevTop !== null && board.topTeamId !== null && prevTop !== board.topTeamId) {
      events.push({
        id: makeId('evt'),
        eventType: 'LEADERBOARD_TOP_CHANGED',
        contestId,
        contestName,
        message: `Contest '${contestName}' has a new top team.`,
        dedupKey: `leader:${contestId}:${board.topTeamId}:${board.totalScore}`,
        createdAt: nowIso()
      });
    }
    next.topTeamByContest[contestId] = board.topTeamId;

    const prevTotal = previous.scoreTotalByContest[contestId];
    if (prevTotal !== undefined && board.totalScore !== prevTotal) {
      events.push({
        id: makeId('evt'),
        eventType: 'RESULTS_UPDATED',
        contestId,
        contestName,
        message: `Contest '${contestName}' scores changed (${prevTotal} -> ${board.totalScore}).`,
        dedupKey: `results:${contestId}:${board.totalScore}`,
        createdAt: nowIso()
      });
    }
    next.scoreTotalByContest[contestId] = board.totalScore;
  }

  return { events, next };
};
