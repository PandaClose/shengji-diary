'use strict';
// 主进程：窗口管理、数据 IPC、全局快捷键、主题联动。

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, nativeTheme, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore, buildMarkdown, computeStats, normalize, todayKey, fmtKey } = require('./store');

// 开发/测试/截图实例使用独立 userData，避免与正式安装版触发单实例锁
if (process.env.SJ_DEV || process.env.SJ_AUTO_DIALOG || process.env.SJ_SHOT) {
  app.setPath('userData', process.env.SJ_SHOT ? '/tmp/sjd-shot-userdata' : '/tmp/sjd-dev-userdata');
}

const isDev = !!process.env.SJ_DEV;
const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');

// ---------- 配置（窗口状态与数据目录存 userData，与用户数据分离） ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const winStateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

let cfg = readJSON(cfgFile(), {});
let store = null;
let mainWin = null;
let overlayWin = null;
let quickWin = null;
let appMenu = null;

function ensureStore() {
  if (!cfg.dataDir) { store = null; return; }
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  store = createStore({
    dataFile: path.join(cfg.dataDir, 'data.json'),
    backupDir: path.join(cfg.dataDir, 'backups')
  });
  store.load();
  store.backupOnce();
  applyTheme();
}

function settings() { return store ? store.get().settings : { theme: 'system', hotkeys: {} }; }

