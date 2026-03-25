import type { Task } from '../types';

/**
 * Prepares a Partial<Task> for sending to the server.
 *
 * Optional fields that are `undefined` are silently dropped by JSON.stringify,
 * meaning a cleared value never reaches the server and the old DB value
 * survives.  This function converts those fields to `null` so they are
 * explicitly present in the request body.
 */
export function normalizeTaskForUpdate(updates: Partial<Task>): Omit<Partial<Task>, 'fixedStartTime' | 'tag' | 'details'> & { fixedStartTime: string | null; tag: string | null; details: string | null } {
  const { fixedStartTime, tag, details, ...rest } = updates;
  return {
    ...rest,
    fixedStartTime: fixedStartTime ?? null,
    tag: tag ?? null,
    details: details ?? null,
  };
}
