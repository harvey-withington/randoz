// Every string key the code uses must exist in locales/en.json, and every
// key in the file must be used, so the file never drifts from the app.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const strings = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8')) as Record<string, string>;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const source = [...sourceFiles(path.join(root, 'src')), path.join(root, 'App.tsx')]
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

// Keys appear as quoted 'section.name' strings, in t(), plural() and ternaries.
const used = new Set([...source.matchAll(/'([a-z][A-Za-z]*\.[A-Za-z]+)'/g)].map((match) => match[1]));

test('every string key the code uses exists', () => {
  const missing = [...used].filter((key) => !(key in strings));
  assert.deepEqual(missing, []);
});

test('every string in the file is used', () => {
  const unused = Object.keys(strings).filter((key) => !used.has(key));
  assert.deepEqual(unused, []);
});

test('placeholders are well formed', () => {
  for (const [key, text] of Object.entries(strings)) {
    const stripped = text.replace(/\{\w+\}/g, '');
    assert.ok(!/[{}]/.test(stripped), `${key} has a broken placeholder`);
  }
});
