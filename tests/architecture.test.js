import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Dependencies point inward: ui -> application -> domain, and infrastructure -> domain.
// Only a page's main.js (its composition root) may pick concrete adapters from infrastructure.
const SRC = resolve('src');
const ALLOWED = {
  domain: ['domain'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'domain'],
  ui: ['ui', 'application', 'domain'],
};
const BROWSER_APIS = /\b(document|window|localStorage|fetch|AudioContext|requestAnimationFrame)\b/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

const modules = files(SRC).map((path) => {
  const source = readFileSync(path, 'utf8');
  const imports = [...source.matchAll(/^import[^'"]*['"](.+?)['"]/gm)].map((m) => resolve(dirname(path), m[1]));
  return { path, name: relative(SRC, path).split(sep).join('/'), source, imports };
});
const layerOf = (path) => relative(SRC, path).split(sep)[0];

// index.html preloads every module its main.js reaches, so the browser fetches them all at once.
test('index.html preloads exactly the modules main.js imports', () => {
  const byPath = new Map(modules.map((m) => [m.path, m]));
  const entry = resolve(SRC, 'ui/plinko/main.js');
  const reached = new Set();
  const visit = (path) => {
    for (const target of byPath.get(path).imports) {
      if (reached.has(target)) continue;
      reached.add(target);
      visit(target);
    }
  };
  visit(entry);
  const wanted = [...reached].map((p) => relative(resolve('.'), p).split(sep).join('/')).sort();
  const html = readFileSync('index.html', 'utf8');
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="(.+?)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(preloaded, wanted);
});

test('every source file sits in a known layer', () => {
  for (const m of modules) assert.ok(layerOf(m.path) in ALLOWED, `${m.name} is outside the layer folders`);
});

test('imports only point inward', () => {
  for (const m of modules) {
    const layer = layerOf(m.path);
    for (const target of m.imports) {
      const to = layerOf(target);
      const rootMayWire = layer === 'ui' && m.name.endsWith('/main.js') && to === 'infrastructure';
      assert.ok(ALLOWED[layer].includes(to) || rootMayWire, `${m.name} (${layer}) must not import ${to}: ${relative(SRC, target)}`);
    }
  }
});

test('domain and application code never touch the browser', () => {
  for (const m of modules.filter((m) => ['domain', 'application'].includes(layerOf(m.path)))) {
    const code = m.source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, BROWSER_APIS, `${m.name} uses a browser API`);
  }
});
