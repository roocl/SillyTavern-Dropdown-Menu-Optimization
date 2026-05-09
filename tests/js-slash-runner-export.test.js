const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'st-dropdown-frequency-sorter.user.js');
const exportPath = path.join(root, '酒馆助手脚本-下拉菜单使用频率排序.json');

const script = fs.readFileSync(scriptPath, 'utf8');
const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

assert.equal(exported.type, 'script');
assert.equal(exported.enabled, true);
assert.equal(exported.name, '下拉菜单使用频率排序');
assert.match(exported.id, /^[0-9a-f-]{36}$/);
assert.equal(exported.content, script);
assert.equal(exported.button.enabled, true);
assert.deepEqual(exported.button.buttons, []);
assert.deepEqual(exported.data, {});
assert.deepEqual(exported.export_with, { data: true, button: true });

console.log('js-slash-runner export tests passed');
