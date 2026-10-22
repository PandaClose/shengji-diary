'use strict';
/* 主窗口渲染逻辑：状态由主进程持有，渲染层只发 mutation、收 data:changed 全量广播。 */

const $ = s => document.querySelector(s);
const els = {
  app: $('#app'), onboarding: $('#onboarding'),
  tbHint: $('#tbHint'), btnOverlay: $('#btnOverlay'),
  streakNum: $('#streakNum'), stDone: $('#stDone'), stDays: $('#stDays'), stLong: $('#stLong'),
  calTitle: $('#calTitle'), cal: $('#cal'), calPrev: $('#calPrev'), calNext: $('#calNext'),
  nav: $('#nav'), seg: $('#seg'),
  btnExport: $('#btnExport'), btnImport: $('#btnImport'), btnSettings: $('#btnSettings'),
  viewToday: $('#viewToday'), viewStats: $('#viewStats'),
  dDate: $('#dDate'), chipNum: $('#chipNum'),
  carry: $('#carry'), carryText: $('#carryText'), btnCarry: $('#btnCarry'),
  list: $('#list'), inpAdd: $('#inpAdd'),
  note: $('#note'), saveHint: $('#saveHint'),
  cDone: $('#cDone'), cDays: $('#cDays'), cLong: $('#cLong'), cCur: $('#cCur'),
  heat: $('#heat'), heatRange: $('#heatRange'),
  toast: $('#toast'),
  settingsModal: $('#settingsModal'), setDataDir: $('#setDataDir'), btnChangeDir: $('#btnChangeDir'),
  hkQuick: $('#hkQuick'), hkOverlay: $('#hkOverlay'), hkTip: $('#hkTip'),
  btnExportJson: $('#btnExportJson'), btnImportJson: $('#btnImportJson'),
  btnChooseDir: $('#btnChooseDir')
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const state = {
  data: null, today: '', viewDate: '', month: { y: 2000, m: 0 },
  nav: 'today', editingId: null, lastDeleted: null,
  selId: null, hoverId: null,
  noteTimer: null, hintTimer: null, toastTimer: null,
  captureSlot: null, flipSnap: null, bound: false
};

/* ---------- 日期工具 ---------- */
const pad = n => String(n).padStart(2, '0');
const fmtKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function fmtHeader(key) {
  const d = parseKey(key);
  const sameYear = d.getFullYear() === parseKey(state.today).getFullYear();
  return `${sameYear ? '' : d.getFullYear() + '年'}${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`;
}

/* ---------- 数据口径（与主进程 store.js 保持一致） ---------- */
const isRecorded = day => !!day && ((day.tasks && day.tasks.length > 0) || !!(day.reflection && day.reflection.trim()));
function computeStats(data, todayStr) {
  const days = data.days || {};
  const keys = Object.keys(days).filter(k => isRecorded(days[k])).sort();
  const doneTotal = keys.reduce((n, k) => n + days[k].tasks.filter(t => t.done).length, 0);
  let cursor = parseKey(todayStr);
  if (!keys.includes(fmtKey(cursor))) cursor = addDays(cursor, -1);
  let current = 0;
  while (keys.includes(fmtKey(cursor))) { current++; cursor = addDays(cursor, -1); }
  let longest = 0, run = 0, prev = null;
  keys.forEach(k => {
    run = (prev && fmtKey(addDays(parseKey(prev), 1)) === k) ? run + 1 : 1;
    longest = Math.max(longest, run); prev = k;
  });
  return { doneTotal, dayCount: keys.length, currentStreak: current, longestStreak: longest };
}
const curDay = () => (state.data && state.data.days[state.viewDate]) || { reflection: '', tasks: [] };
// 热力图档位：按当日完成任务个数（对标 GitHub commit 数）
// 0→L0，1-5→L1，6-10→L2，11-15→L3，16-20→L4，21+→L5
function heatLevel(n) {
  return n <= 0 ? 'L0' : n <= 5 ? 'L1' : n <= 10 ? 'L2' : n <= 15 ? 'L3' : n <= 20 ? 'L4' : 'L5';
}

/* ---------- 通用 UI ---------- */
function showToast(text, actionLabel, actionFn, ms) {
  clearTimeout(state.toastTimer);
  els.toast.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = text;
  els.toast.appendChild(span);
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'toast-act'; btn.type = 'button'; btn.textContent = actionLabel;
    btn.addEventListener('click', () => { els.toast.classList.remove('show'); actionFn(); });
    els.toast.appendChild(btn);
  }
  els.toast.classList.add('show');
  state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms || (actionLabel ? 4500 : 2200));
}

