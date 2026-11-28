# Your first film

This is the guide for someone who has never used Hitchcock Harness. Install it first (see `README.md`), then come back here.

## The one idea

You talk and you choose. Alma does the work.

Alma is the film's agent: Claude, running on your own Claude login, with the film rules in `studio/flow/` and your Higgsfield account. She writes, makes the pictures, the voices and the videos, cuts the film and keeps the records. You say what you want, pick between the options she shows you, and say "go" before anything expensive.

No button in the app spends credits by itself. A button either records your choice or writes a message to Alma, who answers with a price and waits.

## What is on the screen

- **On the left: your films**, the **New film** button, and the library of faces, voices and places you can use again in later films.
- **In the middle: the film.** Its main page opens on a board called "The flow", one tile for each step (story, locations, faces, clothing, voices, previz, the edit, the release, in that order), each marked done, being made, or yours to look at. Click a tile to open that step's page. The pages show what is in the film's folder; nothing has to be saved or refreshed.
- **On the right: the chat with Alma**, always open. One conversation per film, kept from the first idea to the release.
- **Waiting for you**, on the film's main page: one list of the things only you can decide (a pick, a yes, a go), the most important first. A white dot beside a film in the sidebar means something waits there. When you don't know what to do next, look here first.
- **A word from Alma at the top of every step.** Each step's page opens with a few lines from her: what you do there, and why it comes at that point of the film. **Hide**, after her last word, hides that step's intro, and **Show intro**, left in its place, brings it back. The switch **Step intros** in Settings turns all of them off, or back on.

## The film, step by step

1. **Start.** Press **New film**. Give it a title and tell the idea the way you would tell a friend: a few lines, a whole story or a finished script all work. Leave the setup line as it is unless you want something else (upright 9:16 picture, a budget of 2,000 credits). Click 9:16 to make the film 16:9, landscape; for 21:9 or square 1:1, tell Alma at the start and she sets it in the film's brief. Press **Start the film**.
2. **The story.** Alma writes a short story first, not a script. Read it on the Story page. Change it yourself, or tell Alma what to change; every change is a new version, the old ones stay. When the story is right, settle it with the button on the page.
3. **The script.** Alma turns the story into a script with scenes and lines. Read it, change it, then press **Lock**. Locking is your go for the first round of pictures and voices: the places first, then the faces, their clothes and their voices. That round is the cheap part (a round of twenty faces costs about 2.5 credits) and Alma says each round's size and cost in one line as it starts.
4. **Your picks.** The options arrive as cards in **Waiting for you**: a few pictures of each place, then about twenty faces for each character, their clothes, and a few voices to listen to right on the card. Tap the ones you want; a tap only sets your choice aside. When you are through, press **Done picking · send to Alma**, and everything you chose goes to her in one message. Before each round Alma says which one she thinks you will pick; she keeps score in `studio/taste.md` and gets better at guessing your taste. A face you like but don't use can go to the library with a note, for a later film.
5. **The plan for each scene.** Alma plans the camera for every scene on a rough stand-in set, makes a short reference clip of each character, and writes the prompt for every scene. A second agent checks each piece before anything is spent on it. You can look at any of it and say what is off.
6. **"Go for the video?"** This is the one hard stop, and the expensive step. One page shows every scene, its prompt, the pictures and voices fed into it, and the total price in Higgsfield credits. A draft costs about 3 credits for each second of film, so a three-minute film is roughly 550 credits. Read it, change what you want, then say go.
7. **The takes.** The scenes come back as video, each a 480p draft, and each one goes onto the film's timeline the moment it arrives. The **New takes** page lists every take you have not looked at yet, beside what the cut has in its place, with Alma's check of it: use it, keep it for later, or throw it out. The **Shots** page shows every shot of the film in the order it plays, with every version made of it, and **Shot details** shows one shot with exactly what was sent to the video model for it: the prompt in its parts and every picture and clip that went in. Tell Alma what is wrong in plain words ("in scene 3 he looks into the camera", "her second line is too fast"). She proposes a redo of only that part, with its own price, and waits for your go.
8. **The edit.** Alma puts the takes together, then a second agent, the AI editor, tightens them into a first cut shot by shot and puts it to you for a yes. On the Edit page you can move, trim, split and mute on the tracks yourself, or ask Alma ("cut the pause before the last line"). Every change is a version you can go back to, and Alma may ask why you made one, so she learns how you cut.
9. **Finishing.** Full quality (1080p), music, sound effects and subtitles. For the sound effects Alma makes a few tries of each sound and puts them on one card for you to pick from; each try plays on the card, and **In the film** plays it in place on the cut. Each paid part has its own price and its own go. 1080p is the other large cost and the last paid step, made once the cut is finished: every draft the cut uses is finalized to 1080p, the same frames at full size, about 16 credits a second, so roughly 2,900 credits for three minutes. A draft can be finalized for 7 days after it was made; a take that cannot be goes through Higgsfield's upscaler instead, with its own price.
10. **Release.** The finished film lands in `studio/assets/final-cuts/`. The final that goes out is a copy at -14 LUFS, the loudness social apps expect; Alma proposes it with its readings and you name it on the Release page. For each platform she writes two or three options for every text (the title, the description, the caption): tap one, then change it as you like. She offers a few cover frames, and you can pick any frame of the film instead. A small 480p copy for the phone is made when you ask for it. You post it yourself.
11. **The debrief.** Once the film is out, Alma asks a few questions on the film's Debrief page about the changes you made to her proposals: tap an answer, write your own, or skip. The next film starts closer to how you work.

