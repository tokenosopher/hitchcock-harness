---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 2 · Characters

**Purpose.** For every character in the cast: a locked reference set (the picked face, the sheet with its head-to-toe view, any extra views) on one light and neutral colour, registered as a Higgsfield image element.

## Inputs
- `$FILM`, the full path to the film folder. Every path below is under it.
- The locked `script.md` and the cast list in `brief.md` (the `## Cast` entries of `templates/brief.md`): per character the age, the build, what the story needs the face to say, the wardrobe.
- The user's own reference images (faces, wardrobe) in `cast/refs/`.
- For a real character (a mascot, a product's character): the official image in `refs/characters/`, found in [[Flow v3.2 - 1 Setup and story]].
- For a historical cast: the research in `refs/research/` and the images in `refs/characters/` (ancient portraits, museum objects, the texts), made in [[Flow v3.2 - 1 Setup and story]].
- The record of the user's earlier picks, `taste.md`.
- `higgsfield.json` (the `cast` folder id) and `elements.json`, both made at setup.
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps
Run the steps in order, each from the approved result of the step before. Work that depends on a pick waits for that pick; everything else runs side by side. When a base changes, redo everything made from it. Every step ends the same way: show the result on its card on the character's page in the Hitchcock Harness (the app's show recipe), and say in the thread what is up there; at a **GATE**, write a card that asks and wait for the user's answer on it. Finish every still here, where a redo is cheap.

The script lock is the user's go for the first round of every still here: the faces, the looks on the picked face, the sheet and its details. Run them without asking, say each round's size and cost in one line, and log every paid job. A further round of faces, looks or a sheet runs when the user's note asks for it, and that note is its go. If the user said during the script work that a character from an earlier film is reused, use that one instead of generating.

Every still here after the picked face starts from an existing picture, so it is an edit: run it on Seedream 5.5, never as a GPT Image 2.5 edit (the edit route and its re-check: [[Flow v3.2 - 0 Standing rules]]). GPT Image 2.5 makes only first versions: faces from text or from the user's reference.

Every round of candidates (faces, looks, sheets) goes on its card with your prediction of the user's pick, made from `taste.md`. Add every pick to that record with the candidates, the user's words, the prediction and whether it was right.

Every pick also goes into the library, the Hitchcock Harness's own (Faces, Voices, Characters and Locations in its sidebar), which holds the picks of every film. At every pick here (faces, looks, sheets, whole characters), the library is a source beside the new round ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]).