function deleteTask(id) {
  api.deleteTask({ dateKey: state.viewDate, id }).then(out => {
    if (!out) return;
    if (state.selId === id) state.selId = null;
    if (state.hoverId === id) state.hoverId = null;
    state.lastDeleted = { dateKey: state.viewDate, task: out.task, index: out.index };
    showToast('已删除', '撤销', () => {
      api.restoreTask({
        dateKey: state.lastDeleted.dateKey,
        index: state.lastDeleted.index,
        task: state.lastDeleted.task
      });
      state.lastDeleted = null;
    });
  });
}

function captureRects() {
  const map = new Map();
  els.list.querySelectorAll('.t-row').forEach(r => map.set(r.dataset.id, r.getBoundingClientRect().top));
  return map;
}
function playFlip() {
  if (!state.flipSnap) return;
  els.list.querySelectorAll('.t-row').forEach(r => {
    const before = state.flipSnap.get(r.dataset.id);
    if (before === undefined) return;
    const dt = before - r.getBoundingClientRect().top;
    if (dt) {
      r.style.transition = 'none'; r.style.transform = `translateY(${dt}px)`;
      r.getBoundingClientRect();
      r.style.transition = 'transform .28s ease'; r.style.transform = '';
      r.addEventListener('transitionend', () => { r.style.transition = ''; }, { once: true });
    }
  });
  state.flipSnap = null;
}

/* ---------- 渲染 ---------- */
function render() {
  if (!state.data) return;
  const d = state.data;
  const stats = computeStats(d, state.today);
  const s = d.settings || {};

  els.streakNum.textContent = stats.currentStreak;
  els.stDone.textContent = stats.doneTotal;
  els.stDays.textContent = stats.dayCount;
  els.stLong.textContent = stats.longestStreak;

  const hk = s.hotkeys || {};
  const pretty = a => String(a || '—')
    .replace(/Meta\+/g, '⌘').replace(/Control\+/g, '⌃')
    .replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
  els.tbHint.textContent = `${pretty(hk.quickAdd)} 快速记录 · ${pretty(hk.overlay)} 浮层`;
  els.seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === (s.theme || 'system')));

  renderCal();
  if (state.nav === 'today') renderToday();
  else renderStats();
}

function renderCal() {
  const { y, m } = state.month;
  els.calTitle.textContent = `${y}年${m + 1}月`;
  els.cal.innerHTML = '';
  WEEKDAYS.slice(1).concat(WEEKDAYS[0]).forEach(w => {
    const h = document.createElement('span');
    h.className = 'cal-wd'; h.textContent = w; els.cal.appendChild(h);
  });
  const first = new Date(y, m, 1);
  const blanks = (first.getDay() + 6) % 7;
  for (let i = 0; i < blanks; i++) els.cal.appendChild(document.createElement('span'));
  const days = new Date(y, m + 1, 0).getDate();
  for (let dd = 1; dd <= days; dd++) {
    const key = fmtKey(new Date(y, m, dd));
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'cal-day'; btn.textContent = dd;
    const day = state.data.days[key];
    if (day) {
      const done = (day.tasks || []).filter(x => x.done).length;
      const lv = heatLevel(done);
      if (lv !== 'L0') btn.classList.add(lv);
      const hasNote = !!(day.reflection && day.reflection.trim());
      btn.title = `完成 ${done} 个` + (hasNote ? ' · ♥ 有感悟' : '');
      if (hasNote) {
        const h = document.createElement('i');
        h.className = 'cm'; h.textContent = '♥';
        btn.appendChild(h);
      }
    }
    if (key === state.today) btn.classList.add('today');
    if (key === state.viewDate) btn.classList.add('sel');
    btn.addEventListener('click', () => {
      state.viewDate = key; state.editingId = null;
      // 统计视图下点日历：自动切回今天视图并展示该日内容
      if (state.nav === 'stats') {
        state.nav = 'today';
        els.nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === 'today'));
      }
      render();
    });
    els.cal.appendChild(btn);
  }
}

