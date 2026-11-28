// Alma's word at the top of every step: what the person does here and why the step sits where it does.
// Edit the texts here; nothing else needs to change. Two or three short sentences each, in Alma's voice: clear,
// brief, a little playful. A word of the app that must appear (previz, sheet, element, take) is explained in passing.
// The facts follow GUIDE.md and the stage notes in studio/flow/. A text may hold links written [label](https://…);
// they open in a new tab.

export const INTRO_KEYS = [
  'idea', 'story', 'loc', 'views', 'shots', 'shotlist', 'shotdetails', 'previz', 'faces', 'clothing', 'sheet', 'voices', 'gate', 'elements',
  'character', 'go', 'scenes', 'scene', 'newtakes', 'edit', 'finish', 'sound', 'release', 'platform', 'debrief', 'library',
] as const;

export type IntroKey = (typeof INTRO_KEYS)[number];

export interface Intro {
  /** The step's name, as the quiet "show again" control says it ("Alma on Faces"). */
  name: string;
  /** What Alma says, as one paragraph; [label](https://…) is drawn as a link. */
  text: string;
  /** What she says instead on the phone, where the page can do less; '' says nothing there (no intro, no mark). */
  phone?: string;
}

export const INTROS: Record<IntroKey, Intro> = {
  idea: {
    name: 'the idea and Higgsfield',
    text: 'Tell me the film the way you’d tell a friend, in a few lines. I make everything on Higgsfield, so you’ll need a subscription there. If you don’t have one yet, here’s [an affiliate link](https://higgsfield.ai?fpr=zero-brainy). It helps support Hitchcock Harness if you use it to subscribe.',
  },
  story: {
    name: 'the story',
    text: 'Get the plot right here, while it’s still a page of prose. Then I write the script, and once you lock it I start on the faces, places and voices.',
  },
  loc: {
    name: 'locations',
    text: 'Pick a picture for each place. That picture becomes the place: I build a plain grey 3D room from it, so every later shot agrees on where the door is. Props just need a yes.',
  },
  views: {
    name: 'views',
    text: 'Nothing to pick here: these are your places from every camera angle, with nobody in them. They show the video model the set before the actors walk in. You’ll see them beside the scenes that use them.',
  },
  shots: {
    name: 'shots',
    text: 'Nothing here waits for you: this is each scene written out shot by shot. Who is in frame, what they do and feel, where they stand. The rough preview and the video are both built from this text, so they can’t disagree.',
  },
  shotlist: {
    name: 'the shots',
    text: 'Every shot of the film, scene by scene, in the order it plays. Each picture is the version in the film; a place keeps every time I made it, so nothing redone is ever lost. Open one to see exactly what I fed the model.',
  },
  shotdetails: {
    name: 'shot details',
    text: 'One shot with its cards on the table: the prompt I sent, cut into its parts, and every picture and clip that went in with it. When a shot comes out wrong, the reason is usually on this page. Option-click anything to put it in front of me.',
    phone: 'One shot with its cards on the table: the prompt I sent, cut into its parts, and every picture and clip that went in with it. When a shot comes out wrong, the reason is usually on this page.',
  },
  previz: {
    name: 'previz',
    text: 'Previz is a rough, free preview of every scene, before a credit goes on video. I stage it with grey stand-ins in a grey 3D set, cameras where the real shots will be. Fix framing and timing here, then say yes to the storyboard.',
  },
  faces: {
    name: 'faces',
    text: 'Faces first: pick your cast. Tell me “older” or “kinder” in the chat and I’ll try again. The clothes and the voice follow each face, so take your time.',
  },
  clothing: {
    name: 'clothing',
    text: 'Now we dress them: pick one of three outfits. Each is shown on the face you picked, so you judge clothes on the actual person and not on a hanger. Or point me somewhere (“same coat, more worn”).',
  },
  sheet: {
    name: 'the sheet',
    text: 'Give the character sheet a yes, or tell me what’s off. It’s the reference I hand the video model: the face and outfit you picked, in three photos. The plain grey backdrop is on purpose, so your film’s light comes from the scenes.',
  },
  voices: {
    name: 'voices',
    text: 'Pick a voice for each character. You’ll hear a few: Higgsfield’s ready-made voices, one made to fit the face (which is why voices wait for faces), and variations. Your pick is how they sound in every scene.',
  },
  gate: {
    name: 'your picks',
    text: 'Pick what you like: nothing is filmed until you do. I mark the one I’d bet you’ll pick, so I learn your taste.',
  },
  elements: {
    name: 'video elements',
    text: 'Each speaking character gets a five-second clip: face, clothes and voice, saying one line. Every scene gets it as a reference, which keeps them the same from first scene to last. It’s real video, so each has a price and waits for your go-ahead.',
  },
  character: {
    name: 'this character',
    text: 'One character, one page. The face, the outfit, the character sheet (their reference photos), the voice and the short clip that carries them into the scenes. Each is built on the pick before it, so a new face means the rest is made again.',
  },
  go: {
    name: 'the go',
    text: 'This is the one hard stop, and the expensive step. Every scene is here with its prompt (my written instructions for the video model), what goes into it, and the total in credits. Nothing is filmed until you say go.',
  },
  scenes: {
    name: 'scenes',
    text: 'After your go-ahead, every scene is filmed: one video each, a few shots long. This page lists them with their takes, the versions that came back. Open a scene to watch it and tell me what’s off.',
  },
  scene: {
    name: 'this scene',
    text: 'Watch this scene’s takes and pick the keeper. Each take is a separate try; tell me what’s wrong in plain words (“he looks into the camera”). Another take, or a redo of one shot, has its own price and waits for your word.',
  },
  newtakes: {
    name: 'new takes',
    text: 'Fresh from the oven: every take that came back since you last looked. Each one plays beside what the cut has in its place, so you judge it in context, not in a vacuum. Use it, keep it for later or throw it out; one key each.',
    phone: 'Fresh from the oven: every take that came back since you last looked. Each one plays beside what the cut has in its place. Use it, keep it for later or throw it out.',
  },
  edit: {
    name: 'the edit',
    text: 'Here your scenes become a film. Move and trim them on the timeline, or just tell me. Every change can be undone.',
    phone: '',
  },
  finish: {
    name: 'finishing',
    text: 'Finishing renders your film again at full quality, 1080p. Until now every take was a quick draft at 480p; these are the same frames, only sharper. It’s the other big cost, so it has its own price and waits for your go-ahead.',
  },
  sound: {
    name: 'sound',
    text: 'Sound comes once the picture is final, so it fits the cut exactly. I clean stray music out of the takes (free, on your Mac), then you choose: a score I make on Higgsfield, with its price, or a track of your own. You set the mix on the Edit page.',
  },
  release: {
    name: 'the release',
    text: 'The finish line: your film gets its subtitles, a copy at the loudness social apps expect, and lands in the final-cuts folder. For each platform I write two or three options for every text: title, description, caption. The posting is yours: you post each one by hand.',
  },
  platform: {
    name: 'this platform',
    text: 'One platform at a time: tap one of my options for each text, rewrite it, or ask for another. Pick the cover from my frames, or any frame of the film. Then post it yourself with the steps below, and paste the link so I can keep the record.',
  },
  debrief: {
    name: 'the debrief',
    text: 'Now that the film is out, I get to be nosy. Where you changed what I proposed and I couldn’t tell why, I ask here. Tap an answer, write your own or skip one: it all helps the next film start closer to your taste.',
  },
  library: {
    name: 'the library',
    text: 'Every face, voice, character and place you’ve picked, kept across films. Reuse one instead of making it again: just tell me when you start a film (“the same narrator as last time”).',
  },
};
