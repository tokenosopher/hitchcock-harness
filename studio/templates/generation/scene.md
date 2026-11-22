<!-- Read by: tools/prompts/assemble.py, which copies only ## Shots (each ### SHOT block, the *Builder* lines dropped), ## ACTING TASKS and ## FIGHT BEATS into the prompt; tools/prompts/check.py then checks that prompt against <G>-shots.json and the previz take.
     Described in: Flow v3.3 - 5 Previz and storyboards (steps 1-4) and Flow v3.3 - 6 Scene prompts (steps 3-9); the methods in Flow v3.3 - 6a Prompt engine, 6b Acting and 6c Fight scene. -->
# <G> · <generation name>

**Location:** <LID> <location>  
**Length:** <n> s (the lines at each speaker's pace plus about 1 s a shot; whole seconds, 4 to 30)  
**Shots:** <n>  
**Characters:** <TAG>, <TAG> (<TAG> is present but out of every frame)  
**Lines:** word for word from script v<N> (LOCKED).  
**Fight:** <none: delete ## FIGHT BEATS | yes: ## FIGHT BEATS from Flow v3.3 - 6c Fight scene>

## The scene (prompt engine)

**Goal (<NAME>):** <…>. **Obstacle:** <…>. **Tactic:** <…> → <what its failure returns>. **Reversal:** <…>. **Value shift:** <character: before → after>.

## Decisions made in this pass

- <The user, <YYYY-MM-DD>: the decision, in their words where they gave them.>

## Geography

- <Location> metres, origin at <where>, on the floor; +X <compass>, +Y <compass>, Z up. <The furniture, doors and practical lights, with coordinates.>
- Compass (fixed backdrop): N <…>; E <…>; S <…>; W <…>.
- <The previous generation's END STATE positions this one starts from.>

## START STATE

- **[<TAG>]** <where (x, y), facing which way, pose, what is in which hand>.
- **[<TAG>]** <…; out of frame if so>.
- **[<PROP TAG>]** <where it is, its state>.

## END STATE

- **[<TAG>]** <where, facing, pose, what is in which hand; it must match the next generation's START STATE>.
- **[<PROP TAG>]** <its state>.

## Shots

Each shot: a header with no seconds (assemble.py adds the panel numbers), then Size, Placement, Angle, Lens, Mount, Focus, a line each, then the italic Builder line (Blender only), then In shot: naming only what is in the frame, by [TAG], in order. When the next shot is a close-up of the same person or object, the shot ends locked in the pose the close-up opens on, written on both sides of the cut. The In shot: lines hold the actions and the lines, never a face beat: face beats live only in ## ACTING TASKS. This paragraph is not copied into the prompt.

### SHOT 1: <SHOT NAME> (CAM FACING: <N | NE | E | SE | S | SW | W | NW>)

**Size:** <Wide, exactly as framed there.>
**Placement:** exactly [<LOC> WIDE], the same camera, lens, framing and look, with the people in it. The view shows the set EMPTY; in this shot [<TAG>] <is where>, [<TAG>] starts <where>.
**Angle:** <eye level | low, looking up | from just above>.
**Lens:** <30° | 47° | 63° | 84°: extreme close-up 30°, close-up 47°, medium 63°, wide 84°; never 84° on a face>.
**Mount:** <locked off | handheld | one controlled move: what moves, which way>.
**Focus:** <whose eyes, or which object>.

*Builder: camera <m> m <compass> of <someone or something in frame>, <location> x <x>, y <y>, <h> m high, facing <compass> (yaw <deg>°), tilted <up | down> <deg>°.*

In shot:
- [<TAG>]: <what they do, in order, one short sentence an action, every move in camera terms: screen left or right, toward or away from the lens>.
- [<TAG>]: <what they do meanwhile; any crowd in frame moves, never a frozen backdrop>.
- [<TAG>] ends locked in the pose shot 2 opens on: <head position, eyeline, hands>.
- HARD CUT.

### SHOT 2: <SHOT NAME> (CAM FACING: <compass>)

**Size:** <Close-up, exactly as framed there.>
**Placement:** <What the camera looks at and where it stands, by landmarks, relative to the set and to what is in frame>; <the part of the view behind the shot> of [<LOC> BACK] soft behind <them>.
**Angle:** <…>.
**Lens:** 47°.
**Mount:** <…>.
**Focus:** <whose eyes>.

*Builder: camera <…>.*

In shot:
- [<TAG>]: opens on the pose shot 1 ended on: <head position, eyeline, hands>; <the action that leads into the line flows straight into it>; [<TAG>] speaks, <how>, to <whom>:
- <NAME>: "<the line, word for word>"
- [<TAG>]: <for a short line: says it once, then holds, silent>.
- [<PROP TAG>]: <where it sits in frame after the move; a rigid prop is one rigid piece in every frame>.
- <Sound in this shot, when it matters: what is heard, never a clock time.>

## Lines

| who | line | shot | delivery |
|---|---|---|---|
| <NAME> | "<word for word>" | 1 | <how, to whom> |

## ACTING TASKS

SCENE DIRECTION (shared, unspoken): <one line everyone in the scene plays>. Everyone fully invested in the tactic; the work happens in the eyes.

**ACTING TASK — [<TAG>]**

- MOTIVE: <…>.
- GOAL: <…>.
- OBSTACLE: <…>.
- TACTIC: <…>.
- Moment to moment (task, then the face):
  - "<line or beat>" — <the task, a verb aimed at the partner>; face: <two to four small beats, in order: brows, mouth, eyes; never a bare emotion word or a stillness word>.
  - <a listening beat> — <the task>; face: <…>.

**ACTING TASK — [<TAG>]** (every character in frame gets one, listeners and silent characters too)

- MOTIVE: <…>.
- GOAL: <…>.
- OBSTACLE: <…>.
- TACTIC: <…>.
- Moment to moment (task, then the face):
  - <beat> — <task>; face: <…>.

The faces stay alive while they speak, never frozen and never exaggerated, with natural blinking.

## FIGHT BEATS

- BEAT 1 (shot <n>): <the position>; <the strike: limb and target>; <the physical reaction>; <the new position>.
- BEAT 2 (shot <n>): <…>.
- Camera notes: <mediums show the move; close-ups sell the contact; the stage shrunk to within <n> m of <landmark>>.


## Storyboard beats (stills to pull from the previz)

| shot | beat | what the still shows |
|---|---|---|
| 1 | opening frame | <…> |
| 1 | <beat of action> | <…> |
| 1 | last frame (the close-up lock pose, if any) | <…> |
| 2 | opening frame | <…> |

The panel times live in the previz scene script (`run(panels=[(shot id, t, caption)])`), never here and never on a panel.

## For the previz builder

- <What someone looks at past the lens, and where people move off camera: facts the shot text must never name.>
- <Moves that happen off camera, with the shot they fall in.>