function renderToday() {
  els.viewToday.hidden = false;
  els.viewStats.hidden = true;
  const day = curDay();
  els.dDate.textContent = state.viewDate === state.today ? '今天 · ' + fmtHeader(state.viewDate) : fmtHeader(state.viewDate);

  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.done).length;
  const prev = els.chipNum.textContent;
  els.chipNum.textContent = `${done}/${total}`;
  if (prev !== els.chipNum.textContent) {
    const chip = els.chipNum.parentElement;
    chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
  }

  const n = state.data ? pendingCarry() : 0;
  const showCarry = state.viewDate === state.today && n > 0;
  els.carry.hidden = !showCarry;
  if (showCarry) els.carryText.textContent = `之前的日期还有 ${n} 个未完成任务`;

  renderList(day);
  els.inpAdd.placeholder = state.viewDate === state.today ? '＋ 记一条任务，回车即可' : '＋ 补记一条任务，回车即可';

  if (document.activeElement !== els.note) {
    els.note.value = day.reflection || '';
    els.note.placeholder = state.viewDate === state.today ? '今天有什么想记下来的…' : '补记这一天的想法…';
  }
}

function pendingCarry() {
  let n = 0;
  Object.keys(state.data.days).forEach(k => {
    if (k < state.today) n += state.data.days[k].tasks.filter(t => !t.done).length;
  });
  return n;
}

function renderList(day) {
  els.list.innerHTML = '';
  day.tasks.forEach(t => els.list.appendChild(taskRow(t)));
  // 分隔线按视觉顺序画：完成的沉底后，第一条可见行不画顶线，其余行都有
  const rows = [].slice.call(els.list.children);
  const visual = rows.filter(r => !r.classList.contains('done'))
    .concat(rows.filter(r => r.classList.contains('done')));
  visual.forEach((r, i) => r.classList.toggle('sep', i > 0));
  playFlip();
}

function taskRow(t) {
  const row = document.createElement('div');
  row.className = 't-row' + (t.done ? ' done' : '') + (t.id === state.editingId ? ' editing' : '') + (t.id === state.selId ? ' sel-row' : '');
  row.dataset.id = t.id;

  const chk = document.createElement('button');
  chk.className = 't-check'; chk.type = 'button';
  chk.setAttribute('aria-pressed', t.done ? 'true' : 'false');
  row.appendChild(chk);

  const main = document.createElement('div'); main.className = 't-main';
  if (t.id === state.editingId) {
    const ti = document.createElement('input');
    ti.className = 'edit-title'; ti.value = t.title;
    const di = document.createElement('input');
    di.className = 'edit-desc'; di.value = t.desc || ''; di.placeholder = '描述（可选）';
    main.appendChild(ti); main.appendChild(di);
    setTimeout(() => { ti.focus(); ti.select(); }, 0);
  } else {
    const title = document.createElement('div'); title.className = 't-title';
    if (t.carriedFrom) {
      const tag = document.createElement('span');
      tag.className = 't-src'; tag.textContent = t.carriedFrom.slice(5);
      title.appendChild(tag);
    }
    title.appendChild(document.createTextNode(t.title));
    main.appendChild(title);
    if (t.desc) {
      const desc = document.createElement('div'); desc.className = 't-desc'; desc.textContent = t.desc;
      main.appendChild(desc);
    }
  }
  row.appendChild(main);

  const acts = document.createElement('div'); acts.className = 't-acts';
  const grip = document.createElement('button'); grip.type = 'button'; grip.className = 't-grip'; grip.textContent = '⠿'; grip.title = '拖动排序';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 't-edit'; edit.textContent = '✎'; edit.title = '编辑';
  const del = document.createElement('button'); del.type = 'button'; del.className = 't-del'; del.textContent = '✕'; del.title = '删除';
  acts.appendChild(grip); acts.appendChild(edit); acts.appendChild(del);
  row.appendChild(acts);
  return row;
}

