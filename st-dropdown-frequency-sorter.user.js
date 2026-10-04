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
    });

    let observer = null;
    let refreshTimer = null;
    let active = false;
    let jqueryEventsBound = false;
    let boundJQuery = null;
    const selections = new WeakMap();
    const originalOrders = new Map();
    const runtime = typeof window !== 'undefined' ? window : global;

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
            const result = cloneDefaultState();
            for (const scope of ['preset', 'world']) {
                const key = `${scope}Mode`;
                if (MODES.has(loaded?.settings?.[key])) result.settings[key] = loaded.settings[key];
                result.usage[scope] = Object.fromEntries(Object.entries(loaded?.usage?.[scope] || {})
                    .filter(([, count]) => Number.isSafeInteger(count) && count >= 0));
            }
            return result;
        } catch {
            return cloneDefaultState();
        }
    }

    let state = loadState();

    function saveState() {
        const storage = getStorage();
        if (!storage) return;
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            global.console.warn('Dropdown sorter: statistics could not be saved.', error);
        }
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

    function getUsageKey(optionLike) {
        return getLabel(optionLike);
    }

    function createUsageStore(initialUsage = state.usage) {
        const usage = initialUsage;
        return {
            get(scope, key) {
                return Object.hasOwn(usage[scope] || {}, key) ? usage[scope][key] : 0;
            },
            record(scope, key) {
                if (!usage[scope]) usage[scope] = {};
                Object.defineProperty(usage[scope], key, {
                    value: Math.min(this.get(scope, key) + 1, Number.MAX_SAFE_INTEGER),
                    writable: true, enumerable: true, configurable: true,
                });
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
                const countDiff = (Object.hasOwn(usageCounts, getUsageKey(b)) ? usageCounts[getUsageKey(b)] : 0)
                    - (Object.hasOwn(usageCounts, getUsageKey(a)) ? usageCounts[getUsageKey(a)] : 0);
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

    function applySortToSelect(select, mode = getScopeMode(getSelectScope(select))) {
        const scope = getSelectScope(select);
        if (!scope) return;
        const selected = new Set(select.selectedOptions);
        const parents = [select, ...select.querySelectorAll('optgroup')];
        for (const parent of parents) {
            const children = Array.from(parent.children);
            let entry = originalOrders.get(parent);
            if (!entry) entry = { baseline: children, rendered: children };
            const retained = children.filter(node => entry.rendered.includes(node));
            const previous = entry.rendered.filter(node => children.includes(node));
            if (retained.some((node, i) => node !== previous[i])) {
                entry.baseline = children;
            } else {
                entry.baseline = entry.baseline.filter(node => children.includes(node));
                children.forEach((node, i) => {
                    if (entry.baseline.includes(node)) return;
                    const next = children.slice(i + 1).find(item => entry.baseline.includes(item));
                    entry.baseline.splice(next ? entry.baseline.indexOf(next) : entry.baseline.length, 0, node);
                });
            }
            const movable = node => node.tagName === 'OPTION' && node.value !== '' && !node.disabled;
            const records = entry.baseline.filter(movable).map((option, originalIndex) => ({
                option, text: getLabel(option), originalIndex,
            }));
            const sorted = sortOptions(records, state.usage[scope], mode);
            let index = 0;
            const ordered = entry.baseline.map(node => movable(node) ? sorted[index++].option : node);
            if (ordered.some((node, i) => children[i] !== node)) parent.append(...ordered);
            entry.rendered = ordered;
            originalOrders.set(parent, entry);
        }
        for (const option of select.options) option.selected = selected.has(option);
        if (!selected.size) select.selectedIndex = -1;
    }

    function recordSelection(select) {
        const scope = getSelectScope(select);
        if (!active || !scope) return;
        const current = new Set(Array.from(select.selectedOptions).filter(o => o.value !== '' && !o.disabled).map(o => o.value));
        const previous = selections.get(select) || new Set();
        selections.set(select, current);
        const added = Array.from(select.selectedOptions).filter(o => current.has(o.value) && !previous.has(o.value));
        if (!added.length) return;
        for (const option of added) usageStore.record(scope, getLabel(option));
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
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 8px;
                margin-top: 10px;
            }
            #${SETTINGS_PANEL_ID} .stdfs-settings__action-button {
                width: 100%;
                min-width: 0;
                height: 32px;
                padding: 0 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
                white-space: nowrap;
                font-size: 0.9em;
            }
        `;
        document.head.appendChild(style);
    }

    const uiText = {
        title: '\u4e0b\u62c9\u83dc\u5355\u6392\u5e8f\u4f18\u5316',
        presetLabel: '\u9884\u8bbe\u4e0b\u62c9\u83dc\u5355',
        worldLabel: '\u4e16\u754c\u4e66\u4e0b\u62c9\u83dc\u5355',
        defaultMode: '\u9ed8\u8ba4',
        frequencyMode: '\u5e38\u7528',
        clearPreset: '\u6e05\u7a7a\u9884\u8bbe\u7edf\u8ba1',
        clearWorld: '\u6e05\u7a7a\u4e16\u754c\u4e66\u7edf\u8ba1',
        showPresetStats: '\u67e5\u770b\u9884\u8bbe\u7edf\u8ba1',
        showWorldStats: '\u67e5\u770b\u4e16\u754c\u4e66\u7edf\u8ba1',
        clearPresetShort: '\u6e05\u9884\u8bbe',
        clearWorldShort: '\u6e05\u4e16\u754c',
        showPresetStatsShort: '\u770b\u9884\u8bbe',
        showWorldStatsShort: '\u770b\u4e16\u754c',
        hint: '\u5e38\u7528\u6392\u5e8f\u4f1a\u6309\u9009\u62e9\u6b21\u6570\u4ece\u9ad8\u5230\u4f4e\u6392\u5217\uff1b\u540c\u9891\u65f6\u4fdd\u6301\u9ed8\u8ba4\u987a\u5e8f\u3002',
        presetStatsTitle: '\u9884\u8bbe\u70b9\u51fb\u6b21\u6570\u7edf\u8ba1',
        worldStatsTitle: '\u4e16\u754c\u4e66\u70b9\u51fb\u6b21\u6570\u7edf\u8ba1',
        emptyStats: '\u6682\u65e0\u7edf\u8ba1\u3002',
    };

    function createSettingsPanelHtml(presetMode, worldMode) {
        const presetDefaultSelected = presetMode === 'default' ? ' selected' : '';
        const presetFrequencySelected = presetMode === 'frequency' ? ' selected' : '';
        const worldDefaultSelected = worldMode === 'default' ? ' selected' : '';
        const worldFrequencySelected = worldMode === 'frequency' ? ' selected' : '';

        return `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>${uiText.title}</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="stdfs-settings__row">
                        <label for="stdfs-preset-mode">${uiText.presetLabel}</label>
                        <select id="stdfs-preset-mode">
                            <option value="default"${presetDefaultSelected}>${uiText.defaultMode}</option>
                            <option value="frequency"${presetFrequencySelected}>${uiText.frequencyMode}</option>
                        </select>
                    </div>
                    <div class="stdfs-settings__row">
                        <label for="stdfs-world-mode">${uiText.worldLabel}</label>
                        <select id="stdfs-world-mode">
                            <option value="default"${worldDefaultSelected}>${uiText.defaultMode}</option>
                            <option value="frequency"${worldFrequencySelected}>${uiText.frequencyMode}</option>
                        </select>
                    </div>
                    <div class="stdfs-settings__actions">
                        <button id="stdfs-clear-preset" type="button" class="menu_button stdfs-settings__action-button" title="${uiText.clearPreset}">${uiText.clearPresetShort}</button>
                        <button id="stdfs-clear-world" type="button" class="menu_button stdfs-settings__action-button" title="${uiText.clearWorld}">${uiText.clearWorldShort}</button>
                        <button id="stdfs-show-preset-stats" type="button" class="menu_button stdfs-settings__action-button" title="${uiText.showPresetStats}">${uiText.showPresetStatsShort}</button>
                        <button id="stdfs-show-world-stats" type="button" class="menu_button stdfs-settings__action-button" title="${uiText.showWorldStats}">${uiText.showWorldStatsShort}</button>
                    </div>
                    <small>${uiText.hint}</small>
                </div>
            </div>
        `;
    }

    function formatUsageStats(scope, usageCounts = state.usage[scope] || {}) {
        const title = scope === 'preset' ? uiText.presetStatsTitle : uiText.worldStatsTitle;
        const rows = Object.entries(usageCounts)
            .filter(([, count]) => Number(count) > 0)
            .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));

        if (rows.length === 0) return `${title}\n\n${uiText.emptyStats}`;

        const body = rows.map(([label, count], index) => `${index + 1}. ${label}: ${Number(count)}`).join('\n');
        return `${title}\n\n${body}`;
    }

    function showUsageStats(scope) {
        const message = formatUsageStats(scope);
        if (typeof global.callPopup === 'function') {
            const content = getDocument().createElement('pre');
            content.textContent = message;
            content.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;text-align:left';
            global.callPopup(content.outerHTML, 'text');
            return;
        }
        if (typeof global.alert === 'function') {
            global.alert(message);
        }
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
        const showPresetStats = panel.querySelector('#stdfs-show-preset-stats');
        const showWorldStats = panel.querySelector('#stdfs-show-world-stats');

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
        showPresetStats?.addEventListener('click', () => showUsageStats('preset'));
        showWorldStats?.addEventListener('click', () => showUsageStats('world'));

        host.append(panel);
    }

    function findManagedSelects() {
        const document = getDocument();
        if (!document) return [];
        return Array.from(document.querySelectorAll('select[data-preset-manager-for], #world_info, #world_editor_select'));
    }

    function refresh() {
        if (!active || refreshTimer !== null) return;
        refreshTimer = global.setTimeout(() => {
            refreshTimer = null;
            if (!active) return;
            try {
                bindJQueryEvents();
                injectStyle();
                registerSettingsPanel();
                for (const select of findManagedSelects()) {
                    const scope = getSelectScope(select);
                    if (!scope) continue;
                    if (!selections.has(select)) {
                        selections.set(select, new Set(Array.from(select.selectedOptions).map(o => o.value)));
                    }
                    select.setAttribute(MANAGED_ATTR, 'true');
                    applySortToSelect(select);
                }
                syncSettingsPanel();
                for (const parent of originalOrders.keys()) {
                    if (!parent.isConnected) originalOrders.delete(parent);
                }
            } finally {
                observer?.takeRecords();
            }
        }, 50);
    }

    function onNativeChange(event) {
        if (!jqueryEventsBound) recordSelection(event.target);
    }

    function onJQueryChange(event) {
        if (!event.namespace) recordSelection(this);
    }

    function bindJQueryEvents() {
        const $ = global.jQuery || global.$;
        if (jqueryEventsBound || typeof $ !== 'function') return;

        jqueryEventsBound = true;
        boundJQuery = $;
        $(getDocument()).on(
            'change.stdfs',
            'select[data-preset-manager-for], #world_info, #world_editor_select',
            onJQueryChange,
        );
    }

    function startObserver() {
        const document = getDocument();
        if (!document || observer || typeof global.MutationObserver !== 'function') return;

        observer = new global.MutationObserver(records => {
            const selector = 'select[data-preset-manager-for], #world_info, #world_editor_select, #extensions_settings';
            if (records.some(record => record.target.closest?.('select') && getSelectScope(record.target.closest('select'))
                || [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.(selector) || node.querySelector?.(selector)))) refresh();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function start() {
        if (active || !getDocument()) return;
        active = true;
        for (const select of findManagedSelects()) {
            selections.set(select, new Set(Array.from(select.selectedOptions).map(o => o.value)));
        }
        bindJQueryEvents();
        getDocument().addEventListener('change', onNativeChange, true);
        runtime.addEventListener?.('pagehide', stop);
        refresh();
        startObserver();
    }

    function stop() {
        active = false;
        global.clearTimeout(refreshTimer);
        refreshTimer = null;
        if (observer) observer.disconnect();
        observer = null;
        const document = getDocument();
        if (!document) return;
        document.removeEventListener('DOMContentLoaded', start);
        document.removeEventListener('change', onNativeChange, true);
        boundJQuery?.(document).off('change.stdfs', onJQueryChange);
        boundJQuery = null;
        jqueryEventsBound = false;
        runtime.removeEventListener?.('pagehide', stop);
        for (const select of findManagedSelects()) applySortToSelect(select, 'default');
        originalOrders.clear();
        document.getElementById(SETTINGS_PANEL_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
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
            formatUsageStats,
        },
    };

    global[MODULE_NAME]?.stop();
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
