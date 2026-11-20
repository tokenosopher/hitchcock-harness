# Changelog

What changed in each version of Hitchcock Harness, newest first.

## 0.2.0 (November 2026)

### New

- **A few words from Alma at the top of every step.** She says what you do there and why it comes at that point. **Hide** puts one away, **Show intro** brings it back, and the **Step intros** switch in Settings turns them all off or on.
- **Point at things in your messages.** Option-click something on a page, use the pick button, or type `@` to choose from the film's own things. It appears in your message as a chip, and Alma knows exactly what you mean.
- **"What's next" on the Edit page.** The steps still left before the film goes out, with the first one that needs you marked.
- **Listen before you pick.** The voices waiting under "Waiting for you" can be played right on their card.
- **Full screen on the phone** for the film's player.
- **An optional reserve.** If your Claude plan's limit stops Alma mid-film, she can run on API credits instead. It is off by default: see "How spending works" in the README.
- **`/compact` in the chat** shortens a long conversation, as it does in Claude Code.
- **MIT licence.**

### Changed

- A new film starts with a budget of 2,000 credits (it was 5,000). Change it on the New film form.
- Music is made with ElevenLabs Music v2 on Higgsfield.
- A voice you pick is saved to your Higgsfield account only when lines must be spoken in it outside the video. Until then its own sample is used.
- Alma keeps her working files inside the app's `studio` folder.
- The Go for the video page says what is still missing before the videos can be made.

### Fixed

- Alma uses the address the app is really running on. Before, her instructions assumed port 8800.
- One Alma per film, also after the app restarts; a helper agent that wakes up again shows as running.
- The Edit page shows a cut as approved once you said yes on its card.
- A picked location shows its picture before its views are painted.
- Character names read correctly when the script lists several in one cell.
- A character's reference clip shows on its page while it is still a draft.
- A narrator's line, heard over the picture, no longer raises a "no spoken line" warning.
- The planned timeline follows the timing of the rough previews and shows every storyboard panel.
- The 1080p view says why it shows 480p when a full-size picture is missing.

### For developers

- Unit checks with one runner: `npm run test:quick`, `npm run test:changed` and `npm run test:slow` (see `tests/README.md`).

## 0.1.0 (16 November 2026)

- The first version: the app, the `studio` folder with Alma's film rules and tools, and every paid job running on Higgsfield through Claude Code.
