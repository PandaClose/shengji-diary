# 升级日记

> 每日一页的任务与感悟日记。做完勾掉，写两句话，看着日历一点点变满。

升级日记是一个**本地优先**的 macOS 桌面应用（Electron），它不打算成为另一个功能全乎的任务管理器，而是专注一件事：**把「今天」记成一页**——任务打勾、随手感悟、翻日历回看，像打怪升级一样攒起自己的记录。

![version](https://img.shields.io/badge/version-0.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

## 界面一览

**深色 · 今天**

<p align="center"><img src="assets/screenshots/today-dark.png" width="760" alt="今天视图（深色主题）：任务列表、一键搬运与感悟区"></p>

**浅色 · 今天**

<p align="center"><img src="assets/screenshots/today-light.png" width="760" alt="今天视图（浅色主题）"></p>

**深色 · 统计与热力图**

<p align="center"><img src="assets/screenshots/stats-dark.png" width="760" alt="统计视图：18 周热力图与连续统计"></p>

> 以上截图使用[示例数据](scripts/seed-sample-data.js)生成，不含任何真实个人信息。

## 特性

- **每日一页**：任务（标题必填、描述选填）挂在具体日期下，完成后划线沉底，取消勾选回到原位
- **一键搬运**：前几天没做完的任务，一个按钮全部搬到今天，原日期干净封页；没有欠账时按钮自动隐藏
- **今日感悟**：每页一段纯文本，随写随存，历史日期也能补记
- **日历回看**：点任意一天回到那一页，支持自由补记和修改
- **连续记录**：当天有任务或有感悟即算记录一天，连续天数、最长纪录一目了然
- **统计**：GitHub 风格的 18 周热力图 ＋ 累计完成、记录天数、最长/当前连续
- **今日待办浮层**：全局快捷键唤起置顶小窗，直接勾掉当天剩下的任务；最后一个勾掉时有「今日已清 ✨」
- **快速记录**：全局快捷键随时记一条，不用切回主窗口
- **主题**：跟随系统（默认）/ 浅色 / 深色，手动可覆盖
- **数据是你自己的**：本地一个明文 `data.json`，无账号无云端；每次启动自动滚动备份（保留最近 7 份）；支持导出 Markdown（按日期分节）与 JSON 备份/恢复

## 不做什么

提醒推送、项目/标签/优先级、云同步、多设备、协作。它是一个安静的个人日记本，不是工作流平台。

## 开发

```bash
npm install
npm start        # 启动开发窗口
npm run icon     # 重新生成应用图标（build/icon.png）
npm run dist     # 打包 macOS dmg 到 dist/
npm run dist:win # 交叉打包 Windows 安装包到 dist/
```

要求 Node.js ≥ 18。首次启动会引导你选择数据文件夹（默认建议 `~/Documents/升级日记/`）。

## 系统要求

- macOS 12 及以上（Apple Silicon）
- Windows 10 / 11（64 位）

## 反馈

遇到问题或有功能建议，欢迎[提交 Issue](https://github.com/PandaClose/shengji-diary/issues)。项目为个人作品，按需维护，响应可能不快，但每条都会看。

## 数据与隐私

- 所有数据只存在你本机你选的文件夹里：`data.json` ＋ `backups/` ＋ 导出的文档
- 应用不联网，不收集任何数据
- 数据文件是明文 JSON，随时可以自己备份、进 git、或交给别的工具处理

## License

[MIT](./LICENSE)
