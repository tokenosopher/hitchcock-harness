"""Build a location's shared scene file (previz/rooms/<LID>.blend) from previz/rooms/<LID>-people.json (or .py) and the room
plan, if it is missing or out of date (or always, with --force). Scenes build it themselves when they need it; run this to
have it ready before the scene agents start, or after changing the people file.
    .venv/bin/python tools/previz/blender_run.py tools/previz/build_location.py -- --film $FILM --location L01 [--force]
It renders nothing, so it runs in the wrapper's fast lane."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from kit import *
if '-h' in sys.argv or '--help' in sys.argv:
    print(__doc__); sys.exit(0)
from kit import shared

lid = arg('--location')
if not lid: sys.exit('build_location: --location <LID> is required')
setup('rooms', 1.0)                         # (previz/rooms/ is the output folder; nothing else is written there)
path, st, built = shared.ensure(lid, force=has('--force'))
print('LOCATION DONE', path, 'built' if built else 'already up to date (stamp %s)' % st['stamp'])
