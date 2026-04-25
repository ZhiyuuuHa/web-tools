# 接手说明

## 项目定位

这是一个用于模拟 NIKKE 芯尘成长与开箱策略的静态网页工具。

- 部署方式：GitHub Pages
- 在线地址：`https://tianqing02.github.io/NikkeCoreDustCalculator/`
- 技术栈：`index.html`、`styles.css`、`app.js`、CDN 版 `echarts`

除非用户明确要求，否则不要重新引入 Python、后端服务、构建工具或前端框架。

## 关键规则

以下内容不应重新暴露为可编辑输入项：

- 基础日常小时固定为 `24`
- 免费扫荡次数固定为 `1`
- 每次扫荡固定为 `2` 小时

当前主线进度、基地等级与小时芯尘优先来自 `nikke-data.js` 本地快照，并可在运行时尝试同步 `NIKKE Outpost` 远程数据。

每日总小时公式：

`24 + (1 + 购买扫荡次数) * 2`

“每月”类型额外来源必须按真实日历计算，不能使用固定 30 天周期。

芯尘规则：
- `1-200`：使用 `CORE_DUST_BREAKPOINTS`
- `200+`：使用 `CORE_DUST_RANGES`
- 页面参考表只展示 `200+` 区间每级消耗
- 模拟内部仍按完整规则计算

## 页面结构

当前页面为单页纵向布局，区块顺序为：

- 基础参数
- 主线更新
- 活动
- 额外来源 / 日常获取
- 策略图表
- 每日明细
- 策略
- 芯尘消耗参考

当前交互要求：
- 顶部工具栏吸顶
- 右侧页面导航独立浮动，不能遮挡正文
- 图表默认显示所有启用策略
- 每日明细使用独立策略选择
- 策略与策略汇总合并在同一区块
- 策略区块默认收起

## 表格要求

- 每日明细：在自身滚动容器内固定表头
- 策略汇总：固定表头
- 芯尘消耗参考：默认不使用固定表头，避免短表异常

相关样式位置：
- [styles.css](/d:/N/styles.css) 中的 `.detail-wrap`
- [styles.css](/d:/N/styles.css) 中的 `.sticky-head-wrap`
- [styles.css](/d:/N/styles.css) 中的 `--table-sticky-top`

## 关键数据

当前 `state.params` 的主要可编辑项：

- `startLevel`
- `startProgress`
- `startHourlyRate`
- `startBoxes`
- `simulateDays`
- `paidSweeps`
- `bigRateBonus`
- `startDate`

补充：
- `startHourlyRate` 支持小数
- `startBoxes` 表示“拥有芯尘箱（小时）”，支持小数
- `startDate` 用于支持真实日历下的每月来源

## 最低验证

修改逻辑或 UI 后，至少执行：

```powershell
node --check app.js
```

如果涉及布局，还应人工确认：
- 顶部工具栏吸顶正常
- 右侧导航不遮挡正文
- 每日明细滚动正常
- 表头固定逻辑正常

## 文件职责

- [index.html](/d:/N/index.html)：页面结构与区块顺序
- [styles.css](/d:/N/styles.css)：视觉、吸顶、导航、表格样式
- [app.js](/d:/N/app.js)：模拟逻辑、渲染逻辑、导出逻辑、日历规则
