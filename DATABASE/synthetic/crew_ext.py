"""crew_ext.py | the six crew members added to the Mars habitat mission (C5..C10, SYN-05..SYN-10).

Shared by every Mars generator (generate.py --dataset mars, habitat_generate.py, wearables_generate.py,
medical_generate.py, cognitive_generate.py). The original crew C1..C4 (SYN-01..SYN-04) stays defined in each
generator and keeps its random streams, so its generated data is byte-identical to the version before this file.
Every added person gets an own random stream derived from the generator seed and the person code (stream_seed),
which makes their data independent of the order of the loops and of each other.

Names were given by the team; roles, callsigns and attributes were drawn at random (seed 895589).
Names are not stored in the database (astro_core.subject has none); the GUI keeps them in its crew profiles.
FICTIONAL people, synthetic data.
"""
from __future__ import annotations

import zlib

NEW_CREW = [
    dict(code="SYN-05", name="Żytomira Będzisławska", crew="C5", sex="F", age=55, age_band="50-59", mass=65.8, home="module_M1",
         work=("tunnel_common", "farm"), gym=18.0, career_msv=28.6, role="Pilot / flight engineer", callsign="SMOLUCH"),
    dict(code="SYN-06", name="Jędżej Podolski", crew="C6", sex="M", age=51, age_band="50-59", mass=87.9, home="module_M2",
         work=("ambulatory", "tunnel_common"), gym=13.5, career_msv=2.9, role="ISRU & power engineer", callsign="MOTYKA"),
    dict(code="SYN-07", name="Światosław Ryt", crew="C7", sex="M", age=53, age_band="50-59", mass=84.6, home="module_M2",
         work=("lab", "tunnel_common"), gym=18.0, career_msv=2.3, role="EVA specialist", callsign="BURSZTYN"),
    dict(code="SYN-08", name="Andrzej Świętopełek", crew="C8", sex="M", age=54, age_band="50-59", mass=78.8, home="module_M1",
         work=("farm", "tunnel_common"), gym=16.5, career_msv=57.4, role="Habitat botanist", callsign="RZEPA"),
    dict(code="SYN-09", name="Kunekunda Krzeszowska", crew="C9", sex="F", age=52, age_band="50-59", mass=66.3, home="module_M1",
         work=("farm", "lab"), gym=15.0, career_msv=32.8, role="Psychologist", callsign="SZPERACZ"),
    dict(code="SYN-10", name="Czesława Życińska", crew="C10", sex="F", age=41, age_band="40-49", mass=60.1, home="module_M2",
         work=("farm", "ambulatory"), gym=16.5, career_msv=54.9, role="Robotics engineer", callsign="KRET"),
]

NEW_CREW_CODES = [p["crew"] for p in NEW_CREW]          # C5..C10
NEW_SUBJECT_CODES = [p["code"] for p in NEW_CREW]       # SYN-05..SYN-10
BY_CREW = {p["crew"]: p for p in NEW_CREW}

# EVA pairs of the added crew: their own rotation, 3 sols after the original crew's EVA days
NEW_EVA_PAIRS = [("C7", "C5"), ("C6", "C10"), ("C7", "C8"), ("C9", "C6"), ("C7", "C10"), ("C5", "C8")]
NEW_EVA_OFFSET = 3


def stream_seed(seed: int, code: str, salt: str = "") -> int:
    """Deterministic per-person seed: same generator seed + same person -> same stream."""
    return zlib.crc32(f"{seed}|{code}|{salt}".encode()) & 0x7FFFFFFF
