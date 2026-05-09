# SillyTavern Dropdown Menu Optimization

用于 JS-Slash-Runner / 酒馆助手的 SillyTavern 全局脚本。

## 功能

- 优化预设下拉菜单：可选择默认顺序或按使用频率从高到低排序。
- 优化世界书下拉菜单：可选择默认顺序或按使用频率从高到低排序。
- 自动记录用户选择次数，并保存在浏览器 `localStorage` 中。
- 每类菜单旁边会出现一个小控件：
  - `默认`：保持 SillyTavern 原本顺序。
  - `常用`：按使用频率排序，同频时保持原本顺序。
  - `0`：清空该类菜单的使用频率统计。

## 导入方式

1. 打开 JS-Slash-Runner / 酒馆助手的脚本库。
2. 选择导入脚本。
3. 导入 [酒馆助手脚本-下拉菜单使用频率排序.json](./酒馆助手脚本-下拉菜单使用频率排序.json)。
4. 启用脚本并刷新 SillyTavern 页面。

如果导入 JSON 不可用，也可以新建一个全局脚本，然后将 [st-dropdown-frequency-sorter.user.js](./st-dropdown-frequency-sorter.user.js) 的内容复制进去。

## 控制台 API

脚本会暴露 `window.STDropdownFrequencySorter`：

```js
STDropdownFrequencySorter.setMode('preset', 'frequency');
STDropdownFrequencySorter.setMode('world', 'default');
STDropdownFrequencySorter.clearUsage('preset');
STDropdownFrequencySorter.clearUsage('world');
STDropdownFrequencySorter.refresh();
```

## 验证

```bash
node tests/dropdown-frequency-sorter.test.js
node tests/js-slash-runner-export.test.js
```