function renderStats() {
  els.viewStats.hidden = false;
  els.viewToday.hidden = true;
  const stats = computeStats(state.data, state.today);
  els.cDone.textContent = stats.doneTotal;
  els.cDays.textContent = stats.dayCount;
  els.cLong.textContent = stats.longestStreak;
  els.cCur.textContent = stats.currentStreak;

  els.heat.innerHTML = '';
  const WEEKS = 18;
  const t = parseKey(state.today);
  const first = addDays(t, -(WEEKS - 1) * 7);
  els.heatRange.textContent = `${first.getMonth() + 1}月${first.getDate()}日 – ${t.getMonth() + 1}月${t.getDate()}日`;
  for (let col = 0; col < WEEKS; col++) {
    const column = document.createElement('div'); column.className = 'heat-col';
    for (let row = 0; row < 7; row++) {
      const k = (WEEKS - 1 - col) * 7 - row;
      const cell = document.createElement('span'); cell.className = 'heat-cell';
      if (k < 0) { cell.style.visibility = 'hidden'; column.appendChild(cell); continue; }
      const dt = addDays(t, -k);
      const day = state.data.days[fmtKey(dt)];
      let cls = 'L0', tip = `${dt.getMonth() + 1}月${dt.getDate()}日 · 未记录`;
      if (day) {
        const done = (day.tasks || []).filter(x => x.done).length;
        const hasNote = !!(day.reflection && day.reflection.trim());
        cls = heatLevel(done);
        tip = `${dt.getMonth() + 1}月${dt.getDate()}日 · 完成 ${done} 个` + (hasNote ? ' · ♥ 有感悟' : '');
        if (hasNote) {
          const h = document.createElement('i');
          h.className = 'hm'; h.textContent = '♥';
          cell.appendChild(h);
        }
      }
      cell.classList.add(cls); cell.title = tip;
      column.appendChild(cell);
    }
    els.heat.appendChild(column);
  }
}

