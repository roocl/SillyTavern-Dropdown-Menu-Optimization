# 项目理解与协作约定

## 项目目标

本项目用于优化 SillyTavern 中两个常用下拉菜单：

- 对话补全预设下拉菜单。
- 世界书下拉菜单。

核心目标是让用户可以在两种排序方式之间切换：

- 默认排序：保持 SillyTavern 原本提供的菜单顺序。
- 常用排序：按照用户选择次数从高到低排序，同频时保持原本顺序。

## 当前产物

- `st-dropdown-frequency-sorter.user.js`
  - 可直接作为 JS-Slash-Runner / 酒馆助手全局脚本使用。
  - 会在 SillyTavern 扩展设置容器 `#extensions_settings` 中注册 `inline-drawer` 抽屉面板。
  - 面板中可分别切换预设下拉菜单和世界书下拉菜单的 `默认/常用` 排序，并可清空统计。
  - 使用浏览器 `localStorage` 保存排序设置、使用频率统计和原始顺序记录。

- `酒馆助手脚本-下拉菜单使用频率排序.json`
  - JS-Slash-Runner 可导入脚本格式。
  - `content` 字段与 `st-dropdown-frequency-sorter.user.js` 保持同步。

- `tests/dropdown-frequency-sorter.test.js`
  - 验证排序、统计清空、iframe 父页面解析等核心逻辑。

- `tests/js-slash-runner-export.test.js`
  - 验证可导入 JSON 的结构和脚本内容同步。

## 重要实现细节

JS-Slash-Runner 脚本可能运行在 iframe 上下文中。为了让控件出现在 SillyTavern 主页面，而不是不可见的脚本 iframe 中，脚本会检测 `window.frameElement`，并在可访问时切换到 `window.parent` 操作主页面 DOM。

当前识别的目标选择器：

- 预设菜单：`select[data-preset-manager-for]`
- 世界书菜单：`#world_info`、`#world_editor_select`

设置面板挂载点：

- `#extensions_settings`

设置面板结构应使用 SillyTavern 原生抽屉样式：

```html
<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>下拉菜单排序优化</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    设置内容
  </div>
</div>
```

不要再把切换控件插入业务下拉框旁边，避免挤占 SillyTavern 原有菜单空间。

脚本会暴露全局对象：

```js
window.STDropdownFrequencySorter
```

常用 API：

```js
STDropdownFrequencySorter.setMode('preset', 'frequency');
STDropdownFrequencySorter.setMode('world', 'default');
STDropdownFrequencySorter.clearUsage('preset');
STDropdownFrequencySorter.clearUsage('world');
STDropdownFrequencySorter.refresh();
```

## 验证命令

每次修改后至少运行：

```bash
node --check st-dropdown-frequency-sorter.user.js
node tests/dropdown-frequency-sorter.test.js
node tests/js-slash-runner-export.test.js
```

如果修改了 JSON 导入文件，必须确认 `tests/js-slash-runner-export.test.js` 通过，确保 JSON 中的 `content` 与脚本源文件一致。

## GitHub 推送约定

用户要求：后续每次修改后自动推送到 GitHub。

因此每次完成代码或文档修改后，应执行以下流程：

1. 查看 `git status --short`，确认本次修改范围。
2. 运行相关验证命令。
3. `git add` 本次相关文件。
4. `git commit -m "<简短说明>"`。
5. `git push` 到当前分支对应的 GitHub 远端。

当前远端：

```bash
origin https://github.com/roocl/SillyTavern-Dropdown-Menu-Optimization.git
```

当前工作分支：

```bash
main
```
