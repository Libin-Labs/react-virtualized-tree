import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run using npm run test:package.');
const temporary = await mkdtemp(join(tmpdir(), 'virtualized-tree-consumer-'));
const runNpm = (args) => execFileSync(process.execPath, [npm, ...args, '--dry-run=false'], { encoding: 'utf8' });
try {
  const [packed] = JSON.parse(runNpm(['pack', root, '--ignore-scripts', '--json', '--pack-destination', temporary]));
  const paths = new Set(packed.files.map((file) => file.path));
  for (const path of ['dist/index.js', 'dist/cjs/index.js', 'dist/cjs/package.json', 'dist/index.d.ts']) assert.ok(paths.has(path), `Missing packed file: ${path}`);
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  runNpm(['install', '--prefix', temporary, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', join(temporary, packed.filename), join(root, 'node_modules/react'), join(root, 'node_modules/react-dom')]);
  const require = createRequire(join(temporary, 'consumer.cjs'));
  const api = require(manifest.name);
  assert.equal(api, require(join(temporary, 'node_modules', manifest.name)));
  const { createElement } = require('react');
  const { renderToString } = require('react-dom/server');
  assert.match(renderToString(createElement(api.Tree, { nodes: [{ id: 'one', name: 'Installed CJS' }] })), /Installed CJS/);
  const consumer = `
    import assert from 'node:assert/strict';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import Tree, { flattenTree } from ${JSON.stringify(manifest.name)};
    const nodes = [{ id: 'one', name: 'Installed ESM' }];
    assert.equal(flattenTree(nodes).length, 1);
    assert.match(renderToString(createElement(Tree, { nodes })), /Installed ESM/);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', consumer], { cwd: temporary, stdio: 'pipe' });
  console.log(`Packed ${manifest.name}@${manifest.version}: isolated ESM/CJS SSR consumers and legacy main passed.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}