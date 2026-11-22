<!-- Read by: tools/previz/views_cams.py (adds the Camera column after "Painted over"; --write) and tools/previz/precheck.py (the plate check reads the Camera and "Used by" columns).
     Described in: Flow v3.3 - 4 Locations and props (step 8: every painted view, its plate and the shots it serves) and Flow v3.3 - 5 Previz and storyboards (the free checks). -->
# Views: <Film>

One table per location. The tag in the first column is the tag every prompt and scene file uses for that view (capital words only, no digits, in square brackets). "Painted over" names the plate the view was painted over in backticks: a shot's own plate (`previz/<G>/plates/cam<shot>-<t>-empty.png`, written by the kit's `--plate`) gets its camera from views_cams.py; any other plate (a colour plate of the master, front or back) gets "-". "Used by" lists the shots it serves as `<G> shots <n>, <n>`, one generation after another (`S1 shots 1, 3; S4 shot 2`). Do not write the Camera column by hand: `views_cams.py --write` adds and refreshes it.

## L01 <name>

| View | File | Painted over | Used by |
|---|---|---|---|
| [<PLACE> MASTER] | `locations/L01-<name>/L01-<name>-master-v1.png` | `previz/L01/plates-colour/camMASTER-colour.png` | the look of the place |
| [<PLACE> FRONT] | `locations/L01-<name>/L01-<name>-front-v1.png` | `previz/L01/plates-colour/camFRONT-colour.png` | S1 shots 1, 3 |
| [<PLACE> GATE WIDE] | `locations/L01-<name>/L01-<name>-wide-S2-v1.png` | `previz/S2/plates/cam1-00.00-empty.png` | S2 shot 1 |