/* ---------- 交互 ---------- */
function bindEvents() {
  if (state.bound) return;
  state.bound = true;

  els.btnOverlay.addEventListener('click', () => api.openOverlay());

  els.nav.addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    state.nav = btn.dataset.view;
    els.nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b === btn));
    state.editingId = null;
    render();
  });

  els.seg.addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) api.setSettings({ theme: btn.dataset.mode });
  });

  els.calPrev.addEventListener('click', () => shiftMonth(-1));
  els.calNext.addEventListener('click', () => shiftMonth(1));

  els.btnCarry.addEventListener('click', async () => {
    const n = await api.carry();
    showToast(`已搬入 ${n} 个任务`);
  });

  els.list.addEventListener('click', async e => {
    const row = e.target.closest('.t-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('.t-check')) {
      state.selId = id;
      state.flipSnap = captureRects();
      await api.toggleTask({ dateKey: state.viewDate, id });
      return;
    }
    if (e.target.tagName === 'INPUT') return; // 编辑输入框内的点击不处理
    if (e.target.closest('.t-del')) { deleteTask(id); return; }
    // 点任务文本（或 ✎）直接进入编辑；再点已编辑的行则取消
    if (e.target.closest('.t-main') || e.target.closest('.t-edit')) {
      state.selId = id;
      state.editingId = (state.editingId === id) ? null : id;
      render();
      return;
    }
    state.selId = id;
    els.list.querySelectorAll('.t-row').forEach(r => r.classList.toggle('sel-row', r.dataset.id === id));
  });

  els.list.addEventListener('keydown', e => {
    if (!e.target.closest('.editing')) return;
    const row = els.list.querySelector('.t-row.editing');
    if (!row) return;
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      const title = row.querySelector('.edit-title').value.trim();
      if (!title) return;
      const desc = row.querySelector('.edit-desc').value.trim();
      state.editingId = null;
      api.updateTask({ dateKey: state.viewDate, id: row.dataset.id, fields: { title, desc } });
    } else if (e.key === 'Escape') {
      state.editingId = null; render();
    }
  });

  /* 拖动排序：按住 ⠿ 才可拖；只能在同类（未完成/已完成）之间换位 */
  let dragEl = null, dragStartOrder = null;
  const visualRows = () => {
    const rows = [].slice.call(els.list.children);
    return rows.filter(r => !r.classList.contains('done'))
      .concat(rows.filter(r => r.classList.contains('done')));
  };
  const currentOrder = () => visualRows().map(r => r.dataset.id);
  els.list.addEventListener('mousedown', e => {
    const grip = e.target.closest('.t-grip');
    if (!grip) return;
    grip.closest('.t-row').draggable = true;
  });
  els.list.addEventListener('dragstart', e => {
    const row = e.target.closest('.t-row');
    if (!row || !row.draggable) { e.preventDefault(); return; }
    dragEl = row;
    dragStartOrder = currentOrder();
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', row.dataset.id); } catch (err) { /* 忽略 */ }
  });
  els.list.addEventListener('dragover', e => {
    if (!dragEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.t-row');
    if (!target || target === dragEl) return;
    if (target.classList.contains('done') !== dragEl.classList.contains('done')) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (after && target.nextElementSibling === dragEl) return;
    if (!after && target.previousElementSibling === dragEl) return;
    target.parentNode.insertBefore(dragEl, after ? target.nextSibling : target);
  });
  els.list.addEventListener('drop', e => { if (dragEl) e.preventDefault(); });
  els.list.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.draggable = false;
    dragEl.classList.remove('dragging');
    dragEl = null;
    const newOrder = currentOrder();
    if (newOrder.join(',') !== dragStartOrder.join(',')) {
      api.reorderTasks({ dateKey: state.viewDate, order: newOrder });
    }
    dragStartOrder = null;
  });

  /* 键盘操作：↑↓ 选中任务，Enter 编辑，Delete/Backspace 删除（选中或悬停的行） */
  els.list.addEventListener('mouseover', e => {
    const row = e.target.closest('.t-row');
    state.hoverId = row ? row.dataset.id : null;
  });
  els.list.addEventListener('mouseleave', () => { state.hoverId = null; });
  /* 点击任务行之外的任何地方：清除选中态 */
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.t-row')) return;
    state.selId = null;
    els.list.querySelectorAll('.t-row.sel-row').forEach(r => r.classList.remove('sel-row'));
  });
  // 退出编辑态并保存当前行（标题为空视为取消）
  function commitEdit() {
    const row = els.list.querySelector('.t-row.editing');
    state.editingId = null;
    if (!row) return;
    const title = row.querySelector('.edit-title').value.trim();
    const desc = row.querySelector('.edit-desc').value.trim();
    if (title) api.updateTask({ dateKey: state.viewDate, id: row.dataset.id, fields: { title, desc } });
    render();
  }
  document.addEventListener('keydown', e => {
    if (state.nav !== 'today' || state.captureSlot) return;
    const t = e.target;
    const inEdit = t && t.classList && (t.classList.contains('edit-title') || t.classList.contains('edit-desc'));
    if (inEdit && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; // 编辑态只放行上下键
    if (t === els.note) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (inEdit) commitEdit(); // 离开当前行前自动保存
      const rows = visualRows();
      if (!rows.length) return;
      const ids = rows.map(r => r.dataset.id);
      let idx = ids.indexOf(state.selId);
      if (idx === -1) idx = 0;
      else idx = e.key === 'ArrowDown' ? Math.min(idx + 1, ids.length - 1) : Math.max(idx - 1, 0);
      state.selId = ids[idx];
      rows.forEach(r => r.classList.toggle('sel-row', r.dataset.id === state.selId));
      rows[idx].scrollIntoView({ block: 'nearest' });
      e.preventDefault();
      return;
    }
    if (t === els.note) return;
    const rows = visualRows();
    if (!rows.length) return;
    const ids = rows.map(r => r.dataset.id);
    if (e.key === 'Enter' && t !== els.inpAdd && t.tagName !== 'BUTTON' && state.selId && ids.includes(state.selId)) {
      state.editingId = state.selId;
      render();
      e.preventDefault();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && t !== els.inpAdd) {
      const id = state.selId || state.hoverId;
      if (id && ids.includes(id)) { deleteTask(id); e.preventDefault(); }
    }
  });

  els.inpAdd.addEventListener('keydown', async e => {
    if (e.isComposing) return;
    if (e.key !== 'Enter') return;
    const title = els.inpAdd.value.trim();
    if (!title) return;
    const id = await api.addTask({ dateKey: state.viewDate, title, desc: '' });
    const row = els.list.querySelector(`[data-id="${id}"]`);
    if (row) { row.classList.add('new'); setTimeout(() => row.classList.remove('new'), 350); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    els.inpAdd.value = '';
  });

  els.note.addEventListener('input', () => {
    clearTimeout(state.noteTimer);
    state.noteTimer = setTimeout(() => {
      api.setReflection({ dateKey: state.viewDate, text: els.note.value });
      els.saveHint.classList.add('show');
      clearTimeout(state.hintTimer);
      state.hintTimer = setTimeout(() => els.saveHint.classList.remove('show'), 1200);
    }, 600);
  });

  els.btnExport.addEventListener('click', () => api.exportMarkdown());
  els.btnImport.addEventListener('click', () => api.importJson());
  els.btnSettings.addEventListener('click', openSettings);

  els.settingsModal.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeSettings();
  });
  els.btnChangeDir.addEventListener('click', async () => {
    try {
      const r = await api.chooseDataDir();
      if (!r.canceled) closeSettings();
    } catch (err) {
      alert('更改数据文件夹出错：' + (err.message || err));
    }
  });
  const useDir = async () => {
    const p = document.getElementById('dirInput').value.trim();
    if (!p) { alert('请先填写文件夹路径'); return; }
    try {
      const r = await api.chooseDataDir(p);
      if (!r.canceled) closeSettings();
    } catch (err) {
      alert('使用该路径出错：' + (err.message || err));
    }
  };
  document.getElementById('btnUseDir').addEventListener('click', useDir);
  document.getElementById('dirInput').addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter') useDir();
  });
  els.btnExportJson.addEventListener('click', () => api.exportJson());
  els.btnImportJson.addEventListener('click', () => api.importJson());

  document.querySelectorAll('.mini-btn[data-slot]').forEach(btn => {
    btn.addEventListener('click', () => startCapture(btn.dataset.slot));
  });

  document.addEventListener('keydown', e => {
    if (state.captureSlot) return; // 录制模式下由独立 handler 处理
    if (e.key === 'Escape') {
      if (!els.settingsModal.hidden) { closeSettings(); return; }
      if (state.editingId) { state.editingId = null; render(); return; }
      if (state.selId) {
        state.selId = null;
        els.list.querySelectorAll('.t-row.sel-row').forEach(r => r.classList.remove('sel-row'));
      }
    }
  });
}