## How to talk to Alma

- **Click, then type.** Whatever you click (a face, a shot, a line of the script) appears above the message box as "Alma sees". She knows what you are looking at, so "this one is too dark" is enough.
- **Say what you see, not how to fix it.** "He looks bored when he should be afraid" works better than a technical instruction.
- **Ask anything, any time:** "What happens next?" "What is waiting for me?" "How much have we spent?" "Why did you pick this one?"
- **Teach her.** When you say "from now on, always…" or "never do that again", she writes it into the rules in `studio/flow/` and follows it in every later film.
- **Changes to the app itself** (a button, a page) she cannot make. She writes them down in `ASKS.md` for whoever looks after your copy.

## Money

- Everything paid runs on your Higgsfield credits. Claude runs on your Claude plan.
- A one-minute film comes to about 1,600 credits from the first face to the 1080p master, and a three-minute film to about 4,100. The budget you set at the start (2,000 unless you change it) is the line Alma warns you about before crossing; raise it on the New film form for a longer film.
- Alma reads your real balance and the real price before every quote. The figures in this guide are from November 2026 and will drift.
- There is one hard stop before the videos. Every later paid job (a redo, 1080p, music) has its own price and go. Small things (a sound effect, a spoken line) cost under a credit and are made without asking, then listed.
- Every paid job is one row in the film's `spend.md`. Ask "how much have we spent?" at any point.

## When something goes wrong

| What you see | What to do |
|---|---|
| Alma stops answering | Send your message again or reload the page. She picks the conversation up where it was. |
| Alma says Higgsfield is not connected | In a terminal run `claude`, type `/mcp`, choose `higgsfield` and sign in. Then message Alma again. |
| "Studio folder missing" | Run `./setup.sh` again from the app's folder. |
| You are out of credits | Top up on Higgsfield, then tell Alma to carry on. Nothing is lost. |
| A result looks wrong and you don't know why | Tell Alma what you see. She keeps a log of every generation and can say what went in. |

## What this version does not do

- It cannot invent a voice from a written description. You choose from Higgsfield's voices, from voices made to fit a character's face, or from variations of those.
- It does not post to social platforms for you.

## Where things are

| | |
|---|---|
| Your films | `studio/assets/films/<film>/` |
| Finished cuts | `studio/assets/final-cuts/` |
| Faces, voices and places you can reuse in later films | `studio/assets/library/` |
| The rules Alma follows | `studio/flow/` |
| Your taste, as Alma has learned it | `studio/taste.md` |
