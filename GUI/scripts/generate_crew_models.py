#!/usr/bin/env python3
"""Generate one segmented body model per crew member (public/models/crew_C1..C4.glb).

The GUI's body model (public/models/anny_astronaut_bone_segmented.glb) is the neutral
Anny body (https://github.com/naver/anny, Apache-2.0; MakeHuman assets CC0) split into
17 segment meshes. This script rebuilds the same 17 meshes for a given sex, height and
body mass: every GLB vertex is matched to its Anny vertex once (exact match on the neutral
body), then the vertex positions are taken from Anny with the person's phenotype. The
segment split, indices and materials of the original file are kept unchanged.

Needs: pip install torch anny   (CPU is enough). Run from GUI/:
    python scripts/generate_crew_models.py            # all crew from src/data/crewProfiles.js
    python scripts/generate_crew_models.py --check    # only print the fit
"""
import argparse
import json
import re
import struct
import sys
import warnings
from pathlib import Path

import numpy as np
import torch

warnings.filterwarnings('ignore')
import anny  # noqa: E402

GUI = Path(__file__).resolve().parents[1]
BASE_GLB = GUI / 'public/models/anny_astronaut_bone_segmented.glb'
OUT_DIR = GUI / 'public/models'
PROFILES = GUI / 'src/data/crewProfiles.js'

# Anny phenotype: gender 0 = male, 1 = female (checked visually: 0 has no breasts).
GENDER = {'male': 0.0, 'female': 1.0}
MUSCLE = {'male': 0.6, 'female': 0.5}


def read_profiles():
    """crew code -> {sex, heightCm, massKg, model} parsed from crewProfiles.js."""
    text = PROFILES.read_text(encoding='utf-8')
    crew = {}
    for block in re.split(r"\n  \{\n", text)[1:]:
        code = re.search(r"code: '([^']+)'", block)
        fields = {k: re.search(rf"{k}: '?([\w.]+)'?", block) for k in ('sex', 'heightCm', 'massKg', 'model')}
        if code and all(fields.values()):
            crew[code.group(1)] = {k: m.group(1) for k, m in fields.items()}
    return crew


class Glb:
    def __init__(self, path):
        self.data = bytearray(path.read_bytes())
        json_len = struct.unpack('<I', self.data[12:16])[0]
        self.json = json.loads(self.data[20:20 + json_len])
        self.json_len = json_len
        self.bin_offset = 20 + json_len + 8

    def _span(self, accessor_index):
        acc = self.json['accessors'][accessor_index]
        view = self.json['bufferViews'][acc['bufferView']]
        start = self.bin_offset + view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return acc, start

    def positions(self):
        out = []
        for mesh in self.json['meshes']:
            acc, start = self._span(mesh['primitives'][0]['attributes']['POSITION'])
            out.append(np.frombuffer(self.data, np.float32, acc['count'] * 3, start).reshape(-1, 3).copy())
        return out

    def write_positions(self, per_mesh):
        for mesh, pos in zip(self.json['meshes'], per_mesh):
            index = mesh['primitives'][0]['attributes']['POSITION']
            acc, start = self._span(index)
            pos = np.ascontiguousarray(pos, dtype=np.float32)
            self.data[start:start + pos.nbytes] = pos.tobytes()
            acc['min'] = pos.min(0).tolist()
            acc['max'] = pos.max(0).tolist()
    def save(self, path):
        """Reassemble the GLB: new JSON chunk (padded to 4 bytes), the patched BIN chunk as is."""
        text = json.dumps(self.json, separators=(',', ':')).encode()
        text += b' ' * (-len(text) % 4)
        bin_chunk = bytes(self.data[20 + self.json_len:])  # BIN chunk header + data
        total = 12 + 8 + len(text) + len(bin_chunk)
        out = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(text), b'JSON') + text + bin_chunk
        path.write_bytes(out)


class Body:
    def __init__(self):
        self.model = anny.Anny().to(dtype=torch.float32)
        faces = self.model.faces
        self.tri = torch.cat([faces[:, [0, 1, 2]], faces[:, [0, 2, 3]]]) if faces.shape[1] == 4 else faces
        bones = len(self.model.bone_labels)
        self.pose = torch.eye(4)[None, None].expand(1, bones, 4, 4).clone()

    @torch.no_grad()
    def __call__(self, **phenotype):
        kwargs = {k: torch.tensor([float(phenotype.get(k, 0.5))]) for k in self.model.phenotype_labels}
        out = self.model(pose_parameters=self.pose, phenotype_kwargs=kwargs)
        rest = out['rest_vertices'][0]
        height = float(rest[:, 2].max() - rest[:, 2].min())
        v0, v1, v2 = rest[self.tri[:, 0]], rest[self.tri[:, 1]], rest[self.tri[:, 2]]
        mass = float((torch.cross(v0, v1, dim=-1) * v2).sum(-1).sum().abs() / 6) * 980.0
        return out['vertices'][0].numpy(), height, mass


def phenotype_for(body, sex, height_cm, mass_kg):
    """Height parameter by bisection on the measured height; weight parameter from BMI."""
    bmi = mass_kg / (height_cm / 100) ** 2
    pheno = {'gender': GENDER[sex], 'muscle': MUSCLE[sex], 'weight': float(np.clip(0.5 + (bmi - 23) * 0.06, 0, 1))}
    lo, hi = 0.0, 1.0
    for _ in range(18):
        mid = (lo + hi) / 2
        _, h, _ = body(**pheno, height=mid)
        lo, hi = (mid, hi) if h < height_cm / 100 else (lo, mid)
    pheno['height'] = (lo + hi) / 2
    return pheno


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true', help='print the fit, write nothing')
    parser.add_argument('--sample', nargs=2, metavar=('SEX', 'OUT'), help='write a neutral-size model of one sex (for checking)')
    args = parser.parse_args()

    body = Body()
    base = Glb(BASE_GLB)
    glb_meshes = base.positions()
    neutral, _, _ = body()
    # GLB vertex -> Anny vertex (the GLB duplicates seam vertices; every one must match exactly).
    neutral_t = torch.from_numpy(neutral)
    mapping = []
    for pos in glb_meshes:
        dist, idx = torch.cdist(torch.from_numpy(pos), neutral_t).min(1)
        if float(dist.max()) > 1e-3:
            sys.exit(f'GLB does not match the neutral Anny body (max distance {float(dist.max()):.4f} m)')
        mapping.append(idx.numpy())

    def write(vertices, out):
        glb = Glb(BASE_GLB)
        glb.write_positions([vertices[idx] for idx in mapping])
        glb.save(out)

    if args.sample:
        vertices, h, m = body(gender=GENDER[args.sample[0]])
        write(vertices, Path(args.sample[1]))
        print(f'{args.sample[0]}: {h:.3f} m, {m:.1f} kg -> {args.sample[1]}')
        return

    for code, p in read_profiles().items():
        pheno = phenotype_for(body, p['sex'], float(p['heightCm']), float(p['massKg']))
        vertices, h, m = body(**pheno)
        out = OUT_DIR / f"{p['model']}.glb"
        print(f"{code} {p['sex']:6} target {p['heightCm']} cm {p['massKg']} kg -> model {h * 100:.0f} cm, "
              f"volume mass {m:.0f} kg, phenotype {json.dumps({k: round(v, 3) for k, v in pheno.items()})}")
        if not args.check:
            write(vertices, out)
            print(f'   wrote {out.relative_to(GUI)} ({out.stat().st_size // 1024} kB)')


if __name__ == '__main__':
    main()
