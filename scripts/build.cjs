const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'st-dropdown-frequency-sorter.user.js'), 'utf8').replace(/\r\n/g, '\n');
new vm.Script(content);
const payload = {
    type: 'script',
    enabled: true,
    name: '下拉菜单使用频率排序',
    id: '7c0d40c8-3a0c-4f16-a2cf-7ffb5c7b3165',
    content,
    info: '<p><a href="https://github.com/roocl/SillyTavern-Dropdown-Menu-Optimization#readme" target="_blank" rel="noopener noreferrer">使用说明</a></p>',
    button: { enabled: true, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
};
const output = path.join(root, `${payload.name}.json`);
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (process.argv.includes('--check')) {
    if (fs.readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== serialized) {
        throw new Error('Import JSON is out of date. Run node scripts/build.cjs.');
    }
} else {
    fs.writeFileSync(output, serialized, 'utf8');
}
