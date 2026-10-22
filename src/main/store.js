'use strict';
// 数据存储层：纯 Node 模块，不依赖 Electron，路径由调用方注入。
// 数据模型：{ version, settings, days: { 'YYYY-MM-DD': { reflection, tasks: [...] } } }

const fs = require('fs');
const path = require('path');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) { return String(n).padStart(2, '0'); }
function fmtKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return fmtKey(new Date()); }
function dateFromKey(k) { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekdayCN(k) { return WEEKDAYS[dateFromKey(k).getDay()]; }
function fmtDateTime(d) { return `${fmtKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function defaultData() {
  return {
    version: 1,
    settings: {
      theme: 'system',
      hotkeys: { quickAdd: 'Alt+Space', overlay: 'Alt+F' }
    },
    days: {}
  };
}

function newId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 记录口径：当天有任务（无论完成与否）或写了感悟，即算记录一天
function isRecorded(day) {
  return !!day && ((day.tasks && day.tasks.length > 0) || !!(day.reflection && day.reflection.trim()));
}

// 把任意形状的输入收敛成合法数据（导入、读取共用）
function normalize(parsed) {
  const fresh = defaultData();
  if (!parsed || typeof parsed !== 'object') return fresh;
  if (!parsed.days || typeof parsed.days !== 'object') {
    if (Object.keys(parsed).length && !parsed.settings && !parsed.version) throw new Error('不是升级日记的数据文件');
    return fresh;
  }
  fresh.days = parsed.days;
  if (parsed.settings && typeof parsed.settings === 'object') {
    Object.assign(fresh.settings, parsed.settings);
    if (parsed.settings.hotkeys && typeof parsed.settings.hotkeys === 'object') {
      Object.assign(fresh.settings.hotkeys, parsed.settings.hotkeys);
    }
  }
  return fresh;
}

function createStore({ dataFile, backupDir }) {
  let data = defaultData();
  let saveTimer = null;
  let backedUp = false;

  function load() {
    try {
      data = normalize(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
    } catch (e) {
      if (fs.existsSync(dataFile)) throw e; // 文件存在但损坏：交由上层决定是否从备份恢复
      data = defaultData();
      saveNow();
    }
    return data;
  }

  function saveNow() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  // 每次启动滚动备份，保留最近 7 份
  function backupOnce() {
    if (backedUp || !fs.existsSync(dataFile)) return;
    backedUp = true;
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const now = new Date();
      const stamp = `${fmtKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      fs.copyFileSync(dataFile, path.join(backupDir, `data-${stamp}.json`));
      const files = fs.readdirSync(backupDir).filter(f => /^data-.*\.json$/.test(f)).sort();
      while (files.length > 7) fs.unlinkSync(path.join(backupDir, files.shift()));
    } catch (e) { /* 备份失败不阻塞使用 */ }
  }

  function get() { return data; }

  function mutate(fn) { fn(data); scheduleSave(); return data; }

  function ensureDay(d, key) {
    if (!d.days[key]) d.days[key] = { reflection: '', tasks: [] };
    return d.days[key];
  }

  function pruneDay(d, key) {
    const day = d.days[key];
    if (day && !day.tasks.length && !(day.reflection && day.reflection.trim())) delete d.days[key];
  }

  const api = {
    load, saveNow, get, backupOnce, scheduleSave,
    replaceData(parsed) {
      mutate(d => {
        const fresh = normalize(parsed);
        Object.keys(d).forEach(k => delete d[k]);
        Object.assign(d, fresh);
      });
      saveNow();
    },
    updateSettings(patch) {
      mutate(d => {
        if (patch.theme !== undefined) d.settings.theme = patch.theme;
        if (patch.hotkeys) Object.assign(d.settings.hotkeys, patch.hotkeys);
      });
      return data.settings;
    },
    addTask({ dateKey, title, desc }) {
      let id = null;
      mutate(d => {
        const day = ensureDay(d, dateKey);
        const task = { id: newId(), title: String(title).trim(), desc: String(desc || '').trim(), done: false, createdAt: Date.now() };
        day.tasks.push(task);
        id = task.id;
      });
      return id;
    },
    toggleTask({ dateKey, id }) {
      mutate(d => {
        const day = d.days[dateKey];
        const t = day && day.tasks.find(t => t.id === id);
        if (t) t.done = !t.done;
      });
    },
    updateTask({ dateKey, id, fields }) {
      mutate(d => {
        const day = d.days[dateKey];
        const t = day && day.tasks.find(t => t.id === id);
        if (!t) return;
        if (typeof fields.title === 'string' && fields.title.trim()) t.title = fields.title.trim();
        if (typeof fields.desc === 'string') t.desc = fields.desc.trim();
      });
    },
    deleteTask({ dateKey, id }) {
      let out = null;
      mutate(d => {
        const day = d.days[dateKey];
        if (!day) return;
        const i = day.tasks.findIndex(t => t.id === id);
        if (i > -1) {
          out = { task: day.tasks[i], index: i };
          day.tasks.splice(i, 1);
          pruneDay(d, dateKey);
        }
      });
      return out;
    },
    restoreTask({ dateKey, index, task }) {
      mutate(d => {
        const day = ensureDay(d, dateKey);
        day.tasks.splice(Math.min(index, day.tasks.length), 0, task);
      });
    },
    // 拖动排序：按 order 里的 id 重排；order 未包含的任务按原相对顺序追加在末尾
    reorderTasks({ dateKey, order }) {
      mutate(d => {
        const day = d.days[dateKey];
        if (!day || !Array.isArray(order)) return;
        const byId = {};
        day.tasks.forEach(t => { byId[t.id] = t; });
        const next = order.map(id => byId[id]).filter(Boolean);
        const placed = new Set(next.map(t => t.id));
        day.tasks.forEach(t => { if (!placed.has(t.id)) next.push(t); });
        day.tasks = next;
      });
    },
    setReflection({ dateKey, text }) {
      mutate(d => {
        const day = ensureDay(d, dateKey);
        day.reflection = String(text);
        pruneDay(d, dateKey);
      });
    },
    // 把今天之前所有未完成任务搬入 todayStr，按日期与原顺序追加到末尾
    carryTo(todayStr) {
      let count = 0;
      mutate(d => {
        const keys = Object.keys(d.days).filter(k => k < todayStr).sort();
        const target = ensureDay(d, todayStr);
        keys.forEach(k => {
          const day = d.days[k];
          const stay = [];
          day.tasks.forEach(t => {
            if (t.done) stay.push(t);
            else { target.tasks.push(Object.assign({}, t, { carriedFrom: k })); count++; }
          });
          day.tasks = stay;
          pruneDay(d, k);
        });
      });
      return count;
    },
    // 统计 viewDate 之前（不含）还有多少未完成任务
    countUnfinishedBefore(beforeKey) {
      return Object.keys(data.days)
        .filter(k => k < beforeKey)
        .reduce((n, k) => n + data.days[k].tasks.filter(t => !t.done).length, 0);
    }
  };
  return api;
}

