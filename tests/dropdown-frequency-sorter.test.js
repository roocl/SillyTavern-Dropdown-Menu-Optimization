const assert = require('node:assert/strict');
const sorter = require('../st-dropdown-frequency-sorter.user.js');

function option(text, originalIndex) {
    return {
        text,
        value: text,
        originalIndex,
        selected: false,
    };
}

const original = [
    option('Alpha', 0),
    option('Beta', 1),
    option('Gamma', 2),
];

assert.deepEqual(
    sorter.__test.sortOptions(original, {}, 'frequency').map(x => x.text),
    ['Alpha', 'Beta', 'Gamma'],
    'frequency mode keeps default order when counts are equal',
);

assert.deepEqual(
    sorter.__test.sortOptions(original, { Gamma: 4, Alpha: 1 }, 'frequency').map(x => x.text),
    ['Gamma', 'Alpha', 'Beta'],
    'frequency mode sorts higher counts first',
);

assert.deepEqual(
    sorter.__test.sortOptions(original, { Gamma: 4, Alpha: 1 }, 'default').map(x => x.text),
    ['Alpha', 'Beta', 'Gamma'],
    'default mode ignores frequency counts',
);

const usage = sorter.__test.createUsageStore();
usage.record('preset', 'Beta');
usage.record('preset', 'Beta');
usage.record('world', 'Gamma');
assert.equal(usage.get('preset', 'Beta'), 2, 'usage store counts repeated selections');
assert.equal(usage.get('world', 'Gamma'), 1, 'usage store keeps menu scopes separate');
usage.clear('preset');
assert.equal(usage.get('preset', 'Beta'), 0, 'usage store clears one scope without touching others');
assert.equal(usage.get('world', 'Gamma'), 1, 'usage store preserves other scopes after scoped clear');

const parentGlobal = { document: { nodeType: 9 } };
const iframeGlobal = {
    frameElement: {},
    parent: parentGlobal,
    document: { nodeType: 9 },
};
assert.equal(
    sorter.__test.resolveHostGlobal(iframeGlobal),
    parentGlobal,
    'script resolves JS-Slash-Runner iframe execution to the SillyTavern parent window',
);

const settingsHtml = sorter.__test.createSettingsPanelHtml('default', 'frequency');
assert.match(settingsHtml, /inline-drawer/);
assert.match(settingsHtml, /inline-drawer-toggle inline-drawer-header/);
assert.match(settingsHtml, /inline-drawer-content/);
assert.match(settingsHtml, /id="stdfs-preset-mode"/);
assert.match(settingsHtml, /id="stdfs-world-mode"/);
assert.match(settingsHtml, /id="stdfs-clear-preset"/);
assert.match(settingsHtml, /id="stdfs-clear-world"/);
assert.match(settingsHtml, /id="stdfs-show-preset-stats"/);
assert.match(settingsHtml, /id="stdfs-show-world-stats"/);
assert.match(settingsHtml, /stdfs-settings__square-button/);
assert.doesNotMatch(settingsHtml, /stdfs-control/);

assert.deepEqual(
    sorter.__test.getSelectionLabels(
        { selectedOptions: [{ text: 'Alpha' }, { textContent: 'Beta' }] },
        { params: { data: { text: 'Gamma' } } },
    ),
    ['Gamma'],
    'select2 events record only the world selected by the current interaction',
);

assert.deepEqual(
    sorter.__test.getSelectionLabels(
        { selectedOptions: [{ text: 'Alpha' }, { textContent: 'Beta' }] },
        {},
    ),
    ['Alpha', 'Beta'],
    'native changes fall back to selected options',
);

const gate = sorter.__test.createSelect2ChangeGate();
const selectElement = {};
assert.equal(gate.shouldSkip(selectElement, 'select2:select', 1000), false);
assert.equal(gate.shouldSkip(selectElement, 'change', 1100), true);
assert.equal(gate.shouldSkip(selectElement, 'change', 1400), false);

assert.equal(
    sorter.__test.formatUsageStats('preset', { Beta: 2, Alpha: 5 }),
    '预设点击次数统计\n\n1. Alpha: 5\n2. Beta: 2',
);

assert.equal(
    sorter.__test.formatUsageStats('world', {}),
    '世界书点击次数统计\n\n暂无统计。',
);

console.log('dropdown-frequency-sorter tests passed');
