<!-- Read by: tools/prompts/assemble.py: '@KEY' in a MEDIA description or a TAGS line of any <G>-prompt-spec.md becomes the text of this file's '## KEY' section (the longest key wins, so '@<NAME> SHEET' beats '@<NAME>'). Only there: an '@KEY' in any other section stays as typed and check.py stops on it.
     Described in: Flow v3.2 - 6 Scene prompts (step 10: a description used by more than one generation is written once, here); the VOICE line and the sheets-only sentence from Flow v3.2 - 3 Voices and video elements (steps 30-33). -->
# Shared reference descriptions for every generation's prompt (assemble.py pulls them with @KEY)
Written once so every generation describes every character, view and prop the same way. Sources: the element prompts (elements/<CID>/E-<CID>-v<N>-5s.prompt.txt), the brief, the picked sheets, the location views' prompts. Nothing above the first ## heading is used.
A sheet section only for what has no video element (an extras' group, a prop, a character with no element) or for a faceless sheet variant: a costume or prop state the element does not show. Never a sheet for a character beside its element: the two compete.

## <NAME>
<Name>, <age>, <build>. <Hair>, <eyes>, <skin detail>; <every costume piece, head to toe, shoes last>. VOICE: the voice heard in this reference, <pitch>, with a <accent> accent.

## <NAME> SHEET
<Name>'s <costume or prop state> that the video reference does not show, a faceless sheet: <what it shows, head to toe>, the same <woman | man | person> as [<NAME>].

## <GROUP TAG>
<The extras, the same ones in every shot: what they wear, head to toe; what hides their faces, if anything>. [<CID>] is <the taller one | …>, [<CID>] <the other>.

## <PROP TAG>
<The prop: its size against a body part, its material and colour, its parts>. Wherever <it is used | it is out of its case>, it is <this, exactly>.

## <VOICE TAG>
<A voice no element carries: who speaks, pitch, texture>. Every line <who> speaks is in exactly this voice.

## <LOC> FRONT
The <location> looking <compass> from <where>: <what fills the frame, near to far>; <the practical light sources>; <where the doors are in this view>.

## <LOC> BACK
The <location> looking <compass>: <what lies behind anyone who faces <the opposite compass>>. The background for every face that looks <compass>.

## SHEETS ONLY
The video references are character sheets only: their split-screen layout, grey studio background and studio light are not part of this scene.
