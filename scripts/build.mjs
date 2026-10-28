import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/cjs', { recursive: true });
await Promise.all([['esm', 'dist/index.js'], ['cjs', 'dist/cjs/index.js']].map(([format, outfile]) => build({
  entryPoints: ['src/index.js'], outfile, bundle: true, minify: true, sourcemap: true,
  platform: 'neutral', target: 'es2020', format, external: ['react'], banner: { js: '"use client";' },
})));
await writeFile('dist/cjs/package.json', '{"type":"commonjs"}\n');
await copyFile('src/index.d.ts', 'dist/index.d.ts');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.browser, manifest.module);
assert.equal(manifest.exports['.'].require, manifest.main);
assert.equal(manifest.exports['.'].import, manifest.module);
const esm = await import(new URL(`../${manifest.module}`, import.meta.url));
const require = createRequire(import.meta.url);
const cjs = require(manifest.name);
const legacy = require('../');
assert.equal(cjs, legacy);
for (const name of ['Tree', 'FilteringContainer', 'Expandable', 'Selectable', 'NodeRenderer', 'flattenTree', 'updateNode', 'filterTree', 'getWindow']) {
  assert.ok(esm[name], `Missing ESM export: ${name}`);
  assert.ok(cjs[name], `Missing CommonJS export: ${name}`);
}
assert.equal(esm.default, esm.Tree);
assert.equal(cjs.default, cjs.Tree);
const fixture = [{ id: 'root', state: { expanded: true }, children: [{ id: 'leaf' }] }];
assert.deepEqual(esm.flattenTree(fixture).map(({ node }) => node.id), ['root', 'leaf']);
await build({ entryPoints: [manifest.browser], bundle: true, write: false, platform: 'browser', format: 'iife', external: ['react'], target: 'es2020', logLevel: 'silent' });
const bytes = await readFile('dist/index.js');
assert.match(bytes.toString(), /^"use client";/);
const compressed = gzipSync(bytes).length;
console.log(`ESM: ${bytes.length} bytes minified; ${compressed} bytes gzip. React is external; other runtime dependencies: 0.`);
assert.ok(compressed <= 10240, 'Bundle exceeded the 10 KiB gzip size budget.');
console.log('ESM, CommonJS, legacy main, browser entry, and client directive verified.');