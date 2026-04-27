import fs from 'fs/promises';
import path from 'path';
import { ServiceData } from './types.js';

const initialState = (): ServiceData => ({
  subscriptions: [],
  deliveries: [],
  sentDedupKeys: [],
  snapshot: {
    contestActive: {},
    submissionCount: {},
    topTeamByContest: {},
    scoreTotalByContest: {}
  }
});

export class Store {
  constructor(private readonly filePath: string) {}

  async read(): Promise<ServiceData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as ServiceData;
    } catch {
      const state = initialState();
      await this.write(state);
      return state;
    }
  }

  async write(data: ServiceData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
