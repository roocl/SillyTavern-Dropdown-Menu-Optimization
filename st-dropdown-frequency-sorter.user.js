function resolveDropdownSorterHostGlobal(runtimeGlobal) {
    try {
        if (
            runtimeGlobal?.frameElement
            && runtimeGlobal.parent
            && runtimeGlobal.parent !== runtimeGlobal
            && runtimeGlobal.parent.document
        ) {
            return runtimeGlobal.parent;
        }
    } catch {
        // Cross-origin frames cannot be inspected. Fall back to the current frame.
    }

    return runtimeGlobal;
}

(function initDropdownFrequencySorter(global) {
    'use strict';

    const MODULE_NAME = 'STDropdownFrequencySorter';
    const STORAGE_KEY = 'st-dropdown-frequency-sorter:v1';
    const STYLE_ID = 'stdfs-style';
    const CONTROL_CLASS = 'stdfs-control';
    const MANAGED_ATTR = 'data-stdfs-managed';
    const MODES = new Set(['default', 'frequency']);

    const defaultState = Object.freeze({
        settings: {
            presetMode: 'default',
            worldMode: 'default',
        },
        usage: {
            preset: {},
            world: {},
        },
        originalOrders: {},
    });

    let observer = null;
    let refreshTimer = null;
    let isApplying = false;

    function cloneDefaultState() {
        return JSON.parse(JSON.stringify(defaultState));
    }

    function getStorage() {
        try {
            return global.localStorage || null;
        } catch {
            return null;
        }
    }

    function loadState() {
        const storage = getStorage();
        if (!storage) return cloneDefaultState();

        try {
            const loaded = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
            return {
                settings: { ...defaultState.settings, ...(loaded.settings || {}) },
                usage: {
                    preset: { ...(loaded.usage?.preset || {}) },
                    world: { ...(loaded.usage?.world || {}) },
                },
                originalOrders: { ...(loaded.originalOrders || {}) },
            };
        } catch {
            return cloneDefaultState();
        }
    }

    let state = loadState();

    function saveState() {
        const storage = getStorage();
        if (!storage) return;
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function getDocument() {
        return global.document || null;
    }

    function getScopeMode(scope) {
        return scope === 'preset' ? state.settings.presetMode : state.settings.worldMode;
    }

    function setScopeMode(scope, mode) {
        if (!['preset', 'world'].includes(scope) || !MODES.has(mode)) return false;
        if (scope === 'preset') state.settings.presetMode = mode;
        if (scope === 'world') state.settings.worldMode = mode;
        saveState();
        refresh();
        return true;
    }

    function getLabel(optionLike) {
        return String(optionLike.text || optionLike.textContent || optionLike.value || '').trim();
    }

    function getOptionKey(optionLike) {
        return `${String(optionLike.value || '')}\u0000${getLabel(optionLike)}`;
    }

    function getUsageKey(optionLike) {
        return getLabel(optionLike);
    }

    function createUsageStore(initialUsage = state.usage) {
        const usage = initialUsage;
        return {
            get(scope, key) {
                return Number(usage[scope]?.[key] || 0);
            },
            record(scope, key) {
                if (!usage[scope]) usage[scope] = {};
                usage[scope][key] = Number(usage[scope][key] || 0) + 1;
                return usage[scope][key];
            },
            clear(scope) {
                if (scope) usage[scope] = {};
                else {
                    usage.preset = {};
                    usage.world = {};
                }
            },
        };
    }

    const usageStore = createUsageStore();

    function sortOptions(options, usageCounts, mode) {
        const copy = Array.from(options);
        return copy.sort((a, b) => {
            if (mode === 'frequency') {
                const countDiff = Number(usageCounts[getUsageKey(b)] || 0) - Number(usageCounts[getUsageKey(a)] || 0);
                if (countDiff !== 0) return countDiff;
            }
            return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
        });
    }

    function getSelectScope(select) {
        if (!select || select.tagName !== 'SELECT') return null;
        if (select.matches('select[data-preset-manager-for]')) return 'preset';
        if (select.matches('#world_info, #world_editor_select')) return 'world';
        return null;
    }

    function getMenuKey(select, scope) {
        const id = select.id || select.getAttribute('name') || select.getAttribute('data-preset-manager-for') || 'anonymous';
        return `${scope}:${id}`;
    }

    function ensureOriginalOrders(select, scope) {
        const menuKey = getMenuKey(select, scope);
        if (!state.originalOrders[menuKey]) state.originalOrders[menuKey] = {};
        const orders = state.originalOrders[menuKey];
        Array.from(select.options).forEach((option, index) => {
            const key = getOptionKey(option);
            if (!Object.hasOwn(orders, key)) orders[key] = index;
        });
        return orders;
    }

    function getOptionRecords(select, scope) {
        const orders = ensureOriginalOrders(select, scope);
        return Array.from(select.options).map((option, index) => {
            const key = getOptionKey(option);
            return {
                option,
                value: option.value,
                text: getLabel(option),
                originalIndex: Number(orders[key] ?? index),
                selected: option.selected,
            };
        });
    }

    function applySortToSelect(select) {
        const scope = getSelectScope(select);
        if (!scope) return;

        const records = getOptionRecords(select, scope);
        const selectedKeys = new Set(records.filter(record => record.selected).map(record => getOptionKey(record.option)));
        const sorted = sortOptions(records, state.usage[scope] || {}, getScopeMode(scope));
        const alreadySorted = sorted.every((record, index) => select.options[index] === record.option);

        if (!alreadySorted) {
            for (const record of sorted) {
                select.appendChild(record.option);
            }
        }

        for (const record of records) {
            record.option.selected = selectedKeys.has(getOptionKey(record.option));
        }
    }

    function recordSelection(select) {
        const scope = getSelectScope(select);
        if (!scope) return;

        const selectedOptions = Array.from(select.selectedOptions || []).filter(option => getLabel(option));
        if (selectedOptions.length === 0) return;

        for (const option of selectedOptions) {
            usageStore.record(scope, getUsageKey(option));
        }

        saveState();
        refresh();
    }

    function injectStyle() {
        const document = getDocument();
        if (!document || document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${CONTROL_CLASS} {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-inline-start: 4px;
                vertical-align: middle;
                font-size: 0.85em;
            }
            .${CONTROL_CLASS} select {
                width: auto;
                min-width: 5.5em;
                max-width: 8em;
                padding-inline: 4px;
            }
            .${CONTROL_CLASS} button {
                min-width: 1.8em;
                padding-inline: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    function makeControl(select, scope) {
        const document = getDocument();
        if (!document || select.nextElementSibling?.classList?.contains(CONTROL_CLASS)) return;

        const wrapper = document.createElement('span');
        wrapper.className = CONTROL_CLASS;
        wrapper.dataset.stdfsScope = scope;

        const modeSelect = document.createElement('select');
        modeSelect.title = '下拉菜单排序方式';
        modeSelect.innerHTML = `
            <option value="default">默认</option>
            <option value="frequency">常用</option>
        `;
        modeSelect.value = getScopeMode(scope);
        modeSelect.addEventListener('change', () => {
            setScopeMode(scope, modeSelect.value);
            syncControls();
        });

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.textContent = '0';
        clearButton.title = '清空此类菜单的使用频率统计';
        clearButton.addEventListener('click', () => {
            usageStore.clear(scope);
            saveState();
            refresh();
        });

        wrapper.append(modeSelect, clearButton);
        select.insertAdjacentElement('afterend', wrapper);
    }

    function syncControls() {
        const document = getDocument();
        if (!document) return;

        document.querySelectorAll(`.${CONTROL_CLASS}`).forEach(control => {
            const scope = control.dataset.stdfsScope;
            const select = control.querySelector('select');
            if (select && scope) select.value = getScopeMode(scope);
        });
    }

    function findManagedSelects() {
        const document = getDocument();
        if (!document) return [];
        return Array.from(document.querySelectorAll('select[data-preset-manager-for], #world_info, #world_editor_select'));
    }

    function refresh() {
        if (refreshTimer) global.clearTimeout(refreshTimer);
        refreshTimer = global.setTimeout(() => {
            isApplying = true;
            try {
                injectStyle();
                for (const select of findManagedSelects()) {
                    const scope = getSelectScope(select);
                    if (!scope) continue;
                    select.setAttribute(MANAGED_ATTR, 'true');
                    makeControl(select, scope);
                    applySortToSelect(select);
                }
                syncControls();
            } finally {
                isApplying = false;
            }
        }, 50);
    }

    function bindEvents() {
        const document = getDocument();
        if (!document || document[`${MODULE_NAME}Bound`]) return;
        document[`${MODULE_NAME}Bound`] = true;

        document.addEventListener('change', event => {
            const target = event.target;
            if (target?.tagName === 'SELECT' && getSelectScope(target)) {
                recordSelection(target);
            }
        }, true);
    }

    function startObserver() {
        const document = getDocument();
        if (!document || observer || typeof global.MutationObserver !== 'function') return;

        observer = new global.MutationObserver(() => {
            if (!isApplying) refresh();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function start() {
        bindEvents();
        refresh();
        startObserver();
    }

    function stop() {
        if (observer) observer.disconnect();
        observer = null;
        const document = getDocument();
        if (!document) return;
        document.querySelectorAll(`.${CONTROL_CLASS}`).forEach(element => element.remove());
        document.querySelectorAll(`[${MANAGED_ATTR}]`).forEach(element => element.removeAttribute(MANAGED_ATTR));
    }

    function clearUsage(scope) {
        if (scope && !['preset', 'world'].includes(scope)) return false;
        usageStore.clear(scope);
        saveState();
        refresh();
        return true;
    }

    const api = {
        start,
        stop,
        refresh,
        setMode: setScopeMode,
        clearUsage,
        getState: () => JSON.parse(JSON.stringify(state)),
        __test: {
            sortOptions,
            createUsageStore: () => createUsageStore({ preset: {}, world: {} }),
            resolveHostGlobal: resolveDropdownSorterHostGlobal,
        },
    };

    global[MODULE_NAME] = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (getDocument()) {
        if (getDocument().readyState === 'loading') {
            getDocument().addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})(resolveDropdownSorterHostGlobal(typeof window !== 'undefined' ? window : globalThis));
