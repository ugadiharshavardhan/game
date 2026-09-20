#!/usr/bin/env node
/**
 * Compresses the village's PBR texture sets to KTX2/Basis (UASTC for normals, ETC1S for the rest).
 *
 *   node tools/textures/encode-ktx2.mjs            # every set under public/assets/textures
 *   node tools/textures/encode-ktx2.mjs Bricks084  # one set
 *
 * Why it matters: a 2K WebP is small on disk and enormous in video memory — the GPU decompresses
 * it to raw pixels, about 16 MB with mipmaps. A KTX2 texture stays compressed on the GPU, which
 * is roughly an 8× saving in memory and the difference between the game fitting on a mid-range
 * phone and thrashing. The runtime downscale in TextureBank saves the memory but not the
 * download; this saves both.
 *
 * It needs the KTX tools (`brew install ktx`, or the binaries from the KTX-Software releases) and
 * it is slow — minutes for the whole set, and it pins every core. Run it once, on a machine you
 * are not also playing on, and commit the output.
 *
 * Afterwards: register `KTX2Loader` in TextureBank (three/examples/jsm/loaders/KTX2Loader.js),
 * point it at the transcoder in `node_modules/three/examples/jsm/libs/basis/`, and load
 * `Color.ktx2` in place of `Color.webp`. Keep the .webp files: they are the fallback for browsers
 * without the right texture extensions.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = 'public/assets/textures';
/** Normals need the higher-quality mode; colour and roughness do not. */
const UASTC = /Normal/i;

const sets = process.argv.slice(2);
const names = sets.length ? sets : readdirSync(ROOT).filter((n) => statSync(join(ROOT, n)).isDirectory());

try {
  await run('ktx', ['--version']);
} catch {
  console.error('The KTX tools are not installed. `brew install ktx`, or see https://github.com/KhronosGroup/KTX-Software/releases');
  process.exit(1);
}

let done = 0;
for (const name of names) {
  const dir = join(ROOT, name);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.webp'))) {
    const source = join(dir, file);
    const target = source.replace(/\.webp$/, '.ktx2');
    if (existsSync(target)) continue;
    const options = UASTC.test(file)
      ? ['--encode', 'uastc', '--uastc-quality', '2', '--zcmp', '18']
      : ['--encode', 'basis-lz', '--clevel', '2', '--qlevel', '128'];
    // Colour maps are sRGB; normals and roughness are data.
    const colourspace = /Color/i.test(file) ? ['--assign-oetf', 'srgb'] : ['--assign-oetf', 'linear'];
    await run('ktx', ['create', ...options, ...colourspace, '--generate-mipmap', '--format', 'R8G8B8A8_SRGB', source, target]);
    console.log(`${++done}  ${target}`);
  }
}
console.log(`\n${done} textures encoded. Nothing in the game reads them yet — see the note at the top of this file.`);
