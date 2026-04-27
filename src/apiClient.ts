import { config } from './config.js';
import { Contest, PollResult, Score, Submission } from './types.js';

interface PageResponse<T> {
  data: T[];
  hasNextPage: boolean;
}

export class MainApiClient {
  private readonly base = `${config.apiBaseUrl.replace(/\/$/, '')}${config.apiPrefix.startsWith('/') ? config.apiPrefix : `/${config.apiPrefix}`}`;

  async poll(): Promise<PollResult> {
    const contests = await this.getAllPages<Contest>('/contests');
    const submissionsByContest: Record<string, Submission[]> = {};
    const scoresBySubmission: Record<string, Score[]> = {};

    for (const contest of contests) {
      const submissions = await this.getAllPages<Submission>(`/contests/${contest.id}/submissions`);
      submissionsByContest[contest.id] = submissions;

      for (const submission of submissions) {
        scoresBySubmission[submission.id] = await this.getAllPages<Score>(`/submissions/${submission.id}/scores`);
      }
    }

    return { contests, submissionsByContest, scoresBySubmission };
  }

  private async getAllPages<T>(endpoint: string): Promise<T[]> {
    const result: T[] = [];
    let page = 1;

    while (true) {
      const url = new URL(`${this.base}${endpoint}`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', '50');

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiToken}`
        },
        signal: AbortSignal.timeout(config.requestTimeoutMs)
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Main API ${response.status} on ${endpoint}: ${body}`);
      }

      const json = (await response.json()) as PageResponse<T>;
      result.push(...json.data);

      if (!json.hasNextPage) {
        break;
      }

      page += 1;
    }

    return result;
  }
}
