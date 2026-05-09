# SillyTavern Dropdown Menu Optimization

用于 JS-Slash-Runner / 酒馆助手的 SillyTavern 全局脚本。

## 功能

- 优化预设下拉菜单：可选择默认顺序或按使用频率从高到低排序。
- 优化世界书下拉菜单：可选择默认顺序或按使用频率从高到低排序。
- 自动记录用户选择次数，并保存在浏览器 `localStorage` 中。
- 世界书菜单兼容 SillyTavern 的 jQuery/select2 事件，激活世界书和点击已激活世界书进入详细编辑都会计入常用统计。
- 设置入口挂在 SillyTavern 扩展设置容器 `#extensions_settings` 下，使用原生 `inline-drawer` 抽屉样式。

## 设置入口

导入并启用脚本后，在扩展设置栏中找到 **下拉菜单排序优化**：

- `预设下拉菜单`：可切换 `默认` / `常用`。
- `世界书下拉菜单`：可切换 `默认` / `常用`。
- `清预设`：清空预设下拉菜单的使用频率。
- `清世界`：清空世界书下拉菜单的使用频率。
- `看预设`：查看预设点击次数排行。
- `看世界`：查看世界书点击次数排行。

这四个按钮固定为一行四列，使用短文字而不是抽象符号。

脚本不会再把切换控件插到业务下拉框旁边，避免挤占原有菜单空间。

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
node --check st-dropdown-frequency-sorter.user.js
node tests/dropdown-frequency-sorter.test.js
node tests/js-slash-runner-export.test.js
```
