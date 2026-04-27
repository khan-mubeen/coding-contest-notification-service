import crypto from 'crypto';

export const nowIso = (): string => new Date().toISOString();

export const makeId = (prefix: string): string => {
  return `${prefix}_${crypto.randomUUID()}`;
};

export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};
