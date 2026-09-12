/**
 * In-memory session store.
 *
 * Deliberately NOT a database. This is a personal tool doing a handful of
 * sessions at a desk; results live in the server process and are gone on
 * restart. That is an acceptable trade for now and an explicit one — the
 * alternative was a migration, a connection string and a schema to maintain
 * before the first real rehearsal had happened.
 *
 * It exists because without it a real session's analysis was computed and
 * then discarded, and the user was shown the scripted demo report instead.
 */
import type { AnalyseResult } from '@/analysis/pipeline';
import type { RetryComparison } from '@/analysis/compare';
import type { Lang, Transcript } from '@/lib/types';

export interface StoredAttempt {
  transcript: Transcript;
  result: AnalyseResult;
}

export interface StoredSession {
  id: string;
  createdAt: string;
  language: Lang;
  scenarioId: string;
  personaId: string;
  scenarioLabel: string;
  personaLabel: string;
  rubric: { id: string; version: number; status: string };
  /** Pinned so a retry asks the same opening question. */
  openingQuestionId: string;
  attempt1: StoredAttempt;
  /** Present once a retry has been completed against this session. */
  attempt2?: StoredAttempt;
  comparison?: RetryComparison;
  /** Set on the retry session, pointing back at the original. */
  retryOf?: string;
}

/**
 * Pinned to globalThis, NOT a plain module-level Map.
 *
 * The custom server loads this file through tsx while Next.js loads it again
 * from the compiled bundle for the app routes. Those are two separate module
 * instances, so a plain `const sessions = new Map()` gives the WebSocket
 * server and the report page a Map each: sessions were written to one and read
 * from the other, and every real report 404'd while the store itself looked
 * perfectly correct.
 */
const globalStore = globalThis as typeof globalThis & {
  __executiveMirrorSessions?: Map<string, StoredSession>;
};
const sessions: Map<string, StoredSession> =
  globalStore.__executiveMirrorSessions ??
  (globalStore.__executiveMirrorSessions = new Map<string, StoredSession>());

/** Keep the process from growing without bound over a long-running dev server. */
const MAX_SESSIONS = 50;

export function saveSession(s: StoredSession): void {
  sessions.set(s.id, s);
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (oldest) sessions.delete(oldest.id);
  }
}

export function getSession(id: string): StoredSession | undefined {
  return sessions.get(id);
}

export function listSessions(): StoredSession[] {
  return [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Attach a completed retry to its original and store the comparison. */
export function attachRetry(
  originalId: string,
  attempt: StoredAttempt,
  comparison: RetryComparison,
): boolean {
  const original = sessions.get(originalId);
  if (!original) return false;
  original.attempt2 = attempt;
  original.comparison = comparison;
  return true;
}