function shiftMonth(n) {
  const m = new Date(state.month.y, state.month.m + n, 1);
  state.month = { y: m.getFullYear(), m: m.getMonth() };
  render();
}

/* ---------- 设置 ---------- */
function openSettings() {
  els.setDataDir.textContent = (state.data && state.__config && state.__config.dataDir) || '—';
  els.setDataDir.title = (state.__config && state.__config.dataDir) || '';
  const hk = (state.data.settings && state.data.settings.hotkeys) || {};
  const pretty = a => String(a || '—')
    .replace(/Meta\+/g, '⌘').replace(/Control\+/g, '⌃')
    .replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
  els.hkQuick.textContent = pretty(hk.quickAdd);
  els.hkOverlay.textContent = pretty(hk.overlay);
  els.hkTip.textContent = '';
  els.settingsModal.hidden = false;
}
function closeSettings() {
  stopCapture();
  els.settingsModal.hidden = true;
}

function accelFromEvent(e) {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;
  const parts = [];
  if (e.metaKey) parts.push('Meta');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!parts.length) return null; // 必须带修饰键，避免劫持普通输入
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  else {
    const map = {
      Space: 'Space', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
      BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
      Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right'
    };
    key = map[e.code] || null;
  }
  return key ? parts.join('+') + '+' + key : null;
}

