// Alma's word at the top of every step: what the person does here and why the step sits where it does.
// Edit the texts here; nothing else needs to change. Two or three short sentences each, in Alma's voice: clear,
// brief, a little playful. A word of the app that must appear (previz, sheet, element, take) is explained in passing.
// The facts follow GUIDE.md and the stage notes in studio/flow/. A text may hold links written [label](https://…);
// they open in a new tab.

export const INTRO_KEYS = [
  'idea', 'story', 'loc', 'views', 'shots', 'previz', 'faces', 'clothing', 'sheet', 'voices', 'gate', 'elements',
  'character', 'go', 'scenes', 'scene', 'edit', 'finish', 'sound', 'release', 'platform', 'library',
] as const;

export type IntroKey = (typeof INTRO_KEYS)[number];

export interface Intro {
  /** The step's name, as the quiet "show again" control says it ("Alma on Faces"). */
  name: string;
  /** What Alma says, as one paragraph; [label](https://…) is drawn as a link. */
  text: string;
}

export const INTROS: Record<IntroKey, Intro> = {
  idea: {
    name: 'the idea and Higgsfield',
    text: 'Tell me the film the way you’d tell a friend: a few lines or a finished script both work. Everything I make is made on Higgsfield and paid in its credits, so you’ll need a Higgsfield subscription. If you don’t have one yet, here’s [an affiliate link](https://higgsfield.ai?fpr=zero-brainy); it helps support Hitchcock Harness if you use it to subscribe.',
  },
  story: {
    name: 'the story',
    text: 'Story first, script second: a plot is far easier to fix in a page of prose. Read mine, change it or tell me what to change, and settle it when it feels right. Then I write the script, and pressing Lock on it is your go for the first round of faces, places and voices.',
  },
  loc: {
    name: 'locations',
    text: 'Every place in the script gets a few pictures to choose from, and you pick one per place. That pick is all I ask you about a location: it becomes the place’s master picture, and I build a plain grey 3D model of the room from it, so every later shot agrees on where the door is. Props get a yes each.',
  },
  views: {
    name: 'views',
    text: 'Views are pictures of each place with nobody in them, from the angles the cameras will need, made from the place picture you picked. They show the video model the set before the actors walk in. Nothing to pick here: you’ll see them before any video is made, beside the scenes that use them.',
  },
  shots: {
    name: 'shots',
    text: 'Before anything is filmed, I write each scene down: the shots, what everyone in frame is doing and feeling, and where each of them stands at the start and at the end. The rough preview and, later, the instructions for the video are both built from this same text, so they can’t disagree. Have a read if you like; nothing here waits for you.',
  },
  previz: {
    name: 'previz',
    text: 'Before a single credit goes on video, I build a rough preview of every scene: grey stand-ins in a grey 3D set, with the cameras where the real shots will be. It’s free (it runs on your Mac), so this is the place to fix framing and timing. When it’s right, say yes to the whole-film preview and its storyboard, the same shots as still frames.',
  },
  faces: {
    name: 'faces',
    text: 'Faces first. You’ll see twenty calm portraits of each character, and you pick the one who walks into your film; say “older” or “kinder” and I’ll make another round. The clothes, the character sheet and one of the voice options are all built on that face, so this is the pick to take your time on.',
  },
  clothing: {
    name: 'clothing',
    text: 'Now we dress them. I put three different outfits on the face you picked, so you judge clothes on the actual person, not on a hanger. Pick one, or point me somewhere (“same coat, more worn”) and I’ll make variations.',
  },
  sheet: {
    name: 'the sheet',
    text: 'The character sheet is the reference I hand the video model: your picked face and outfit in three photos, front, three-quarter and head to toe. The backdrop is plain grey on purpose, so the light and colour of your film come from the scenes, not from here. Look it over and give it a yes, or tell me what’s off.',
  },
  voices: {
    name: 'voices',
    text: 'Voices wait for the face, because one of the options is a voice made to fit it. For each character you get a few to listen to: some of Higgsfield’s ready-made voices, one made from the face, and variations on the ready-made voice that fits best. Pick one, and that is how the character sounds in every scene.',
  },
  gate: {
    name: 'your picks',
    text: 'This is your list: every pick, yes or go that only you can make. The places and the people are made side by side and meet here, so nothing turns into video until your picks are in. On every round I mark the one I think you’ll choose, and I keep score.',
  },
  elements: {
    name: 'video elements',
    text: 'Now your picks come together. A video element is a five-second clip of each speaking character, in their face, clothes and voice, saying one line; every scene gets it as a reference, which is how a character looks and sounds the same from the first scene to the last. It’s real video, so each clip comes with its price and waits for your go.',
  },
  character: {
    name: 'this character',
    text: 'Everything about one character on one page: the face, the outfit, the character sheet (their reference photos), the voice, and the short clip that carries all of them into the scenes. Each is built from your picks before it, so if the face changes, the rest is made again from it. Click anything here and ask me about it.',
  },
  go: {
    name: 'the go',
    text: 'This is the one hard stop, and the expensive step. Every scene is here: its prompt (the written instructions for the video model), the pictures and voices that go in, and the total in credits. Read it, change anything you like, and say go when it’s right; until then, nothing is filmed.',
  },
  scenes: {
    name: 'scenes',
    text: 'After your go, every scene is filmed: one video each, a few shots long, made from its prompt (the written instructions for the video model) and the references you picked. This page lists them with their takes, the versions that came back. Open a scene to watch it and tell me what’s off.',
  },
  scene: {
    name: 'this scene',
    text: 'These are the takes of this scene: each one a separate try at it, from its prompt. Watch them, tell me what’s wrong in plain words (“he looks into the camera”), and pick the keeper, the take that goes into the film. Another take or a redo of one shot has its own price, and waits for your word.',
  },
  edit: {
    name: 'the edit',
    text: 'This is where the takes, the versions of each scene you kept, become a film. I lay out the first cut; you can move, trim, split and mute on the tracks yourself, or just tell me (“cut the pause before the last line”). Every change is a version you can go back to, so go ahead and try things.',
  },
  finish: {
    name: 'finishing',
    text: 'Up to now, every take was a quick draft at 480p. Finishing renders each take the cut uses again at full quality, 1080p, in the same video model: the same frames, only sharper. It’s the other big cost (about 16 credits a second), so it has its own price and waits for your go, once the edit is settled.',
  },
  sound: {
    name: 'sound',
    text: 'Sound and music come once the picture is final, so they fit the cut exactly. I clean any stray music out of the takes (that runs on your Mac, free), then you choose the music: a score I make on Higgsfield, with its own price, or a track of your own. Effects go in where a take is missing one, and you set the mix on the Edit page’s tracks.',
  },
  release: {
    name: 'the release',
    text: 'The finish line. The film gets its subtitles and lands in the final cuts folder, and I write a title, a description and a caption for each platform for you to pick or rewrite. The posting is yours: you post each one by hand.',
  },
  platform: {
    name: 'this platform',
    text: 'One platform at a time. Here are my drafts for this one, the text and the cover picture: pick, rewrite, or ask me for another. Then follow the steps to post it yourself, and paste the post’s link here so I can keep the record.',
  },
  library: {
    name: 'the library',
    text: 'Every face, voice, character and place you’ve picked, kept across films. Reuse one instead of making it again: just tell me when you start a film (“the same narrator as last time”).',
  },
};