### The brief and the references
1. Before anything is generated, write each character into the `## Cast` list of `brief.md`, in the template's shape: the wardrobe's colours, and every costume or machine detail with its size, material and side. Put a one-sided detail on the side the close-ups will show. This list is the checklist every image is checked against.
   - A historical cast: write each brief (face, build, hair, wardrobe, props) from the research of [[Flow v3.2 - 1 Setup and story]], not from the story's prose alone.
   - Set every age, extras in a group picture included, by the rule on children ([[Flow v3.2 - 0 Standing rules#Moderation]]): a young person in a scene with violence, restraint or danger is briefed as an adult in their twenties, before any picture is generated.
2. Lay the costumes of the whole cast side by side before approving any one, and keep the characters apart in colour (never three characters in white).
3. Check each costume against the location it plays in. Re-dress a costume that would vanish into its set (a charcoal dress in a black void).
4. Leave the hands empty unless the character holds the prop in every shot, so the prop does not come along in every generation.
5. Feed in the user's reference images where they help. A reference face goes in as a type, never as a likeness: every human face prompt says "An original face that resembles no living actor." An ancient portrait from the research goes in the same way, as a type, never as a likeness to copy.
6. A real character: the official image goes in as Image 1 and the story's own details go on top. Never design one from prose. Check that every story detail stays visible.
7. A non-human character is built like a character: one hero reference, made on Nano Banana Pro on Higgsfield (`generate_image`, `nano_banana_pro`, `resolution: 2k`, in the `cast` folder), registered as an element at the lock. If its mouth is not a human mouth (stitched, plush, a sphere), also make a reference of it mid-word, sent with every generation where it speaks.
8. Extras get no video element. Make their group picture once, not a sheet of panels: one full-length picture of the whole group from a distance, side by side, in the same kit, each told apart at a glance by build, height and one or two marks (a crest colour, a shield device). Save it as `cast/C0N-C0N-<name>/pick.png`. It is the source of the scenes' crops below; a scene's image reference is its own crop, never the whole picture.
   - Give each scene its own crop of the group picture: only the people the scene shows, in the order the camera sees them, left to right.
   - Two extras who look alike get a reference each, not one shared group picture.
   - A lead who is always attended (bearers, servants) gets one picture with his attendants and the prop they carry, held in the bearer's hands. Check that the prop is held properly and is one piece, before any video uses the picture. No take has ever been made without this picture, so whether the takes need it is untested.

### Faces
9. Generate faces on Soul Cinema on Higgsfield (`soul_cinematic`), in the `cast` folder of `higgsfield.json`. A round is twenty head-and-shoulders portraits at 3:4, run at once as one batch. Face rounds and location candidates are the only batches ([[Flow v3.2 - 0 Standing rules#Spending]]). Say the round's size and cost in one line and run it. Never use Soul 2, the portrait model: it smiles for the camera and trims beards. Keep each round in its own folder, `cast/C0N-<name>/r<n>-<what>/` (`r1-faces`), with its prompts and job ids in `prompts.json`.
10. Write the prompt in the face prompt shape below, with these wording rules:
    - Every face has a neutral expression: the face at rest, lips closed, no pulled brows, no smile, no frown. The face round, the picked face and everything made from it (the looks, the sheet, the extra views, the video element) keep that face at rest. The expression comes later, from the scene prompt ([[Flow v3.2 - 6 Scene prompts]]).
    - Tell the candidates apart by features and type: build, age, the bones of the face, hair, skin. Never by an expression. A character who must read as sulky, sly or nosy is cast by the features that suggest it, then played that way in the scene.
    - Write photography ("a studio portrait photograph of a real young woman"). Never "character reference sheet", never "photorealistic", never a painting or a sculpture as the image reference.
    - Say each feature of the face once, in plain words. Piled-up intensifiers get amplified.
    - Never write "olive" for skin: it reads as a colour and gives a yellow-green cast. Write the tone with its Monk Skin Tone number and undertone: "light tan, Monk <n>, warm undertone"; the undertone is warm, neutral or cool.
    - A lead the story wants good-looking is written "strikingly handsome" for a man or "strikingly beautiful" for a woman, in those words.
    - No beauty-shoot words ("dewy", "wet-look", jewellery; "striking" only in the lead's wording above). Never list makeup items as negatives: it summons them. Use the shape's plain skin block with a plain tee.
    - Spell out real skin as the shape does; "natural skin texture" alone gives waxy, made-up faces. The full wording reads about five years older, so brief the age about five years younger.
    - Leave small machine or costume details (windows, metal ears, seams) out of the face round. They go on at the sheet.
11. Show each round as one card that asks for a pick, on the character's page. Head the card with who the character is, in a few plain lines: their part in the story, their age and type, and the scenes where they speak. Then give each candidate a one-line description of its features, and add your prediction of the pick. Show every round before another is run: never run a second round on your own judgement of the first.
12. **GATE:** the user picks one face on the round's card, or redirects ("fairer", "younger", "from my reference"). Wait. The next round follows the user's note and runs on it without asking. If the user keeps two or more faces in the running, build them into the same sheet (step 19) so they compare like for like.
13. When Soul Cinema does not get there, take the second route: GPT Image 2.5 on Higgsfield (`generate_image`, `gpt_image_2_5`, `variant: sunburst`, `quality: high`, `resolution: 2k`, `aspect_ratio: 3:4`, in the `cast` folder), first from text only, then with the user's reference image as `image_references` (a new face made from a reference, never an edit of a picked one). If the user names another model for faces, Nano Banana Pro (`nano_banana_pro`) is the one to offer. Soul Cinema gives the best skin; GPT Image 2.5's skin is over-sharpened and plasticky up close.
14. Do not plan around a Soul ID trained on an approved sheet. It is not a proven route.

**The face prompt shape:**
> A studio portrait photograph of a real young <woman>, head and shoulders, facing the camera, eyes to the lens, a neutral expression, the face at rest, lips closed. Plain mid-grey seamless studio backdrop. <She> wears a plain faded dark-grey T-shirt, no jewellery. <She> is <age>, <build>. <the face in plain words, each feature once>; <skin> (Monk <n>, <warm, neutral or cool> undertone); <hair>. One large soft frontal softbox key with even fill, low contrast, no rim light, no coloured light, daylight-balanced neutral white balance: the backdrop renders neutral grey. Ungraded natural colour, no filter. Unretouched, true-to-life skin, natural saturation: visible pores, soft peach fuzz catching the light, a faint natural flush, a natural sheen; no makeup, no foundation, no airbrushing, no beauty filter, no smoothing. A living person photographed, not a 3D render, not a doll, not an illustration. An original face that resembles no living actor. No text, labels, logos or watermarks.

### Wardrobe
15. Once the face is picked, make three different looks on it as Seedream 5.5 edits on Higgsfield (`seedream_5_5`, the picked face as Image 1, its aspect ratio, `resolution: 2k`, in the `cast` folder), without asking: say their size and cost in one line. One of them follows the user's wardrobe reference if there is one. Each look keeps the picked face at rest, lips closed (step 10). Show them on a card that asks for a pick, with your prediction.
16. **GATE:** the user picks a look on its card. Wait. Then make variations in the direction the user picks (the same look darker and dishevelled, say) on that note, and wait for the pick again.
17. A wardrobe change on one reference goes to all of the character's references before approval: re-edit the others to match on Seedream 5.5, face and details untouched, and redo the light match. Two references that disagree give the video model two costumes.
18. A wardrobe or prop state the sheet does not show (a sword drawn, a sheath empty) is made only when a shot needs it, as a faceless sheet variant: steps 51 to 56.

### The sheet
19. Once the look is picked, make the sheet without asking (say its size and cost in one line), as one Seedream 5.5 edit on Higgsfield (`seedream_5_5`, `aspect_ratio: 16:9`, `resolution: 2k`, in the `cast` folder): the picked face as Image 1, one wide landscape image, three photographs side by side with a thin clean gap: (1) front, head and shoulders; (2) three-quarter, head and shoulders; (3) standing head to toe, feet on the floor. Use the sheet prompt below with the neutral block word for word, the same for every character of the film.
    - Seedream 5.5 has not yet made this three-panel sheet from a face and a look. Check the first one panel by panel against the picked face and look (Checks), and say on the card that the route is untried.
    - Lips closed, the face at rest, in every panel, as on the picked face (step 10): open lips in a reference nudge Seedance to leave the mouth open in silent beats, and an expression on the sheet sits in every shot.
    - A picked face that is not at rest goes back to a neutral version of the same face first, and the looks and the sheet are made again from it.
    - When a shot needs an expression, make an expression strip alongside the sheet, never on it (a faint closed-mouth smile, a full smile, frantic mid-word).
    - The backdrop is plain mid-grey seamless, one shade and one light for the whole cast. The sheet is the film's camera test and its backdrop the grey card: white bleeds into the video and washes out the location, black eats detail. The film's look goes in later, at the locations and in the scene prompts.
20. Keep these words off a sheet: cinematic (lighting, grade or look), golden hour, warm (for the light or the backdrop, "warm grey" included), cozy, moody, dramatic, atmospheric, sunset, candlelight, tungsten, teal and orange, glow, rim or back light, HDR, vibrant, vintage, sepia, film-stock names. They read as tungsten and bake a look into an 8-bit still. On GPT Image 2.x never add "no warm cast" or "cool" blind, as it can turn the image cyan: measure the backdrop first (step 34).
21. Add the details with one Seedream 5.5 edit of the sheet (the sheet as Image 1, `aspect_ratio: 16:9`, `resolution: 2k`), in the details prompt below, without asking: say its cost in one line.
    - Name each detail's side twice, per panel, in the character's terms and in picture terms: "his LEFT side: the RIGHT side of the picture in the front and full-body panels".
    - On a Soul Cinema base keep Soul's skin: `detail_composite.py` takes the edit's pixels only where the edit really changed something, because an edit can re-render the whole image.
    - To move a detail, erase it and place it again (`--erase`, `--copy`). Never ask the model to "move" it: it adds a second one.
    - A small detail in a far, soft panel (the full body): crop that head, enlarge it 4x, edit the crop with the close-up as the design reference ("same soft focus, NOT sharper than <his> eyes, same light, low contrast, same grain"), downscale it, and composite only the detail back, sized in proportion to the close-ups. Never paste a copy from a close-up: it carries far more fine detail and contrast than the skin around it.
    - Describe a new body part as photographed in the same shot: its material in plain words (for a porcelain hand: "MATTE unglazed bisque porcelain in a warm ivory close to <his> skin tone… real imperfections (chips, crazing)"), then "lit by the same light from the same direction, contact shadows, the same softness and film grain as the rest of the image; must look photographed in the same shot".
22. Make sure the full view reaches the floor. Sheet panels often crop at the hips or the knees.
    - The character sits or is cropped badly: make a new standing image from the sheet as a Seedream 5.5 edit, the sheet as Image 1.
    - The character stands but is cut off: extend the panel. `figure_canvas.py` lays it on a tall canvas of the sheet's own backdrop; a Seedream 5.5 edit of that canvas outpaints below it. The outpaint prompt calls the image a "costume design reference for a film", says Image 1 is the character from the hips up on the studio backdrop, asks for the figure completed head to toe with the feet on the floor, keeping the light, the backdrop and the grain, and briefs the lower body from `brief.md`.
    - **GATE:** the lower body is new design. If the story does not say what is below the hips, put the options in words on a card that asks, wait for the pick, and generate only that one, so the wides do not show two different characters.
    - If the outpaint looks right, use it whole: check the raw result against the sheet (face, details, side, costume) and present it as generated. Lay the original back with `extend_figure.py` only when something specific drifted, such as the face, and say why on the card.
    - If moderation flags a sculpted or bare-looking body, keep the "costume design reference for a film" wording and send only the torso or the lower-half crop. Retry a moderation block as the standing rules say.
23. When the film talks straight into the lens, also make a front-facing portrait from the approved sheet, every detail on the same side, checked like a sheet.
24. Run the checks below panel by panel and fix every miss. Show the sheet on a card that asks for its yes, with what you checked.
25. **GATE:** the user approves the sheet on its card, a yes that names the sheet and its version. Wait.

**The sheet prompt:**
> Image 1 is the face: keep this exact <woman>, identical face, skin, <eyes, brows, lips, hair>, unretouched, no makeup. Make one wide landscape image: three studio photographs of the same person side by side on a single continuous plain mid-grey seamless studio backdrop, a thin clean gap between the panels: (1) head and shoulders, facing the camera, eyes to the lens; (2) head and shoulders, turned three-quarters to <her> left; (3) standing head to toe, feet flat on the floor, both hands hanging free at the sides with the fingers relaxed, the whole outfit visible from the top of the head to the soles of the feet. The same person, the same hair, the same clothes and the same light in all three panels. <the neutral block>. <height and build>. <the wardrobe collar to shoes, every detail with its side>. <hands>. A neutral expression, the face at rest, lips closed, in all three panels.

**The neutral block**, word for word for every character of a film:
> Plain mid-grey seamless backdrop, no gradient, no vignette. One large soft frontal softbox key with even fill, low contrast, no rim light, no coloured light. Daylight-balanced neutral white balance, about 5600K: the backdrop renders neutral grey, whites stay white. True-to-life skin, Monk <n>, <warm, neutral or cool> undertone, natural saturation, visible pores, matte. Identical light, exposure and white balance in every panel. Ungraded natural colour, no filter. No text, labels or colour charts.

**The details prompt:**
> Edit image 1. Keep everything exactly as it is: <face, skin, expression, hair, wardrobe, the three panels and poses, background, light, colour, grain>. Do not smooth, retouch or sharpen the skin; keep every pore, freckle and wrinkle exactly. Add ONLY these details, consistently in all three panels: …

### The skin pass (only when the user asks)
26. There is no skin call after the sheet. Run a skin pass only when the user asks for one, on the approved sheet; otherwise go on to step 32.
27. Route: Seedream 5.5 on Higgsfield (`seedream_5_5`, `aspect_ratio: 16:9`, `resolution: 2k`, in the `cast` folder). The approved sheet goes in as Image 1 and a real skin photograph as Image 2. When other surfaces need it too, add one real reference photo per surface, each with one job: the hair, the backdrop (the same plain mid-grey seamless), the fabric of the garment. The prompt names what to take from each and where it goes: "Take the skin texture details from Image 2 and adapt them to this character in Image 1. Take the hair texture from Image 3 and adapt it onto this character. Use Image 4 as the BACKGROUND texture. Use Image 5 as the texture for <the garment>." Keep the same face, mouth, outfit, panels and poses. Never fix skin with a GPT Image 2.5 edit: its edits lay the artefacts on the skin in the first place.
28. **GATE:** a skin pass is a paid still. Quote it and wait for the go.
29. There is no fallback after Seedream 5.5. When the pass does not get there, show the before-and-after on the card, say plainly what it missed, and wait for the user's word: another Seedream pass with other skin photographs is a new quote and a new go.
30. Show a before-and-after crop of the face on the card. The user may lock a split (the two portraits from the skin pass, the full body from the sheet before it): then match the borrowed panel's colour to the others' backdrop.
31. Re-check every briefed detail after any texture pass, Seedream edit or upscale, and the face and the counts with it, against the picture before it. Passes redraw eyes and seams and shift lash lines.

### One light, neutral colour
32. After the sheet is approved (and after the skin pass, when one ran) and before the lock, pick one lighting reference, usually the lead's approved sheet, and match every other sheet, full figure and front portrait to it, so the video model sees one shoot. References lit differently get averaged into a shifting skin tone.
33. Cut out each reference with Higgsfield `remove_background` and erode the mask about 3 px, so the old backdrop's glow at the edges is corrected too. Never use a flood fill: it leaks into subjects coloured like the backdrop (porcelain).
34. Measure with `sheet_light.py`, run `match_light.py` (black level, then white balance read from the backdrop, then backdrop brightness on the backdrop only), measure again. Put the before and after on the card.
35. Run `skin_check.py` against the targets in Checks. `match_light.py` matches the light, not the skin, so run the check after it.
36. A character out of band: regenerate or relight the sheet with the neutral block (then check the details again), or nudge the skin alone with `skin_tune.py`, a few degrees and up to about x1.4. Never fix skin with video credits.
37. The numbers are the check before a sheet is shown. The user judges by eye, and the user's eye decides.
38. Write each approved character's Y', chroma and hue into the card note, so later stills are checked against the same numbers.

### Fixing a still (any step)
39. Every fix is a Seedream 5.5 edit (the edit route: [[Flow v3.2 - 0 Standing rules]]). A small isolated fix: edit, then take back only that region into the approved image (`detail_composite.py --region`, a low `--thresh`).
40. If the edit moved nearby things, use the whole edit if it is coherent, or keep the box strictly around the change. A box that slices through a neighbouring object looks wrong.
41. When a chain of edits drifts, rebuild from the approved sheet and state counts outright ("exactly ONE …").
42. A coherent edit that passes the detail check is used whole. Composite only what specifically drifted, and say why on the card.

### Lock
43. Before the lock, make sure every reference has been through the light match and the colour check.
44. **GATE:** the user locks the character on a yes card that names it, or in words that name it ("<Name>: LOCKED"). Wait.
45. Copy the approved files out of the round folders under their names: `cast/C0N-<name>/pick.png`, `pick-face.png`. Nothing downstream reads from a round folder.
46. Register the locked sheet as an image element on Higgsfield. A locally made still has no Higgsfield id, so upload it with `upload.py`, which keeps the signed upload link out of the chat, the logs and every command line:
    - `upload.py plan` on the sheet prints the `media_upload` arguments. Call `media_upload` with exactly that list and save its response to a file without printing it.
    - `upload.py put` with that file PUTs the sheet, records its media id in `generations/upload-registry.json`, deletes the response file and prints the `media_confirm` call. Make it.
    - Then `manage_reference_elements action=create` with that media id. Name the element `<film code>-C0N-<Name>-v<n>`. Prompts name it as `<<<element-id>>>`.
47. Write the element into `elements.json` in the shape of `templates/elements.json`: under the character's ID, `name`, `id`, `media_id` and `source` (`cast/C0N-<name>/pick.png`). The `video_element` entry is filled in [[Flow v3.2 - 3 Voices and video elements]]. Add the lock to the character's `## Cast` entry in `brief.md` as the template shows it: the face file, the sheet file, the element name.
48. Leave every candidate that was shown where it is, marked as not used, its card note saying what changed and why it is dropped.
49. A change asked for after the lock is a new version on the same card. Register it as the next `-v<n>`, and move the old element under `replaces` in `elements.json` with why it was retired: the `higgsfield` MCP server cannot delete an element, so the entry is what keeps it out of use. List to the user everything already made from the old version as needing a redo.
50. "Locked" means go on, without asking, to [[Flow v3.2 - 3 Voices and video elements]]: the video element that carries face, costume and voice is next, quoted on its own card (step 21 there). The character's voice began at the face pick.

### Sheet variants (when a shot needs a state the sheet does not show)
Come back here from [[Flow v3.2 - 6 Scene prompts]] or [[Flow v3.2 - 8 Redos]].
51. Make a sheet variant for every wardrobe or prop state a generation must show and no reference shows (a sword drawn, a sheath empty, a coat torn). A state no reference shows drops out of the take.
52. **GATE:** a sheet variant is a paid still. Quote it and wait for the go.
53. Edit the character's own locked sheet, `cast/C0N-<name>/pick.png`, on its studio backdrop: one Seedream 5.5 edit on Higgsfield (`seedream_5_5`, the sheet as Image 1, `aspect_ratio: 16:9`, `resolution: 2k`), the state changed and nothing else.
54. Crop the edit to the body, below the face, so the face comes only from the video element. Keep the face only when the change is about the face itself, which is rare. Crop to the part of the body the shot frames: a full-length view can pull the framing wide.
55. Run the sheet-variant checks below. Save the edit and the crop in the refs folder of the generation that uses them: `generations/<G>/refs/`, for a pick-up `generations/FIX-<name>/refs/`.
56. **GATE:** show the variant on a card that asks for a yes (the edit, the crop, the state it shows, what you checked) and wait for the user's yes on it. Quote the generation or the redo that uses it only after that yes.

## Checks
- Every briefed detail in `brief.md`, panel by panel (1 front, 2 three-quarter, 3 head to toe), each panel cropped at full resolution, never judged from the downscaled sheet: present, on the same side, the same shape, size and colour in every view, scars and accessories included.
- One material per body region in every panel. Fix a material swap with a mask made from the material's colour, so the fix follows the seam.
- Panel 1 faces the lens, panel 2 really turns, panel 3 is not skewed and reaches the floor with the feet on it, hands empty and free. No floating busts, no makeup crept in, lips closed on the element sheet.
- The face at rest in every face, look and panel: no raised or knitted brows, no wide eyes, no smile, no pout, lips closed. Faces in a round differ by features, not expression.
- Nothing extra: no second copy of a detail, no garbled text.
- Any new view made from an approved image: the axis first, then which wall or side each thing belongs to, then left and right. Never fix it by mirroring: that fixes only left and right and hides the real error. Location views: [[Flow v3.2 - 4 Locations and props]].
- After any Seedream edit, texture pass, upscale, outpaint, relight or skin nudge: every detail again, and the identity and the counts against the picture before it.
- The cast side by side: costumes apart in colour, each costume visible against its location.
- A sheet variant: the new state is there, on the right side; every other briefed detail is unchanged; the crop holds no face unless the change is about the face; the crop frames only the part of the body the shot frames.
- `skin_check.py --stage sheet` (BT.709 Y'CbCr in 8-bit code units, medians on the key-lit skin). Never compare with the finish stage's `skin_survey.py`, which reads 3 to 10 units lower.

| What | Pass |
|---|---|
| Backdrop | plain mid-grey, about RGB 118/118/118 (18% grey), chroma 3 or less |
| Backdrop level | Y' 110 to 126, every sheet within 6 levels of the others |
| Skin hue | 121° to 129°, shared by the whole cast |
| Cast ratio | the palest character at least 0.80 of the richest in skin chroma |

- Luma and chroma differ by complexion: never equalise them, match the hue. A whole cast below the tool's chroma band (38 to 50) with the ratio held is a note on the card, not a defect: neutral sheets read lower.
- Screen with the auto mode and look at the `--show` sheet every time. When hair, a braid or brocade passes the mask, or a full figure's face is too small for it, write cheek-and-forehead boxes into a spec file and run with `--spec`.
- Say on the card what you checked.

## Outputs
- `brief.md`: the cast list with each character's brief, colours and details (size, material, side), and at the lock the face file, the sheet file and the element name.
- `cast/refs/`: the user's reference images.
- The round folders `cast/C0N-<name>/r<n>-<what>/`: every candidate, `prompts.json` for every Higgsfield job (Soul Cinema rounds, GPT Image and Nano Banana Pro first versions, Seedream edits: prompts, references, job ids, no result URL).
- `cast/C0N-<name>/pick.png` (the locked sheet) and `pick-face.png` (the picked face), with the character's other approved references (full view, front portrait, expression strip, mid-word mouth) in the same folder. Extras: the group image, `cast/C0N-C0N-<name>/pick.png`.
- `generations/upload-registry.json`: each uploaded sheet's media id, sha1 and size, written by `upload.py`.
- `elements.json`: per character the element's `name`, `id`, `media_id` and `source`, and under `replaces` any retired version.
- `generations/<G>/refs/` (a pick-up: `generations/FIX-<name>/refs/`): each sheet variant, the edit and its faceless crop, with its prompt and job id.
- One card per character: the rounds with one-line descriptions, before-and-after crops, the light measures before and after, what you checked, Y', chroma and hue, every candidate kept and marked as not used with what changed and why, and any post-lock version. One card per sheet variant.
- `$FILM/spend.md`: every paid job of the stage (Soul Cinema rounds, GPT Image and Nano Banana Pro first versions, Seedream edits, skin passes, sheet variants), logged as the standing rules say.
- `taste.md` at the studio root: every pick of the stage with its candidates, the user's words, your prediction and whether it was right.
- At release, the locked sheets and element ids go into the film's record: [[Flow v3.2 - 12 Release]]. Anything listed there is in use and is never deleted without the user's yes on that exact name.
- Contact sheets and scratch crops go to `$FILM/scratch.nosync/`, which the app's pages do not show; never to `/tmp` ([[Flow v3.2 - 0 Standing rules#Keeping things]]).

## Tools
Run from the studio folder with `.venv/bin/python` (it has Pillow and numpy). In every command `$FILM` is the full path to the film folder and `$FILM/…/` a file under it; a paid still's output goes into its round folder, with its prompt and job id in that folder's `prompts.json`. Every paid still runs on Higgsfield through the `higgsfield` MCP server; the scripts below are local and free. Unproven on a video-driven film, so check their output by eye and say so on the card: `detail_composite.py`, `figure_canvas.py`, `extend_figure.py`, `sheet_light.py`, `match_light.py`, `skin_check.py`, `skin_tune.py`.

| Script | Command | Does |
|---|---|---|
| Higgsfield `soul_cinematic` | `generate_image` (or `generate_image_batch`) through the `higgsfield` MCP server, a batch of twenty, `aspect_ratio: 3:4`, `quality: 2k`, `folder_id` the `cast` folder in `$FILM/higgsfield.json` | Face rounds. |
| Higgsfield `gpt_image_2_5` | `generate_image`, `variant: sunburst`, `quality: high`, `resolution: 2k`, `aspect_ratio: 3:4`, the user's reference as `image_references` when there is one, `folder_id` the `cast` folder | The second route for faces (step 13): a new face from text or from a reference, never an edit of an existing still. |
| Higgsfield `nano_banana_pro` | `generate_image`, `resolution: 2k`, the picture's aspect ratio, `folder_id` the `cast` folder | A non-human character's hero reference (step 7); a face route only when the user names it. |
| Higgsfield `seedream_5_5` | `generate_image` through the `higgsfield` MCP server, the picture to change as Image 1 (uploaded first with `upload.py` when it is a local still), its aspect ratio, `resolution: 2k`, `folder_id` the `cast` folder | Every edit: the looks, the sheet, the details, a new standing view, outpaints, fixes, sheet variants; and the skin pass, on request, with a skin photograph as Image 2. |
| Higgsfield `remove_background` | through the `higgsfield` MCP server | Cutouts for `match_light.py`, `skin_check.py`, `skin_tune.py`, `figure_canvas.py`. |
| `tools/higgsfield/upload.py` | `.venv/bin/python tools/higgsfield/upload.py plan $FILM $FILM/cast/C0N-<name>/pick.png`, then `.venv/bin/python tools/higgsfield/upload.py put $FILM --response <saved media_upload response>` | `plan`: new, changed or already uploaded, and the `media_upload` arguments. `put`: PUTs the file with curl, records the media id in `generations/upload-registry.json`, deletes the response file, prints the `media_confirm` call. |
| Higgsfield `media_upload`, `media_confirm`, `manage_reference_elements` | `media_upload` with the list `plan` prints, `media_confirm` as `put` prints, then `action=create` with the media id | Registers a local still as an image element. |
| `tools/stills/detail_composite.py` | `.venv/bin/python tools/stills/detail_composite.py $FILM/…/BASE.png $FILM/…/EDIT.png $FILM/…/OUT.png [--thresh 22] [--grow 6] [--feather 4] [--region x0,y0,x1,y1]... [--close R] [--erase x,y,r]... [--copy sx,sy,sr:dx,dy,dr[,squash]]... [--mask-out $FILM/scratch.nosync/MASK.png]` | Keeps BASE everywhere except where the edit really changed something; prints the share of edit pixels used. |
| `tools/stills/figure_canvas.py` | `.venv/bin/python tools/stills/figure_canvas.py $FILM/…/SHEET.png $FILM/…/CUTOUT.png $FILM/…/OUT_PREFIX --panel x0,y0,x1,y1 [--clear x0,y0,x1,y1 ...] [--size 1296x2304] [--at X,Y]` | Lays the full-body panel on a tall canvas of the sheet's backdrop for the outpaint; prints `--at` and `--cut`. Check `-mask.png` for pieces of a neighbouring view. |
| `tools/stills/extend_figure.py` | `.venv/bin/python tools/stills/extend_figure.py $FILM/…/CANVAS.png $FILM/…/MASK.npy $FILM/…/OUTPAINT.png $FILM/…/OUT.png --at X,Y [--fade 24] [--blend 300] [--cut Y]` | Lays the original figure back over the outpaint. Only when the outpaint drifted. |
| `tools/stills/sheet_light.py` | `.venv/bin/python tools/stills/sheet_light.py $FILM/…/SHEET.png [$FILM/…/SHEET.png ...] [--skin x0,y0,x1,y1 ...]` | Backdrop colour and warmth, black and white points; assumes three equal panels. |
| `tools/stills/match_light.py` | `.venv/bin/python tools/stills/match_light.py $FILM/…/REF.png $FILM/…/IN.png $FILM/…/OUT.png [--strength 1.0] [--cutout $FILM/…/IN-cutout.png] [--ref-cutout $FILM/…/REF-cutout.png]` | Matches IN's studio light to REF: black level, white balance, backdrop brightness. |
| `tools/stills/skin_check.py` | `.venv/bin/python tools/stills/skin_check.py --stage sheet [--cutouts $FILM/…/DIR] [--who NAME] [--show $FILM/scratch.nosync/OUT.jpg] $FILM/…/FILE_OR_DIR ...` or `... skin_check.py --stage sheet --spec $FILM/…/boxes.json --show $FILM/scratch.nosync/OUT.jpg` | Skin Y', chroma, hue, backdrop neutrality and level, cast ratio; prints the scale a failing character needs; exits 1 on a fail. |
| `tools/stills/skin_tune.py` | `.venv/bin/python tools/stills/skin_tune.py $FILM/…/IN.png $FILM/…/OUT.png [--cutout $FILM/…/IN-cutout.png] [--hue DEG] [--chroma SCALE] [--show $FILM/scratch.nosync/MASK.jpg]` | Hue and chroma nudge on the skin pixels only, in `skin_check.py`'s units. |