function startCapture(slot) {
  state.captureSlot = slot;
  els.hkTip.textContent = '请按下新的组合键（Esc 取消）…';
  document.addEventListener('keydown', captureHandler, true);
}
function stopCapture() {
  state.captureSlot = null;
  document.removeEventListener('keydown', captureHandler, true);
  if (els.hkTip) els.hkTip.textContent = '';
}
async function captureHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopCapture(); return; }
  const accel = accelFromEvent(e);
  if (!accel) return;
  const slot = state.captureSlot;
  stopCapture();
  await api.setSettings({ hotkeys: { [slot]: accel } });
  els.hkTip.textContent = '已更新';
  setTimeout(() => { els.hkTip.textContent = ''; }, 1500);
}

/* ---------- 启动 ---------- */
function boot(payload) {
  state.data = payload.data;
  state.today = payload.today;
  state.__config = payload.config;
  state.viewDate = payload.today;
  const t = parseKey(payload.today);
  state.month = { y: t.getFullYear(), m: t.getMonth() };
  els.onboarding.hidden = true;
  els.app.classList.remove('hidden');
  bindEvents();
  render();
  if (!state.dataListener) {
    state.dataListener = true;
    api.onData(p => {
      state.data = p.data;
      state.today = p.today;
      state.__config = p.config;
      render();
    });
  }
}

// ---- 首启页事件：页面加载即绑定，不依赖 getState 成功（否则一次异步失败按钮就成了死按钮）----
function bindOnboarding() {
  if (state.obBound) return;
  state.obBound = true;
  els.btnChooseDir.addEventListener('click', async () => {
    try {
      const r = await api.chooseDataDir();
      if (r && !r.canceled) boot(r);
    } catch (err) {
      alert('选择文件夹出错：' + (err.message || err));
    }
  });
  const usePath = async () => {
    const p = document.getElementById('obPath').value.trim();
    if (!p) { alert('请先填写文件夹路径'); return; }
    try {
      const r = await api.chooseDataDir(p);
      if (r && !r.canceled) boot(r);
    } catch (err) {
      alert('使用该路径出错：' + (err.message || err));
    }
  };
  document.getElementById('btnUsePath').addEventListener('click', usePath);
  document.getElementById('obPath').addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter') usePath();
  });
}

// 渲染层错误一律弹窗可见并打印（打包后没有终端，alert 是唯一通道）
window.addEventListener('error', e => {
  console.error('[renderer-error]', e.message, e.filename, e.lineno);
});

(async function init() {
  bindOnboarding();
  let s0;
  try {
    s0 = await api.getState();
  } catch (err) {
    els.onboarding.hidden = false;
    alert('初始化失败：' + (err.message || err) + '\n\n请重启应用重试；若反复出现请反馈此信息。');
    return;
  }
  if (s0.needsSetup) {
    els.onboarding.hidden = false;
    return;
  }
  boot(s0);
})();