function statePayload() {
  return {
    config: { dataDir: cfg.dataDir || '' },
    data: store ? store.get() : null,
    today: todayKey()
  };
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function broadcast() {
  const payload = statePayload();
  [mainWin, overlayWin, quickWin].forEach(w => send(w, 'data:changed', payload));
}

// ---------- 主题 ----------
function applyTheme() {
  nativeTheme.themeSource = (settings().theme === 'light' || settings().theme === 'dark')
    ? settings().theme : 'system';
}

// ---------- 主窗口 ----------
function createMainWindow() {
  const saved = readJSON(winStateFile(), {});
  const { width, height, x, y } = saved.bounds || {};
  mainWin = new BrowserWindow({
    width: width || 1080,
    height: height || 700,
    x: typeof x === 'number' ? x : undefined,
    y: typeof y === 'number' ? y : undefined,
    minWidth: 860,
    minHeight: 560,
    title: '升级日记',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171b' : '#f5f5f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => mainWin.show());
  // 最小化直接收进 Dock 应用图标，不显示窗口缩略图；点图标/⌘Tab 恢复
  mainWin.on('minimize', () => mainWin.hide());
  mainWin.on('close', () => {
    writeJSON(winStateFile(), { bounds: mainWin.getBounds() });
    // 单窗口工具：点 X 即退出整个应用。否则隐藏的浮层/速记窗口会一直活着，
    // 「全部窗口关闭」永不触发，应用残留 Dock 与菜单栏
    app.quit();
  });
  // 外链一律交给系统浏览器，窗口内不导航去网页
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- 浮层 / 快速记录窗口 ----------
function floatingBase() {
  return {
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
}

// 浮层架构：外部快捷键唤起用 showInactive —— 浮层可见可点但不激活应用，
// 用户焦点与窗口布局完全不动，从根上避免 app.hide()/焦点归还这一整类状态问题。
// fromMain=true（主窗口按钮唤起）时正常 show+focus，Esc 可用。
function showOverlay(fromMain) {
  if (!store) return;
  if (!overlayWin || overlayWin.isDestroyed()) {
    overlayWin = new BrowserWindow(Object.assign(floatingBase(), {
      width: 380, height: 420,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f2127' : '#ffffff'
    }));
    overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
    // 注意：不要给浮层设 setVisibleOnAllWorkspaces —— 该 API 在 macOS Sonoma 上有已知 bug，
    // 隐藏注册于所有空间的窗口会导致应用菜单栏/窗口点击失去响应。普通窗口形态即可。
  }
  const { workArea } = screen.getPrimaryDisplay();
  overlayWin.setPosition(Math.round(workArea.x + (workArea.width - 380) / 2), workArea.y + 80);
  if (fromMain) {
    overlayWin.show();
    overlayWin.focus();
  } else {
    overlayWin.showInactive();
  }
}

function hideOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

function showQuickAdd() {
  if (!store) return;
  if (!quickWin || quickWin.isDestroyed()) {
    quickWin = new BrowserWindow(Object.assign(floatingBase(), {
      width: 480, height: 150,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f2127' : '#ffffff'
    }));
    quickWin.loadFile(path.join(__dirname, '..', 'renderer', 'quickadd.html'));
  }
  const { workArea } = screen.getPrimaryDisplay();
  quickWin.setPosition(Math.round(workArea.x + (workArea.width - 480) / 2), workArea.y + 120);
  quickWin.show();
  quickWin.focus();
}

function hideQuickAdd() { if (quickWin && !quickWin.isDestroyed()) quickWin.hide(); }

// ---------- 全局快捷键 ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hk = settings().hotkeys || {};
  if (hk.quickAdd) {
    try { globalShortcut.register(hk.quickAdd, showQuickAdd); } catch (e) { /* 无效组合键忽略 */ }
  }
  if (hk.overlay) {
    try {
      globalShortcut.register(hk.overlay, () => {
        // 真开关：显示中则关闭，否则唤起（不激活应用）
        if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) hideOverlay();
        else showOverlay(false);
      });
    } catch (e) { /* 忽略 */ }
  }
}

// ---------- 数据目录 ----------
// 文件对话框：异步 + 独立弹出 + 不做任何焦点操作。
// 注意：同步版对话框在 macOS 遇「新建文件夹」会嵌套模态堵死主进程；
// 弹出前调用 app.focus({ steal: true }) 抢焦点，会与系统面板激活竞争导致选择框不显示。
async function chooseDataDir() {
  console.log('[dir:choose] 打开文件夹选择框…');
  const t0 = Date.now();
  const result = await dialog.showOpenDialog({
    title: '选择升级日记的数据文件夹',
    defaultPath: path.join(app.getPath('home'), 'Documents', '升级日记'),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '使用这个文件夹'
  });
  const elapsed = Date.now() - t0;
  console.log('[dir:choose] 返回（' + elapsed + 'ms）：', JSON.stringify(result));
  if (result && result.canceled && elapsed < 300) {
    dialog.showErrorBox(
      '选择框未能打开',
      '系统选择框被立即关闭了（焦点或系统面板异常）。\n可直接在输入框里填写路径继续（支持 ~ 开头）。'
    );
  }
  if (!result || result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

// 手动输入的路径：展开 ~，去引号，转绝对路径
function expandPath(input) {
  let p = String(input).trim().replace(/^["']|["']$/g, '');
  if (!p) return '';
  if (p === '~' || p.startsWith('~/')) p = path.join(app.getPath('home'), p.slice(1));
  return path.resolve(p);
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('state:get', () => {
    if (!store) return { needsSetup: true };
    return Object.assign({ needsSetup: false }, statePayload());
  });

  ipcMain.handle('dir:choose', async (e, opts) => {
    try {
      let dir;
      if (opts && typeof opts.path === 'string' && opts.path.trim()) {
        dir = expandPath(opts.path);
        if (!dir) return { canceled: true };
        // 已存在但不是文件夹：明确报错
        if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
          dialog.showErrorBox('路径无效', '这个路径是一个文件，请填一个文件夹路径。');
          return { canceled: true };
        }
      } else {
        dir = await chooseDataDir();
      }
      if (!dir) return { canceled: true };
      const oldData = store ? store.get() : null;
      cfg.dataDir = dir;
      writeJSON(cfgFile(), cfg);
      ensureStore();
      if (oldData && store) store.replaceData(JSON.parse(JSON.stringify(oldData)));
      broadcast();
      return Object.assign({ canceled: false }, statePayload());
    } catch (err) {
      dialog.showErrorBox('选择数据文件夹失败', String(err.message || err));
      return { canceled: true };
    }
  });

  ipcMain.handle('settings:set', (e, patch) => {
    const s = store.updateSettings(patch || {});
    applyTheme();
    registerHotkeys();
    broadcast();
    return s;
  });

  ipcMain.handle('task:add', (e, p) => { const id = store.addTask(p); broadcast(); return id; });
  ipcMain.handle('task:toggle', (e, p) => { store.toggleTask(p); broadcast(); });
  ipcMain.handle('task:update', (e, p) => { store.updateTask(p); broadcast(); });
  ipcMain.handle('task:delete', (e, p) => { const out = store.deleteTask(p); broadcast(); return out; });
  ipcMain.handle('task:restore', (e, p) => { store.restoreTask(p); broadcast(); });
  ipcMain.handle('task:reorder', (e, p) => { store.reorderTasks(p); broadcast(); });
  ipcMain.handle('day:reflection', (e, p) => { store.setReflection(p); broadcast(); });
  ipcMain.handle('day:carry', () => { const count = store.carryTo(todayKey()); broadcast(); return count; });

  ipcMain.handle('stats:get', () => computeStats(store.get(), todayKey()));

  ipcMain.handle('export:markdown', async () => {
    const choice = dialog.showMessageBoxSync(mainWin, {
      type: 'question',
      message: '导出范围',
      detail: 'Markdown 会按日期一节一节排好，包含任务勾选状态与感悟原文。',
      buttons: ['全部', '今年', '本月', '取消'],
      defaultId: 0,
      cancelId: 3
    });
    if (choice === 3) return { canceled: true };
    const today = todayKey();
    const range = choice === 0 ? {}
      : choice === 1 ? { from: today.slice(0, 4) + '-01-01' }
      : { from: today.slice(0, 8) + '01' };
    const save = await dialog.showSaveDialog({
      title: '导出 Markdown',
      defaultPath: path.join(app.getPath('documents'), `升级日记-导出-${today}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    const out = save && save.filePath;
    if (!out) return { canceled: true };
    fs.writeFileSync(out, buildMarkdown(store.get(), range), 'utf8');
    shell.showItemInFolder(out);
    return { canceled: false, path: out };
  });

  ipcMain.handle('export:json', async () => {
    const save = await dialog.showSaveDialog({
      title: '导出 JSON 备份',
      defaultPath: path.join(app.getPath('documents'), `升级日记-备份-${todayKey()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    const out = save && save.filePath;
    if (!out) return { canceled: true };
    fs.writeFileSync(out, JSON.stringify(store.get(), null, 2), 'utf8');
    shell.showItemInFolder(out);
    return { canceled: false, path: out };
  });

  ipcMain.handle('import:json', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 JSON 备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    const file = result && !result.canceled && result.filePaths[0];
    if (!file) return { ok: false, canceled: true };
    try {
      const parsed = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
      store.replaceData(JSON.parse(JSON.stringify(parsed))); // replaceData 内部会先落盘，导入前已有今日启动备份兜底
      applyTheme();
      registerHotkeys();
      broadcast();
      return { ok: true };
    } catch (err) {
      dialog.showErrorBox('导入失败', String(err.message || err));
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('overlay:open', () => showOverlay(true));
  ipcMain.handle('overlay:close', () => hideOverlay());
  ipcMain.handle('overlay:toggle', (e, { id }) => {
    store.toggleTask({ dateKey: todayKey(), id });
    broadcast();
  });

  ipcMain.handle('quickadd:open', () => showQuickAdd());
  ipcMain.handle('quickadd:close', () => hideQuickAdd());
  ipcMain.handle('quickadd:create', (e, { title }) => {
    if (title && String(title).trim()) {
      store.addTask({ dateKey: todayKey(), title: String(title).trim(), desc: '' });
      broadcast();
    }
  });
}

// ---------- 菜单：应用菜单用显式 label + 显式 click，不依赖 role 自动生成 ----------
function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: '关于升级日记',
    message: '升级日记 v' + app.getVersion(),
    detail: '每天一页的任务与感悟日记\n数据仅存本机 · MIT 开源',
    buttons: ['好']
  });
}

function setupMenu() {
  const template = [
    {
      label: '升级日记',
      submenu: [
        { label: '关于升级日记', click: showAbout },
        { type: 'separator' },
        { label: '隐藏升级日记', accelerator: 'CommandOrControl+H', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出升级日记', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
    }
  ];
  appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appMenu);
  // Dock 图标右键菜单也给一个退出入口
  if (app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: '关于升级日记', click: showAbout },
      { label: '退出升级日记', click: () => app.quit() }
    ]));
  }
}

// ---------- 启动 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  });

  app.whenReady().then(() => {
    ensureStore();
    // 截图模式下允许从环境变量指定主题（示例数据另由种子脚本准备）
    if (process.env.SJ_THEME && store) { store.updateSettings({ theme: process.env.SJ_THEME }); applyTheme(); }
    setupMenu();
    registerIpc();
    createMainWindow();
    registerHotkeys();
    // 自测钩子：SJ_AUTO_DIALOG=1 时自动走一遍选择文件夹流程拿日志（6 秒看门狗后退出）
    if (process.env.SJ_AUTO_DIALOG) {
      setTimeout(async () => {
        console.log('[autotest] 调用 chooseDataDir（真实窗口环境）…');
        const t0 = Date.now();
        const dir = await Promise.race([
          chooseDataDir(),
          new Promise(r => setTimeout(() => r('__TIMEOUT__'), 6000))
        ]);
        console.log('[autotest] 结果:', dir, '，耗时', Date.now() - t0, 'ms');
        app.exit(0);
      }, 2500);
    }
    // 自测钩子：SJ_AUTO_CLOSE=1 时模拟点 X 关窗，验证应用整体退出
    if (process.env.SJ_AUTO_CLOSE) {
      setTimeout(() => {
        console.log('[autotest] 模拟点 X：mainWin.close()');
        mainWin.close();
        setTimeout(() => {
          console.log('[autotest] 8 秒后仍在运行 → 未退出 ✗');
          process.exit(42);
        }, 8000);
      }, 2500);
    }
    // 文档钩子：SJ_SHOT=<输出路径> 时自动截图（SJ_VIEW=stats 可切到统计视图），
    // 配合种子脚本生成的示例数据，用于生成 README 界面截图
    if (process.env.SJ_SHOT) {
      setTimeout(async () => {
        try {
          if (process.env.SJ_VIEW === 'stats') {
            await mainWin.webContents.executeJavaScript(
              "document.querySelectorAll('#nav .nav-btn')[1].click()"
            );
            await new Promise(r => setTimeout(r, 800));
          }
          const img = await mainWin.webContents.capturePage();
          fs.writeFileSync(process.env.SJ_SHOT, img.toPNG());
          console.log('[shot] written:', process.env.SJ_SHOT);
        } catch (err) {
          console.error('[shot] failed:', err);
          app.exit(1);
          return;
        }
        app.exit(0);
      }, 3200);
    }
    if (!app.isPackaged && fs.existsSync(iconPath)) {
      try { if (app.dock) app.dock.setIcon(iconPath); } catch (e) { /* 忽略 */ }
    }
    nativeTheme.on('updated', () => broadcast());
  });

  app.on('activate', () => {
    // app.hide() 后重新激活，系统菜单栏可能不重新同步（点击无效），重设一次强制刷新
    if (appMenu) Menu.setApplicationMenu(appMenu);
    if (BrowserWindow.getAllWindows().filter(w => w === mainWin).length === 0) createMainWindow();
    else if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (store) store.saveNow();
  });
}

if (isDev) {
  console.log('[shengji-diary] dev mode');
}
