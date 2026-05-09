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
    const SETTINGS_PANEL_ID = 'stdfs-settings';
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
    let jqueryEventsBound = false;
    let lastRecordSignature = '';
    let lastRecordTime = 0;

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

    function getSelectionLabels(select, event) {
        const select2Data = event?.params?.data;
        const select2Text = getLabel(select2Data || {});
        if (select2Text) return [select2Text];

        return Array.from(select?.selectedOptions || [])
            .map(option => getLabel(option))
            .filter(Boolean);
    }

    function createSelect2ChangeGate() {
        const select2Times = new WeakMap();
        return {
            shouldSkip(select, eventType, now = Date.now()) {
                if (!select || !eventType) return false;
                if (String(eventType).startsWith('select2:')) {
                    select2Times.set(select, now);
                    return false;
                }
                if (eventType === 'change') {
                    const lastSelect2Time = select2Times.get(select) || 0;
                    return now - lastSelect2Time < 250;
                }
                return false;
            },
        };
    }

    const select2ChangeGate = createSelect2ChangeGate();

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

    function recordSelection(select, event) {
        const scope = getSelectScope(select);
        if (!scope) return;

        const selectedLabels = getSelectionLabels(select, event);
        if (selectedLabels.length === 0) return;

        const signature = `${scope}:${selectedLabels.join('\u0001')}`;
        const now = Date.now();
        if (signature === lastRecordSignature && now - lastRecordTime < 250) return;
        lastRecordSignature = signature;
        lastRecordTime = now;

        for (const label of selectedLabels) {
            usageStore.record(scope, label);
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
            #${SETTINGS_PANEL_ID} .stdfs-settings__row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 8px 0;
            }
            #${SETTINGS_PANEL_ID} .stdfs-settings__row label {
                flex: 1 1 auto;
            }
            #${SETTINGS_PANEL_ID} .stdfs-settings__row select {
                flex: 0 0 8em;
                max-width: 8em;
            }
            #${SETTINGS_PANEL_ID} .stdfs-settings__actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    function createSettingsPanelHtml(presetMode, worldMode) {
        const presetDefaultSelected = presetMode === 'default' ? ' selected' : '';
        const presetFrequencySelected = presetMode === 'frequency' ? ' selected' : '';
        const worldDefaultSelected = worldMode === 'default' ? ' selected' : '';
        const worldFrequencySelected = worldMode === 'frequency' ? ' selected' : '';

        return `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>下拉菜单排序优化</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="stdfs-settings__row">
                        <label for="stdfs-preset-mode">预设下拉菜单</label>
                        <select id="stdfs-preset-mode">
                            <option value="default"${presetDefaultSelected}>默认</option>
                            <option value="frequency"${presetFrequencySelected}>常用</option>
                        </select>
                    </div>
                    <div class="stdfs-settings__row">
                        <label for="stdfs-world-mode">世界书下拉菜单</label>
                        <select id="stdfs-world-mode">
                            <option value="default"${worldDefaultSelected}>默认</option>
                            <option value="frequency"${worldFrequencySelected}>常用</option>
                        </select>
                    </div>
                    <div class="stdfs-settings__actions">
                        <button id="stdfs-clear-preset" type="button" class="menu_button">清空预设统计</button>
                        <button id="stdfs-clear-world" type="button" class="menu_button">清空世界书统计</button>
                    </div>
                    <small>常用排序会按选择次数从高到低排列；同频时保持默认顺序。</small>
                </div>
            </div>
        `;
    }

    function syncSettingsPanel() {
        const document = getDocument();
        if (!document) return;

        const presetMode = document.getElementById('stdfs-preset-mode');
        const worldMode = document.getElementById('stdfs-world-mode');
        if (presetMode) presetMode.value = state.settings.presetMode;
        if (worldMode) worldMode.value = state.settings.worldMode;
    }

    function clearUsage(scope) {
        if (scope && !['preset', 'world'].includes(scope)) return false;
        usageStore.clear(scope);
        saveState();
        refresh();
        return true;
    }

    function registerSettingsPanel() {
        const document = getDocument();
        if (!document || document.getElementById(SETTINGS_PANEL_ID)) return;

        const host = document.querySelector('#extensions_settings');
        if (!host) return;

        const panel = document.createElement('div');
        panel.id = SETTINGS_PANEL_ID;
        panel.innerHTML = createSettingsPanelHtml(state.settings.presetMode, state.settings.worldMode);

        const presetMode = panel.querySelector('#stdfs-preset-mode');
        const worldMode = panel.querySelector('#stdfs-world-mode');
        const clearPreset = panel.querySelector('#stdfs-clear-preset');
        const clearWorld = panel.querySelector('#stdfs-clear-world');

        presetMode?.addEventListener('change', () => {
            setScopeMode('preset', presetMode.value);
            syncSettingsPanel();
        });
        worldMode?.addEventListener('change', () => {
            setScopeMode('world', worldMode.value);
            syncSettingsPanel();
        });
        clearPreset?.addEventListener('click', () => clearUsage('preset'));
        clearWorld?.addEventListener('click', () => clearUsage('world'));

        host.append(panel);
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
                bindJQueryEvents();
                injectStyle();
                registerSettingsPanel();
                for (const select of findManagedSelects()) {
                    const scope = getSelectScope(select);
                    if (!scope) continue;
                    select.setAttribute(MANAGED_ATTR, 'true');
                    applySortToSelect(select);
                }
                syncSettingsPanel();
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
            if (jqueryEventsBound) return;
            const target = event.target;
            if (target?.tagName === 'SELECT' && getSelectScope(target)) {
                recordSelection(target, event);
            }
        }, true);
    }

    function bindJQueryEvents() {
        const $ = global.jQuery || global.$;
        if (jqueryEventsBound || typeof $ !== 'function') return;

        jqueryEventsBound = true;
        $(getDocument()).on(
            'change.stdfs select2:select.stdfs',
            'select[data-preset-manager-for], #world_info, #world_editor_select',
            function onDropdownChanged(event) {
                if (select2ChangeGate.shouldSkip(this, event.type)) return;
                recordSelection(this, event);
            },
        );
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
        bindJQueryEvents();
        bindEvents();
        refresh();
        startObserver();
    }

    function stop() {
        if (observer) observer.disconnect();
        observer = null;
        const document = getDocument();
        if (!document) return;
        document.getElementById(SETTINGS_PANEL_ID)?.remove();
        document.querySelectorAll(`[${MANAGED_ATTR}]`).forEach(element => element.removeAttribute(MANAGED_ATTR));
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
            createSettingsPanelHtml,
            getSelectionLabels,
            createSelect2ChangeGate,
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
