// Which check covers what: one row per unit check (scripts/*-test.ts), read by tests/run.mjs. tests/README.md says how
// to run them; keep this file up to date when you add, move or rename a check or the code it checks.
//
//   file    the check (a unit script under scripts/)
//   tier    'quick'  runs in `npm run test:quick` (a few seconds at most)
//           'slow'   runs only in `npm run test:slow`, or in `test:changed` when what it covers changed
//   covers  the source files it checks, as globs (** any folders, * any name): `test:changed` runs it when one changed
//   secs    about how long it takes on its own (the runner starts the longest first)

const CHARACTERS = ['src/components/characters/**', 'src/components/pages/Character*.tsx', 'src/server/films/read/cast.ts', 'src/app/films/*/character/**'];
const LEFT = ['src/components/edit/left.ts', 'src/components/edit/leftInput.ts', 'src/server/edit/left.ts', 'src/fixtures/left.ts', 'src/components/flow/waitList.ts'];
const TAKES = ['src/components/edit/shots.ts', 'src/server/edit/shots.ts', 'src/fixtures/shots.ts'];

export default [
  { file: 'scripts/accounts-test.ts', tier: 'quick', covers: ['src/server/claude/accounts.ts', 'src/server/claude/process.ts', 'src/server/claude/limit.ts', 'src/server/claude/stream.ts', 'src/server/claude/transcript.ts'], secs: 2 },
  { file: 'scripts/action-chip-test.ts', tier: 'quick', covers: ['src/components/lib/harnessAction.ts', 'src/components/shell/ActionChip.tsx'], secs: 1 },
  { file: 'scripts/afterlock-test.ts', tier: 'quick', covers: ['src/components/lib/making.ts', 'src/components/flow/Making.tsx', 'src/components/edit/early.ts', 'src/components/lib/derive.ts', 'src/server/films/read/cast.ts', 'src/server/films/read/locations.ts', 'src/fixtures/afterlock.ts'], secs: 1 },
  { file: 'scripts/alma-drop-test.ts', tier: 'slow', covers: ['src/server/edit/alma-drop.ts', 'src/server/edit/working*.ts', 'src/server/edit/watch.ts', 'src/server/edit/timeline.ts'], secs: 9 },
  { file: 'scripts/almaoutbox-test.ts', tier: 'quick', covers: ['src/components/data/almaOutbox.ts', 'src/components/data/thread.tsx'], secs: 1 },
  { file: 'scripts/answer-test.ts', tier: 'quick', covers: ['src/server/actions/answer*.ts', 'src/server/films/read/feed.ts'], secs: 1 },
  { file: 'scripts/askmedia-test.ts', tier: 'quick', covers: ['src/components/feed/askMedia.ts', 'src/components/feed/Feed.tsx'], secs: 1 },
  { file: 'scripts/board-test.ts', tier: 'quick', covers: ['src/components/lib/flow.ts', 'src/components/lib/derive.ts', 'src/components/characters/Cards.tsx', 'src/server/films/read/master.ts', 'src/server/films/read/feed.ts', 'src/fixtures/cast.ts'], secs: 1 },
  { file: 'scripts/cancel-render-test.ts', tier: 'slow', covers: ['src/server/edit/render*.ts', 'src/app/api/films/*/cut/render/**'], secs: 5 },
  { file: 'scripts/cast-test.ts', tier: 'quick', covers: [...CHARACTERS, 'src/components/lib/derive.ts'], secs: 1 },
  { file: 'scripts/chips-test.ts', tier: 'quick', covers: ['src/components/data/ui.tsx', 'src/server/context.ts', 'src/server/claude/thread.ts'], secs: 1 },
  { file: 'scripts/controls-test.ts', tier: 'quick', covers: ['src/components/edit/controls.ts', 'src/components/edit/model.ts'], secs: 1 },
  { file: 'scripts/drag-take-test.ts', tier: 'quick', covers: ['src/components/edit/dragTake.ts', 'src/components/edit/placeFile.ts', 'src/components/edit/shots.ts'], secs: 1 },
  { file: 'scripts/editwork-test.ts', tier: 'quick', covers: ['src/components/lib/editWork.ts', 'src/server/films/read/pickups.ts', 'src/components/flow/FlowBoard.tsx', 'src/fixtures/left.ts'], secs: 1 },
  { file: 'scripts/elements-test.ts', tier: 'quick', covers: ['src/components/lib/derive.ts', 'src/components/pages/ElementsPage.tsx', 'src/components/characters/Cards.tsx', 'src/server/films/read/cast.ts', 'src/fixtures/elements.ts'], secs: 1 },
  { file: 'scripts/files-test.ts', tier: 'slow', covers: ['src/server/edit/files.ts', 'src/components/edit/placeFile.ts', 'src/components/edit/model.ts', 'src/fixtures/files.ts'], secs: 21 },
  { file: 'scripts/fixes-test.ts', tier: 'quick', covers: ['src/components/edit/model.ts', 'src/components/edit/shots.ts', 'src/components/edit/controls.ts'], secs: 1 },
  { file: 'scripts/folder-test.ts', tier: 'quick', covers: ['src/server/films/folder.ts', 'src/app/api/films/*/folder/route.ts', 'src/components/shell/MoreMenu.tsx'], secs: 1 },
  { file: 'scripts/harden-test.ts', tier: 'quick', covers: ['src/proxy.ts', 'src/lib/defuse.ts', 'src/server/claude/thread.ts', 'src/server/context.ts', 'src/server/actions/progress.ts', 'src/server/edit/timeline.ts', 'src/server/childEnv.ts', 'src/server/claude/redact.ts', 'src/components/lib/debrief.ts'], secs: 2 },
  { file: 'scripts/history-list-test.ts', tier: 'quick', covers: ['src/components/edit/historyList.ts', 'src/components/edit/history.ts'], secs: 1 },
  { file: 'scripts/keyboard-test.ts', tier: 'quick', covers: ['src/components/shell/keyboard.ts', 'src/components/shell/ThreadColumn.tsx'], secs: 1 },
  { file: 'scripts/layouts-test.ts', tier: 'quick', covers: ['src/components/edit/layouts.ts', 'src/server/edit/layouts.ts', 'src/server/edit/plan.ts', 'src/components/edit/planned.ts', 'src/components/edit/LayoutsBar.tsx', 'src/fixtures/day1.ts'], secs: 1 },
  { file: 'scripts/left-test.ts', tier: 'quick', covers: [...LEFT], secs: 1 },
  { file: 'scripts/library-save-test.ts', tier: 'quick', covers: ['src/server/library/save.ts', 'src/server/library/sources.ts', 'src/server/library/store.ts', 'src/app/api/library/**', 'src/fixtures/library.ts'], secs: 2 },
  { file: 'scripts/link-test.ts', tier: 'quick', covers: ['src/components/edit/model.ts', 'src/components/edit/dragTake.ts', 'src/components/edit/placeFile.ts', 'src/server/edit/timeline.ts'], secs: 1 },
  { file: 'scripts/marks-test.ts', tier: 'quick', covers: ['src/server/edit/marks.ts', 'src/components/edit/marks.ts', 'src/server/context.ts'], secs: 1 },
  { file: 'scripts/master-test.ts', tier: 'quick', covers: ['src/server/films/registry.ts', 'src/server/films/read/master.ts', 'src/server/films/read/post.ts', 'src/server/films/read/feed.ts', 'src/server/edit/state.ts', 'src/server/release/final.ts', 'src/components/edit/fullsize.ts', 'src/components/edit/sameCut.ts'], secs: 1 },
  { file: 'scripts/ondemand-test.ts', tier: 'slow', covers: ['src/server/edit/render*.ts', 'src/server/edit/watch.ts', 'src/server/edit/working*.ts', 'src/server/edit/alma-drop.ts'], secs: 11 },
  { file: 'scripts/one-alma-test.ts', tier: 'quick', covers: ['src/server/claude/procs.ts', 'src/server/claude/process.ts', 'src/server/context.ts'], secs: 4 },
  { file: 'scripts/openat-test.ts', tier: 'quick', covers: ['src/components/edit/openAt.ts', 'src/components/edit/seenTakes.ts', 'src/components/edit/cutLink.ts', 'src/components/feed/CutButton.tsx', 'src/server/films/read/feed.ts'], secs: 1 },
  { file: 'scripts/pages-test.ts', tier: 'quick', covers: ['src/server/films/read/cast.ts', 'src/server/films/read/script.ts', 'src/server/films/read/locations.ts', 'src/server/films/read/review.ts', 'src/components/edit/left.ts', 'src/components/edit/planned.ts', 'src/server/edit/plan.ts', 'src/server/actions/taste.ts', 'src/server/actions/answer.ts', 'src/server/actions/pick.ts', 'src/server/claude/process.ts'], secs: 2 },
  { file: 'scripts/pending-sends-test.ts', tier: 'quick', covers: ['src/components/data/pendingSends.ts', 'src/components/data/thread.tsx', 'src/components/shell/Composer.tsx'], secs: 1 },
  { file: 'scripts/phonebar-test.ts', tier: 'quick', covers: ['src/components/shell/phoneBar.ts', 'src/components/shell/ThreadColumn.tsx'], secs: 1 },
  { file: 'scripts/phonefull-test.ts', tier: 'quick', covers: ['src/components/edit/phoneFull.ts'], secs: 1 },
  { file: 'scripts/pickupqc-test.ts', tier: 'quick', covers: ['src/components/lib/pickupCheck.ts', 'src/components/qc/QCPanel.tsx', 'src/components/qc/targets.ts', 'src/fixtures/left.ts'], secs: 1 },
  { file: 'scripts/port-test.ts', tier: 'quick', covers: ['recipes/**', 'studio/flow/**', 'studio/CLAUDE.md', 'studio/.claude/**', 'studio/tools/**', 'src/server/config.ts', 'src/server/claude/process.ts'], secs: 2 },
  { file: 'scripts/quiet-turns-test.ts', tier: 'quick', covers: ['src/server/claude/quietTurns.ts', 'src/server/claude/process.ts', 'src/server/claude/transcript.ts', 'src/components/data/thread.tsx'], secs: 1 },
  { file: 'scripts/recent-test.ts', tier: 'quick', covers: ['src/server/films/recent.ts', 'src/components/shell/recent.ts', 'src/components/shell/Sidebar.tsx', 'src/app/api/films/recent/route.ts'], secs: 1 },
  { file: 'scripts/recipes-test.ts', tier: 'quick', covers: ['recipes/**', 'src/components/lib/derive.ts', 'src/components/lib/qc.ts', 'src/components/release/**', 'src/server/recipes.ts', 'src/server/claude/process.ts', 'src/server/films/read/release.ts', 'src/server/edit/alma-drop.ts', 'src/lib/script-edit.ts'], secs: 1 },
  { file: 'scripts/refblock-test.ts', tier: 'quick', covers: ['src/lib/refs.ts', 'src/components/lib/refPick.ts', 'src/components/lib/refBlock.ts', 'src/components/release/refs.ts'], secs: 1 },
  { file: 'scripts/refs-test.ts', tier: 'quick', covers: ['src/lib/refs.ts', 'src/components/lib/refPick.ts', 'src/components/shell/refItems.ts', 'src/components/shell/refPicking.ts'], secs: 1 },
  { file: 'scripts/release-choices-test.ts', tier: 'quick', covers: ['src/components/release/choices.ts', 'src/components/release/ops.ts', 'src/components/release/file.ts', 'src/fixtures/release.ts'], secs: 1 },
  { file: 'scripts/release-waits-test.ts', tier: 'quick', covers: ['src/components/edit/left.ts', 'src/components/lib/derive.ts', 'src/components/lib/flow.ts', 'src/components/flow/waitList.ts', 'src/components/lib/sent.ts', 'src/components/release/alma.ts', 'src/server/films/read/post.ts', 'src/fixtures/left.ts'], secs: 1 },
  { file: 'scripts/remove-test.ts', tier: 'quick', covers: ['src/components/lib/remove.ts', 'src/server/actions/removed.ts', 'src/components/lib/derive.ts', 'src/components/data/choices.ts', 'src/app/api/films/*/done/route.ts', 'src/fixtures/removed.ts'], secs: 1 },
  { file: 'scripts/render-test.ts', tier: 'slow', covers: ['src/server/edit/render*.ts', 'src/server/edit/timeline.ts', 'src/server/edit/probe.ts', 'src/components/edit/fullsize.ts', 'src/components/edit/renderAsk.ts', 'src/components/edit/masters.ts'], secs: 70 },
  { file: 'scripts/renders-test.ts', tier: 'quick', covers: ['src/components/edit/renderList.ts', 'src/server/edit/render-files.ts', 'src/components/edit/masters.ts', 'src/components/edit/fullsize.ts', 'src/fixtures/renders.ts'], secs: 1 },
  { file: 'scripts/reserve-test.ts', tier: 'quick', covers: ['src/server/claude/reserve.ts', 'src/server/claude/limit.ts', 'src/server/claude/process.ts'], secs: 2 },
  { file: 'scripts/resumed-test.ts', tier: 'quick', covers: ['src/server/claude/stream.ts', 'src/server/claude/tasks.ts', 'src/server/claude/transcript.ts'], secs: 1 },
  { file: 'scripts/samecut-test.ts', tier: 'quick', covers: ['src/components/edit/sameCut.ts'], secs: 1 },
  { file: 'scripts/script-cards-test.ts', tier: 'quick', covers: ['src/lib/script-cards.ts', 'src/lib/script-edit.ts', 'src/components/pages/ScriptPanel.tsx'], secs: 1 },
  { file: 'scripts/security-test.ts', tier: 'quick', covers: ['src/proxy.ts', 'src/lib/defuse.ts', 'src/server/claude/thread.ts', 'src/server/claude/reserve.ts', 'src/server/claude/redact.ts', 'src/server/childEnv.ts', 'src/server/uploads.ts', 'src/server/actions/progress.ts', 'src/app/api/films/*/progress/route.ts', 'src/server/edit/timeline.ts', 'src/server/library/sources.ts', 'src/server/library/store.ts'], secs: 2 },
  { file: 'scripts/sent-test.ts', tier: 'quick', covers: ['src/server/films/read/sent.ts', 'src/components/go/SentPanel.tsx', 'src/fixtures/sent.ts', 'src/server/films/read/scenes.ts'], secs: 1 },
  { file: 'scripts/sheet-voice-test.ts', tier: 'quick', covers: ['src/components/lib/sheetVoice.ts', 'src/components/characters/SheetVoice.tsx'], secs: 1 },
  { file: 'scripts/sheet-yes-test.ts', tier: 'quick', covers: ['src/components/lib/approve.ts', 'src/components/data/choices.ts', 'src/app/api/films/*/done/route.ts', 'src/fixtures/cast.ts'], secs: 1 },
  { file: 'scripts/shot-views-test.ts', tier: 'quick', covers: ['src/server/films/read/shotViews.ts', 'src/server/films/read/scenes.ts', 'src/components/media/ViewThumb.tsx', 'src/components/edit/ShotViews.tsx'], secs: 1 },
  { file: 'scripts/shots-out-test.ts', tier: 'quick', covers: [...TAKES, 'src/components/edit/model.ts'], secs: 1 },
  { file: 'scripts/sound-test.ts', tier: 'quick', covers: ['src/components/edit/model.ts'], secs: 1 },
  { file: 'scripts/soundpick-test.ts', tier: 'quick', covers: ['src/server/films/read/sfx.ts', 'src/components/feed/soundPick.ts', 'src/components/feed/SoundPicks.tsx', 'src/components/edit/reasons.ts', 'src/components/lib/debrief.ts', 'src/server/actions/answer.ts', 'src/server/actions/pick.ts', 'src/server/actions/filmfiles.ts', 'src/server/films/read/feed.ts', 'src/fixtures/soundpick.ts'], secs: 1 },
  { file: 'scripts/story-ref-test.ts', tier: 'quick', covers: ['src/components/pages/storyRef.ts', 'src/components/pages/StoryEditor.tsx'], secs: 1 },
  { file: 'scripts/story-settled-test.ts', tier: 'quick', covers: ['src/lib/story-settled.ts', 'src/server/films/state.ts', 'src/fixtures/story.ts'], secs: 1 },
  { file: 'scripts/story-test.ts', tier: 'quick', covers: ['src/server/films/read/story.ts', 'src/server/actions/story.ts'], secs: 1 },
  { file: 'scripts/story-waits-test.ts', tier: 'quick', covers: ['src/components/lib/derive.ts', 'src/components/lib/flow.ts', 'src/components/flow/waitList.ts', 'src/fixtures/story.ts'], secs: 1 },
  { file: 'scripts/subs-test.ts', tier: 'quick', covers: ['src/components/edit/subs*.ts', 'src/components/edit/model.ts', 'src/server/edit/timeline.ts'], secs: 1 },
  { file: 'scripts/takecols-test.ts', tier: 'quick', covers: ['src/components/edit/shotCols.ts', 'src/components/edit/shots.ts', 'src/server/edit/shots.ts', 'src/components/edit/ShotViews.tsx', 'src/fixtures/shots.ts'], secs: 1 },
  { file: 'scripts/tracks-test.ts', tier: 'quick', covers: ['src/components/edit/model.ts'], secs: 1 },
  { file: 'scripts/trim-shots-test.ts', tier: 'quick', covers: ['src/components/edit/model.ts', 'src/components/edit/shots.ts', 'src/components/edit/Tracks.tsx', 'src/fixtures/trim.ts'], secs: 1 },
  { file: 'scripts/viewer-width-test.ts', tier: 'quick', covers: ['src/components/edit/viewerWidth.ts', 'src/components/edit/ViewerEdge.tsx'], secs: 1 },
  { file: 'scripts/waitlist-test.ts', tier: 'quick', covers: ['src/components/flow/waitList.ts', 'src/components/edit/left.ts', 'src/components/lib/flow.ts', 'src/components/lib/derive.ts', 'src/fixtures/day1.ts', 'src/fixtures/index.ts'], secs: 1 },
  { file: 'scripts/working-test.ts', tier: 'quick', covers: ['src/server/edit/working*.ts', 'src/components/edit/history.ts', 'src/server/edit/timeline.ts'], secs: 4 },
  { file: 'scripts/zoom-math-test.ts', tier: 'quick', covers: ['src/components/media/zoomMath.ts', 'src/components/media/useZoom.ts'], secs: 1 },
  { file: 'scripts/zoom-set-test.ts', tier: 'quick', covers: ['src/components/media/zoomSet.ts', 'src/components/media/Lightbox.tsx'], secs: 1 },
];

/** Never run by the runner: hand tools. smoke:thread sends one real message to Alma (a real claude process);
 *  films:check reads the films in the studio; story-waits-films and quiet-turns-calibrate read a running harness or the
 *  studio's own sessions. */
export const manual = ['scripts/smoke-thread.ts', 'src/server/films/check.ts', 'scripts/story-waits-films.ts', 'scripts/quiet-turns-calibrate.ts'];
