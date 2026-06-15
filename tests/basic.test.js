import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
test('project has required files', () => {
  for (const f of ['server.js','package.json','public/index.html','public/app.js','public/styles.css']) {
    assert.equal(fs.existsSync(f), true, `${f} missing`);
  }
});
test('agents load as json', () => {
  const files = fs.readdirSync('agents').filter(f=>f.endsWith('.json'));
  assert.ok(files.length >= 3);
  for (const f of files) assert.ok(JSON.parse(fs.readFileSync(`agents/${f}`,'utf8')).name);
});
