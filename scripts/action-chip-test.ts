// npm run action-chip:test
// A button press in the thread (src/components/lib/harnessAction.ts): only a real tag at the start of a
// message is read; a typed, defused one is not; each kind the server writes reads as one plain sentence; an unknown
// kind has the generic words; the body Alma read is kept without the tag line.
import { actionLabel, actionTime, parseHarnessAction } from '../src/components/lib/harnessAction';
import { defuse } from '../src/lib/defuse';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const label = (text: string) => { const a = parseHarnessAction(text); return a ? actionLabel(a) : undefined; };
const is = (name: string, text: string, want: string) => { const got = label(text); ok(name, got === want, got); };

// parsing
const settled = '<harness-action kind="story-settled" version="v11"/> The user settled the story at v11 on the Story page: story/v11.md. Write the script from it now.';
const a = parseHarnessAction(settled);
ok('a real tag at the start is read', a?.kind === 'story-settled' && a.attrs.version === 'v11', a);
ok('the body is the rest, without the tag', a?.body === 'The user settled the story at v11 on the Story page: story/v11.md. Write the script from it now.', a?.body);
ok('the body keeps its later lines', parseHarnessAction('<harness-action kind="script-lock" version="v3"/> First.\n\nSecond.')?.body === 'First.\n\nSecond.');
ok('a defused tag typed by hand is not read', parseHarnessAction(defuse(settled)) === undefined);
ok('a tag later in a message is not read', parseHarnessAction(`hello ${settled}`) === undefined);
ok('plain words are not read', parseHarnessAction('Settle the story please') === undefined);
ok('a tag without a kind is not read', parseHarnessAction('<harness-action version="v2"/> x') === undefined);
ok('&quot; in a value is read back as "', parseHarnessAction('<harness-action kind="pick" what="take" target="s1" candidate="the &quot;long&quot; one"/> x')?.attrs.candidate === 'the "long" one');

// every kind the server writes (grep harness-action in src/server, src/lib, src/components/lib)
is('story settled', settled, 'You settled the story · v11');
is('script locked', '<harness-action kind="script-lock" version="v3"/> The user pressed "Lock v3".', 'You locked the script · v3');
is('script edited', '<harness-action kind="script-edited" version="v4" from="v3"/> The user edited the script.', 'You edited the script · v4');
is('new film', '<harness-action kind="new-film" slug="the-lighthouse"/> Title: …', 'You started a new film · The lighthouse');
is('debrief', '<harness-action kind="debrief" answered="5" skipped="1" open="0"/> The user sent their debrief answers.', 'You sent your debrief · 5 answers');
is('answers, several', '<harness-action kind="answers" count="3"/> The user is done choosing.', 'You sent 3 choices at once');
is('answers, one', '<harness-action kind="answers" count="1"/> x', 'You sent 1 choice at once');
is('answer: a pick on a card', '<harness-action kind="answer" ask="pick" card="c12" option="option 3"/> The user picked option 3 (Tobias bows) on the card “The end of Tobias’s lecture”, on the Story page.', 'You picked option 3 for The end of Tobias’s lecture');
is('answer: a yes', '<harness-action kind="answer" ask="yes" card="c2"/> The user said yes to the card “Use the same voice”, on x.', 'You said yes to Use the same voice');
is('answer: a go', '<harness-action kind="answer" ask="go" card="c3"/> The user gave the go for the card “the video” (40 cr), on x.', 'Go for the video');
is('answer: a no', '<harness-action kind="answer" ask="go" card="c3" option="no"/> The user pressed “Not now” (no) on the card “the video”, on x.', 'You said no to the video');
is('answer: a why', '<harness-action kind="answer" ask="why" card="c4" option="a"/> On the card “Why the cut”, the user tapped “Pace”, on x.', 'You said why on Why the cut');
is('answer: a why skipped', '<harness-action kind="answer" ask="why" card="c4" option="skip"/> On the card “Why the cut”, the user skipped the question, on x.', 'You skipped the why on Why the cut');
is('answer: no title in the words, the card ID', '<harness-action kind="answer" ask="yes" card="c9"/> x', 'You said yes to c9');
is('pick: a face', '<harness-action kind="pick" what="face" target="maren" candidate="3"/> The user picked 3 for maren\'s face.', 'You picked 3 for Maren’s face');
is('pick: a location is its master', '<harness-action kind="pick" what="location" target="agora" candidate="2"/> x', 'You picked 2 for Agora’s master');
is('pick: a take', '<harness-action kind="pick" what="take" target="s1-2" candidate="t4"/> x', 'You picked t4 for S1 2');
is('pick: from the library', '<harness-action kind="pick" what="voice" target="tobias" candidate="lib" source="library" library-id="x"/> The user picked Old Man from the library (Trial) for tobias\'s voice on x.', 'You picked Old Man from the library for Tobias’s voice');
is('pick: a sound try', '<harness-action kind="pick" what="sfx" target="cheer-toast" candidate="2"/> x', 'You picked try 2 of Cheer toast');
is('pick: no sound try', '<harness-action kind="pick" what="sfx" target="cheer-toast" candidate="none"/> x', 'You took none of the tries of Cheer toast');
is('an unknown kind', '<harness-action kind="cut-rendered" v="2"/> x', 'You pressed a button: cut rendered');

// the time
const t = actionTime(new Date(2026, 10, 21, 9, 5).toISOString());
ok('the time is the local hh:mm', t === '09:05', t);
ok('a bad time is empty', actionTime('nope') === '');

console.log(`${n - bad}/${n} ok`);
if (bad) process.exit(1);
