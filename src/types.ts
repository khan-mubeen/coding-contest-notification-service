export type EventType =
  | 'CONTEST_BECAME_ACTIVE'
  | 'NEW_SUBMISSION'
  | 'LEADERBOARD_TOP_CHANGED'
  | 'RESULTS_UPDATED';

export interface Contest {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
}

export interface Submission {
  id: string;
  contestId: string;
  teamId: string;
  status: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  submissionId: string;
  score: number;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  email: string;
  contestId: string | null;
  eventTypes: EventType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface Delivery {
  id: string;
  eventId: string;
  subscriptionId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: DeliveryStatus;
  retries: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  eventType: EventType;
  contestId: string;
  contestName: string;
  message: string;
  dedupKey: string;
  createdAt: string;
}

export interface SnapshotState {
  contestActive: Record<string, boolean>;
  submissionCount: Record<string, number>;
  topTeamByContest: Record<string, string | null>;
  scoreTotalByContest: Record<string, number>;
}

export interface ServiceData {
  subscriptions: Subscription[];
  deliveries: Delivery[];
  sentDedupKeys: string[];
  snapshot: SnapshotState;
}

export interface PollResult {
  contests: Contest[];
  submissionsByContest: Record<string, Submission[]>;
  scoresBySubmission: Record<string, Score[]>;
}

export interface ComputedLeaderboard {
  topTeamId: string | null;
  totalScore: number;
}
