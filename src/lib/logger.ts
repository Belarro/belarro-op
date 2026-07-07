// PHASE 3: persistent error logging.
//
// logError() writes a row to belarro_v4_error_log so API failures are visible
// in /admin/error-log instead of vanishing into console.error(). It is
// intentionally best-effort and never throws: a logging failure must not turn a
// handled 500 into an unhandled crash.

import { fetchFromSupabase } from '@/lib/supabase';

export interface LogErrorContext {
  /** HTTP status returned to the client, e.g. 500. */
  status?: number;
  /** Authenticated user id, if known. */
  userId?: string | null;
}

/**
 * Persist an error to belarro_v4_error_log.
 *
 * @param endpoint  Human-readable route id, e.g. "POST /api/customers".
 * @param error     The caught error (Error | unknown).
 * @param ctx       Optional status + user id.
 */
export async function logError(
  endpoint: string,
  error: unknown,
  ctx: LogErrorContext = {}
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;

  // Always keep the console line — useful in local dev / server logs.
  console.error(`[${endpoint}]`, message);

  try {
    await fetchFromSupabase('/belarro_v4_error_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        endpoint,
        status: ctx.status ?? null,
        message,
        stack,
        user_id: ctx.userId ?? null,
      }),
    });
  } catch (logFailure) {
    // Never let logging break the request path.
    console.error('[logger] failed to persist error log:', logFailure);
  }
}
