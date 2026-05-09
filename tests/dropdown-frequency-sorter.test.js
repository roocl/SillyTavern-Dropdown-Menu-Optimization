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

console.log('dropdown-frequency-sorter tests passed');
