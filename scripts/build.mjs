// Build: copy only the files the game needs at runtime into dist/.
// No bundler or dependencies; the game is plain ES modules. The output is
// checked for file types some hosting platforms reject.
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist');
const INCLUDE = ['index.html', 'sw.js', 'manifest.json', 'css', 'fonts', 'icons', 'src'];
const FORBIDDEN = new Set(['.webmanifest', '.glb', '.gltf']);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const item of INCLUDE) await cp(join(root, item), join(out, item), { recursive: true });

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

const files = await walk(out);
const bad = files.filter((f) => FORBIDDEN.has(extname(f).toLowerCase()));
if (bad.length) {
  console.error('Build contains disallowed file types:\n' + bad.map((f) => '  ' + relative(out, f)).join('\n'));
  process.exit(1);
}
let bytes = 0;
for (const f of files) bytes += (await stat(f)).size;
const types = [...new Set(files.map((f) => extname(f).toLowerCase()))].sort().join(' ');
console.log(`Built ${files.length} files (${(bytes / 1024).toFixed(0)} KB) into dist/`);
console.log(`File types: ${types}`);
