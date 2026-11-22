# Changelog

What changed in each version of Hitchcock Harness, newest first.

## 0.3.0 (November 2026)

The film rules move to Film Flow v3.3, and the app follows them.

### New

- **Sound picks.** For the sound effects Alma makes a few tries of each sound and puts them on one card, each with a play button and its place on the cut. Pick one per sound, or "None of these" for more tries.
- **The debrief.** Once a film is out, its Debrief page asks about the changes you made to Alma's proposals. Tap an answer, write your own or skip; she uses it on the next film.
- **Your reasons are kept.** Alma can ask why you made a change on a small "why" card, and your reason stays beside that step in the Edit page's History tab.
- **The AI editor's first cut.** Once every scene's take is in, a second agent tightens the assembled cut shot by shot and puts it to you for a yes. Undo takes it back in one press.
- **Save any face to the library**, with a note, even one you did not pick. A voice from the library is reused from its sample.
- **See what was sent.** A take's page shows exactly what went to the video model for it: the prompt, the settings and every reference in order.
- **The painted view behind each shot**, on a scene's page and in the Edit page's Takes view.
- **Layouts under Takes.** A scene restaged after its takes keeps each layout, with the shot swaps that are safe marked and a warning on the rest.
- **Zoom in full screen**: pinch, drag and double-tap on the phone; the wheel, drag and double-click on the Mac. Full screen browses only the set it was opened from.
- **A bigger picture on the Edit page.** Drag the edge between the viewer and the timeline.
- **Links that land in the right place.** A card or a link opens the cut at the clip, take or sound it is about.
- **Asking cards show what they ask about**: the pictures, and "Read the script ›" or "Read the story ›" on a card about the story or the script.
- **An Alma button beside the story**, level with the paragraph you are in.
- **Open the film's folder** in Finder from the … menu in the header.
- **Optional: a second Claude account.** When the account Alma runs on nears its limit, she moves to the next one at her next pause, with nothing lost. Off unless you set it up (`HARNESS_CLAUDE_ACCOUNTS`, see `.env.example`).
- **Optional: Tailscale.** With `tailscale serve` in front of the app, the logins you name in `HARNESS_TAILNET_USERS` reach it from their own devices without the remote-access key. Off unless set.

### Changed

- **Locations come first after the lock**, then faces and clothing; each character's voice is chosen as part of making that character.
- **One "Waiting for you" list**, the most important first. A tap sets a choice aside and **Done picking** sends them all; what you sent leaves the list at once. The story or the script waiting for you is on the list too.
- **A take goes onto the timeline the moment it lands**, in its boards' place, before any check.
- **A voice you pick is kept as its file.** It is saved to your Higgsfield account only when a later job must speak new words in it.
- **GPT Image 2.6** makes new pictures of places and props, the views painted for each camera and a view's repaint or relight. Seedream 5.5 makes every other change to a picture, and paints a view when GPT Image cannot keep the room's shape.
- **Character elements**: one row per character, and one go card per clip.
- **Sending is instant.** Your message shows the moment you tap, or stays as "Not sent" with a retry. On the phone, Alma's folded bar shows what she is doing and rises above the keyboard while you type.
- **The sidebar** lists the film you worked on last first, with one mark per film: a soft glow while Alma works, a white dot when something waits for you.
- **A quieter chat.** A button press shows as one short line, a button puts its item into Alma's box instead of raw text, and a turn Alma took on her own schedule that changed nothing is not shown.
- **Cards** show an option's whole text and no longer a wall of words.
- **Each step opens its own page at once**, and every way back names the step it returns to.
- **The Edit page** says what is being made while pick-ups are built, a trim stops at its shot's own first and last frame, and every take's shot sits under the scene's shot it belongs to. The 1080p switch also shows when the only full-size files are whole upscaled takes or originals.
- **The Script page** shows the title cards in their place, and a card's words are edited like a line.
- **Quality checks**: from the second round of a previz check, the critic first looks again at every fault an earlier round fixed; a place is checked before its scenes are staged.

### Fixed

- Typing in the story no longer scrolls the page up.
- On an iPhone the page no longer zooms into the message box.
- The Done picking tray sits flush on the phone's thread bar, and small buttons on the phone are easier to press.
- A character's sheet shows its newest version.
- Security: text you type counts for nothing as a button press in more places (card notes, chip labels, debrief answers, messages to helper agents); helper reports are cleaned of keys before the page shows them; a cut over 20 minutes, an odd track name or a library file that points elsewhere is refused.

## 0.2.1 (November 2026)

Security fixes.

- The app answers only on your Mac. Before, other devices on the same Wi-Fi could reach it.
- Requests from other websites are refused, so a page you open cannot send Alma messages or press the app's buttons.
- Reaching the app from your phone works only through a tunnel with your remote-access key; the key itself never sits in the browser's cookie, in Alma's shell or in the app's helper programs.
- Alma treats what she reads in web pages, files and tool results as material, never as orders: only your words in the chat and the app's buttons give a go.
- Text you type can no longer pass for a button press, and a film folder's files can no longer make the app read, copy, write or upload files from elsewhere on your Mac.
- Blender no longer runs scripts stored inside a scene file, and the Python packages the setup installs are pinned to exact versions.
- Next.js's usage statistics are turned off, and `.env.local` can be read only by your own account.

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
