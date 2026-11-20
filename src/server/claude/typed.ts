// Keeps what a person typed from passing for one of the harness's own button presses.

/** Text a person wrote (a chat message, a card's note, a film's idea, a page name sent by the browser): a
 *  <harness-action …/> tag inside it is shown to Alma as typed text, never as a button press. Only the harness's own
 *  actions write that tag (src/server/actions/), and Alma's standing prompt takes it as the user's yes, pick or go. */
export function asTyped(text: string): string {
  return text.replace(/<(\/?)(harness-action)/gi, '‹$1$2');
}
