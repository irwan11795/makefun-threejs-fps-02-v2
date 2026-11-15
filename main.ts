// Kestrel Yard — the threejs-fps-02 entry program (Node 22, standard library only).
// It takes the game and its screenshots from beside this file, copies them to the
// output directory, and writes the dossier the judge reads, using the vendored
// make.fun library unchanged from the kit.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.
// The program is deterministic: the same game/ and screenshots/ write the same
// dossier bytes every run, because buildDossier is deterministic and the copies
// carry the files as they are.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the scorer itself uses for this bounty (reference/gate.json): only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry the scorer
// would refuse — more than 4 screenshots or one over 256 KiB, more than 993
// files in game/ or 48 MiB of game files in all.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = countFiles(path);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

const game = countFiles(join(out, 'game'));
const shots = countFiles(join(out, 'screenshots'));
console.log(`Kestrel Yard: game/ ${game.files} files, ${game.bytes} bytes; screenshots/ ${shots.files} files, ${shots.bytes} bytes; dossier.json ${dossier.length} bytes.`);
