// The intro choice as the server keeps it (harness/step-intros.json, src/server/intros.ts), shared by the client.

export interface IntroPrefs {
  /** Every intro hidden (the Settings switch "Step intros" off). */
  off: boolean;
  /** Steps whose intro was hidden on its own (while the switch is on). */
  hidden: string[];
  /** Steps whose intro was brought back on its own (while the switch is off). */
  shown: string[];
}

/** Whether a step's intro shows. */
export function introShows(p: IntroPrefs, step: string): boolean {
  return p.off ? p.shown.includes(step) : !p.hidden.includes(step);
}
