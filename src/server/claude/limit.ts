// Claude Code's words when a plan limit stops a turn ("You've hit your weekly limit · resets …"). No server
// imports: the thread in the browser uses it to offer the reserve switch.
export function isUsageLimitText(text: string): boolean {
  return /hit your (session|weekly|usage|opus|sonnet|fable) limit|usage limit reached/i.test(text);
}
