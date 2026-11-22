<!-- Read by: tools/prompts/assemble.py (## MEDIA, ## TAGS and the text sections below; a heading it does not know is dropped without a word), then tools/prompts/check.py on the assembled prompt and media list.
     Described in: Flow v3.3 - 6 Scene prompts (steps 10-12: the spec, the reference list, the section order); OPTICS and STYLE with Flow v3.3 - 6d Anamorphic look; the VOICE line and the sheets-only sentence in Flow v3.3 - 3 Voices and video elements. -->
# <G> · <generation name>: prompt spec

<!-- The prompt comes out in this order: SCENE CONTEXT, ACTIVE REFERENCES (written from MEDIA and TAGS), LOCATION MAP, GEOGRAPHY, COMPASS (fixed backdrop), FIRST FRAME AND SPATIAL BLOCKING, FORMAT MODE, OPTICS, CAMERA, CAMERA STYLE, the SHOT blocks (from <G>-scene.md ## Shots), ACTING TASKS (scene file), FIGHT BEATS (scene file, fights only), PHYSICS, LIGHTING, AUDIO, STYLE, QUALITY, POSITIVE CONSTRAINTS, STORYBOARD (the closing line, written by assemble.py).
     A section left empty or deleted is skipped. Each guidance comment below starts with an @: delete it when you fill the section (a leftover @ stops check.py). '@KEY' pulls a section of generations/prompt-common.md, but only in MEDIA descriptions and TAGS lines; {VIDEO:TAG}, {IMAGE:TAG} and {AUDIO:TAG} become that reference's number in every section. No seconds anywhere.
     One home per fact (step 12): what a character holds, its MEDIA line; start positions, FIRST FRAME; lens degrees, the shots' Lens lines; readable faces, QUALITY; face beats, the scene file's ACTING TASKS. -->

## MEDIA
# @ One reference per line: KIND | TAG | file (film-relative) | description. KIND is VIDEO (a character's video element, with its voice), IMAGE (a sheet for what has no element, the extras' group picture cropped to this scene, a prop; Flow v3.3 - 6 Scene prompts, step 11), VIEW (the empty location view behind each camera, every wide included; cameras close together share one) or AUDIO (only a voice no element carries).
# @ A character with a video element gets ONLY the element, never its sheet beside it. The one exception: a faceless sheet variant for a costume or prop state the element does not show, as IMAGE | <NAME> SHEET | <variant file> | @<NAME> SHEET.
# @ Lines starting with # are skipped. Order inside a kind = reference number. The storyboard pages are added by the script, after the images. Never a panel, plate or Blender frame on its own; never a start or end image; at most 30 images, at most 30 s of video.
VIDEO | <NAME> | elements/<CID>/takes/take<N>/E-<CID>-take<N>-1080p.mp4 | @<NAME> <What differs in this generation: what they hold, in which hand; the state of their clothes.>
IMAGE | <GROUP TAG> | cast/<CID>-<CID>-<name>/pick.png | @<GROUP TAG>
IMAGE | <PROP TAG> | props/<PID>-<name>/<PID>-<name>-v<n>.png | @<PROP TAG> <Its state and where it is in this generation.>
VIEW | <LOC> FRONT | locations/<LID>-<name>/<LID>-<name>-front-v<n>.png | @<LOC> FRONT
VIEW | <LOC> BACK | locations/<LID>-<name>/<LID>-<name>-back-v<n>.png | @<LOC> BACK
VIEW | <LOC> WIDE | locations/<LID>-<name>/<LID>-<name>-wide-<G>-<shot>-v<n>.png | <What the view shows, from which side.> The picture shows the set EMPTY; it is <the background | the whole frame> of shot <n>, where <who is where>.
AUDIO | <VOICE TAG> | cast/<CID>-<name>/voice/element-line-5s.mp3 | @<VOICE TAG> <Where the voice comes from in this generation.>

## TAGS
<!-- @ Tags described in words, each pointing at a reference by [TAG] or {IMAGE:TAG}; every line becomes a line of ACTIVE REFERENCES. End with the @SHEETS ONLY line whenever the generation has a video reference. -->
[<CID>]: <which one of the group, described in words>, the one on the <left | right> in [<GROUP TAG>], <what is particular to them here>.
[<THING TAG>]: <an object seen in a view, in words>, as in [<LOC> FRONT].
@SHEETS ONLY

## SCENE CONTEXT
<!-- @ The look, the ratio, the place in a line, the tone in a word; then what happens, in order, the length, the number of shots and cuts. -->
Photoreal live-action cinema, 35mm film, anamorphic, <9:16>. <The place in one line: what it is, its materials, its light.> <The tone, in a word.>

This generation: <what happens, in order, one sentence a beat>. <n> seconds. <n> shots joined by <n − 1> HARD CUTS.

## LOCATION MAP
<!-- @ The geography as fixed facts: what lies at each end, the furniture, who stays outside every frame. No start positions: FIRST FRAME holds them. Fill this or GEOGRAPHY (the older name), not both: both are emitted when both are filled. -->
A <long room>, <compass> to <compass>. <What is at one end>; <what is at the other>. <The furniture across the middle>. <Who is outside every frame.>

## GEOGRAPHY
<!-- @ An older name for LOCATION MAP. Delete this section when LOCATION MAP is filled. -->
<Same content as LOCATION MAP.>

## COMPASS
<!-- @ What lies north, east, south and west, as a fixed backdrop; it comes out as "COMPASS (fixed backdrop)". -->
N: <…>. E: <…>. S: <…>. W: <…>.

## FIRST FRAME AND SPATIAL BLOCKING
<!-- @ The first frame in words, from panel 1 and the scene file's START STATE (the start image stays empty): the shot, who is already where, who is outside every frame until which shot; the only place for start positions. What each holds is in its MEDIA line, not here. -->
Open on <shot 1's size> of <who or what>, <the framing>. <NAME> is already <where, pose>. <NAME and NAME> are outside every frame until shot <n>.

## FORMAT MODE
<!-- @ The total length, the number of shots, hard cuts. No length per shot. -->
Controlled multi-shot sequence, <n> seconds, <n> shots, hard cuts.

## OPTICS
<!-- @ The lens fixed within a shot; the anamorphic character on the practical lights. No degrees: the shots' Lens lines hold them. -->
Lens fixed within each shot. Anamorphic character: vertical oval bokeh on <the practical lights>.

## CAMERA
<!-- @ Locked off or one controlled move; which shots move and how. Fill this or CAMERA STYLE (the older name), not both. -->
Locked off, except shot <n> (handheld, low) and shot <n> (<one controlled move: a slow tilt up as …>).

## CAMERA STYLE
<!-- @ An older name for CAMERA. Delete this section when CAMERA is filled. -->
Shots <n> and <n> locked off; shot <n> handheld, low. Lens fixed within each shot; anamorphic rectilinear character, vertical oval highlights on <the practical lights>.

## PHYSICS
<!-- @ How each moving thing moves with weight: what falls straight, what is one rigid piece, what billows, how bodies are moved. -->
<The raised prop> lowers with weight, one rigid piece. <A small object> drops straight to the floor when <their> fingers open. <NAME> is pulled up with real weight: <feet scrabble on the floor, clothes drag>.

## LIGHTING
<!-- @ The practical sources and their colours, what changes in the light during the generation. Readable faces are said in QUALITY, not here. -->
<Source>: <colour and where it pools>. <What changes: which light dies or grows, and when, by the action, not by the clock.>

## AUDIO
<!-- @ Every line numbered in order with its shot and speaker, word for word; who never speaks; the sounds in order; no music, no narration. Then one AUDIO LOCK per speaker, on their reference (a VIDEO element, or the AUDIO reference for a voice no element carries). -->
English only. Exactly <n> lines, in this order, each spoken by the person named, in that person's voice from their reference:
1. Shot <n>, <NAME>: "<line, word for word>"
2. Shot <n>, <NAME>: "<line, word for word>"
<NAME> never speaks. Sounds: <the effects in order>. No music of any kind from the first frame to the last, no narration, no subtitles.
AUDIO LOCK (<NAME>): the voice in {VIDEO:<NAME>}, the same timbre, register, accent and breath; <the delivery of each line, in order>.
AUDIO LOCK (<VOICE TAG>): the voice in {AUDIO:<VOICE TAG>}, <the same timbre and register; the delivery>.

## STYLE
<!-- @ Film stock, grain, blacks, the palette, the anamorphic marks (Flow v3.3 - 6d Anamorphic look). -->
Shot on 35mm film, <tungsten-balanced 500-speed>, fine grain; rich blacks with detail; <the palette>; anamorphic vertical oval bokeh on <the practical lights>.

## QUALITY
<!-- @ Readable faces and hands at held moments (the one place the prompt says faces are readable), natural motion blur where things move fast, stable anatomy. -->
Readable faces and hands at held moments. Natural motion blur on <the fast moves>. Stable anatomy; five fingers on every hand.

## POSITIVE CONSTRAINTS
<!-- @ Say what is there: exactly who is in frame, by shot; what stays the same; who is seen from behind; the number of cuts. What a character holds is in its MEDIA line, not here. -->
<!-- @ In a fight, the style's lock goes in its own section below, ## FIGHT STYLE LOCK, which assemble.py emits after this one. -->
Shots 1 to <n>: exactly <two> people seen, <NAME> and <NAME>; nobody else in those frames. Shot <n>: <who>, and nobody else. <The prop> is <its material>, as in {IMAGE:<PROP TAG>}, one rigid piece in every frame. <NAME> stays <where> until shot <n>. <NAME> is seen from behind in shot <n>, face turned away from the camera and never seen. <n − 1> HARD CUTS.
