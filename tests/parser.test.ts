import assert from 'node:assert';
import { resolve } from 'path';
import { parseFile } from '../src/tools/parseFile.js';

async function testTypeScript() {
  const base = resolve('tests/fixtures/typescript/simple.ts');
  const result = await parseFile({ filePath: base });
  assert.strictEqual(result.language, 'typescript');
  assert.ok(result.imports.find(i => i.source.endsWith('helper')));
  assert.ok(result.exports.includes('default'));
  assert.ok(result.definitions.find(d => d.name === 'greet'));
}

async function testReexports() {
  const filePath = resolve('tests/fixtures/typescript/reexport.ts');
  const result = await parseFile({ filePath });
  const reexportImport = result.imports.find(i => i.source.endsWith('./more'));
  assert.ok(reexportImport, 'captures export * source');
}

async function testTSX() {
  const filePath = resolve('tests/fixtures/typescript/component.tsx');
  const result = await parseFile({ filePath });
  assert.strictEqual(result.language, 'typescript');
  assert.ok(result.definitions.find(d => d.name === 'Component'));
}

async function testCommonJS() {
  const filePath = resolve('tests/fixtures/javascript/commonjs.js');
  const result = await parseFile({ filePath });
  assert.strictEqual(result.language, 'javascript');
  assert.ok(result.exports.includes('read'), 'captures named export from exports.*');
  assert.ok(result.exports.includes('default'), 'captures module.exports assignment');
}

async function testHaskell() {
  const filePath = resolve('tests/fixtures/haskell/Simple.hs');
  const result = await parseFile({ filePath });
  assert.strictEqual(result.language, 'haskell');
  assert.ok(Array.isArray(result.imports));
  assert.ok(Array.isArray(result.exports));
}

async function testPureScript() {
  const filePath = resolve('tests/fixtures/purescript/Simple.purs');
  const result = await parseFile({ filePath });
  assert.strictEqual(result.language, 'purescript');
  assert.ok(Array.isArray(result.imports));
  assert.ok(Array.isArray(result.exports));
}

async function run() {
  await testTypeScript();
  await testReexports();
  await testTSX();
  await testCommonJS();
  await testHaskell();
  await testPureScript();
  console.log('Parser tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
