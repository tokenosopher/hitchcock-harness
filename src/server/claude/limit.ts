// Claude Code's words when a plan limit stops a turn ("You've hit your weekly limit · resets …"; 2.1.330 says
// "5-hour limit" for the session window). No server imports: the thread in the browser uses it to offer the reserve
// switch.
export function isUsageLimitText(text: string): boolean {
  return /hit your (session|5-hour|weekly|usage|usage credit|opus|sonnet|fable|haiku) limit|usage limit reached/i.test(text);
}

/** The harness's line when Alma moved to another account (accounts.ts): the limit no longer stops her. */
const ACCOUNT_MOVED = /^(Alma moved to |Alma resumes on )/;

/** True when the last turn (after the last user message) ended with the usage-limit words and Alma was not moved to
 *  another account since. */
export function lastTurnHitLimit(events: readonly { kind: string; text?: string }[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'user') return false;
    if (e.kind === 'system' && e.text && ACCOUNT_MOVED.test(e.text)) return false;
    if ((e.kind === 'assistant_text' || e.kind === 'error' || e.kind === 'system') && e.text && isUsageLimitText(e.text)) return true;
  }
  return false;
}
