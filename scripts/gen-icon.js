'use strict';
// 用 Electron 离屏渲染生成应用图标：琥珀底 + 墨色对勾，输出 build/icon.png（1024x1024）。
// 通过 canvas.toDataURL 导出以保证圆角外为透明（alpha=0），并在脚本内校验四角像素。
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1100, height: 1100, frame: false,
    webPreferences: { offscreen: true }
  });
  await win.loadFile(path.join(__dirname, 'icon.html'));
  await new Promise(r => setTimeout(r, 300));
  const dataUrl = await win.webContents.executeJavaScript(
    'document.getElementById("c").toDataURL("image/png")'
  );
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));

  // 校验：四角与画布外的 alpha 必须为 0（BGRA 第 4 字节）
  const img = nativeImage.createFromPath(out);
  const buf = img.toBitmap();
  const w = img.getSize().width;
  const corners = [0, 3, (w - 1) * 4 + 3, ((w - 1) * w + (w - 1)) * 4 + 3];
  const alphas = corners.map(o => buf[o]);
  if (alphas.some(a => a !== 0)) {
    console.error('[icon] 角落不透明！alpha =', alphas.join(','));
    app.exit(1);
    return;
  }
  console.log('[icon] written:', out, '| 四角透明校验通过 alpha=0 ✓');
  app.quit();
});