// 一图四数：累计完成 / 记录天数 / 最长连续 / 当前连续
function computeStats(data, todayStr) {
  const days = data.days || {};
  const keys = Object.keys(days).filter(k => isRecorded(days[k])).sort();
  const doneTotal = keys.reduce((n, k) => n + days[k].tasks.filter(t => t.done).length, 0);

  let cursor = dateFromKey(todayStr);
  if (!keys.includes(fmtKey(cursor))) cursor = addDays(cursor, -1); // 今天还没记录时不打断连续
  let current = 0;
  while (keys.includes(fmtKey(cursor))) { current++; cursor = addDays(cursor, -1); }

  let longest = 0, run = 0, prev = null;
  keys.forEach(k => {
    run = (prev && fmtKey(addDays(dateFromKey(prev), 1)) === k) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  });

  return { doneTotal, dayCount: keys.length, currentStreak: current, longestStreak: longest };
}

// 导出 Markdown：按日期一节一节排，任务带勾选状态，感悟保留原文
function buildMarkdown(data, range = {}) {
  const keys = Object.keys(data.days || {})
    .filter(k => (!range.from || k >= range.from) && (!range.to || k <= range.to))
    .sort();
  const lines = ['# 升级日记 · 导出', '', `> 导出时间：${fmtDateTime(new Date())}`, ''];
  if (!keys.length) lines.push('（该范围内暂无记录）');
  keys.forEach(k => {
    const day = data.days[k];
    lines.push(`## ${k} 星期${weekdayCN(k)}`, '');
    if (day.tasks.length) {
      day.tasks.forEach(t => {
        lines.push(`- [${t.done ? 'x' : ' '}] ${t.title}${t.desc ? ` —— ${t.desc}` : ''}`);
      });
    } else {
      lines.push('（无任务）');
    }
    if (day.reflection && day.reflection.trim()) {
      lines.push('', ...day.reflection.trim().split('\n').map(l => `> ${l}`));
    }
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = {
  createStore, computeStats, buildMarkdown, normalize,
  todayKey, fmtKey, dateFromKey, addDays, weekdayCN, isRecorded
};
