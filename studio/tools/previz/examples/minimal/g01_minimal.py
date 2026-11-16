"""The README's minimal scene: one room, two figures, three shots, one line, one move.
    .venv/bin/python tools/previz/blender_run.py tools/previz/examples/minimal/g01_minimal.py -- --film <film> [--grey] [--panels | --check]"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))); from kit import *

setup('G01', 6.0, title="You're late")
R = room('L01')                                            # the kitchen from film.json
anna, ben = figure('ANNA'), figure('BEN')                  # heights from the cast

sit(anna, 0.0, R.seat('chair'), hands='lap')               # at the table, facing south (the chair's facing)
look_at(anna, 0.0, (0.8, 0.0, 1.7))                        # watching the door
stand(ben, 0.0, loc=(0.8, -0.7), facing=90)                # outside the door, facing in
R.open_door('door', 0.3, 0); R.open_door('door', 0.9, 95)  # he pushes it open
walk(ben, [(0.8, -0.7), (0.8, 0.7), (1.45, 1.15)], 0.6, 3.2)
turn(ben, 3.2, 3.6, 45)                                    # to face her
look_at(anna, 3.4, eyes_world(ben, 3.4))
look_at(ben, 3.6, eyes_world(anna, 3.6), hold=6.0)
idle(anna, 3.4, 6.0, head=False); idle(ben, 3.6, 6.0, head=False)

eA, eB = eyes_world(anna, 4.2), eyes_world(ben, 5.5)
shot('1', 0.0, 3.4, 84, (3.8, 0.2, 1.6), (1.2, 1.4, 1.0), in_frame=['ANNA', 'BEN', 'DOOR'])
shot('2', 3.4, 5.0, 47, ring(eA, 235, 1.1), eA, in_frame=['ANNA'], fx=0.25)
shot('3', 5.0, 6.0, 63, (3.5, 2.2, 1.55), eB, in_frame=['BEN'], move=dict(pos=(3.2, 2.05, 1.55)))   # a slow push in
run(lines=[dict(who='ANNA', text="You're late.", t=[3.9, 4.6])],
    moves=[dict(who='BEN', what='comes in through the door and stops at the end of the table', t=[0.6, 3.2])])
