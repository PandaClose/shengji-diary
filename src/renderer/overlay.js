'use strict';

const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const clearedEl = document.getElementById('cleared');

let today = '';
let data = null;
let openedEmpty = null; // 打开瞬间是否已清空：为 true 时不自动关闭

function undone() {
  const day = data && data.days && data.days[today];
  return (day && day.tasks || []).filter(t => !t.done);
}

function render() {
  const items = undone();
  countEl.textContent = items.length;
  if (!items.length) {
    listEl.innerHTML = '';
    listEl.hidden = true;
    clearedEl.hidden = false;
    if (openedEmpty === false) {
      openedEmpty = null;
      setTimeout(() => api.closeOverlay(), 1400);
    }
    return;
  }
  clearedEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';
  items.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'item';
    const chk = document.createElement('span'); chk.className = 'chk';
    const label = document.createElement('span'); label.textContent = t.title;
    btn.appendChild(chk); btn.appendChild(label);
    if (t.carriedFrom) {
      const src = document.createElement('span');
      src.className = 'src'; src.textContent = t.carriedFrom.slice(5);
      btn.appendChild(src);
    }
    btn.addEventListener('click', () => api.overlayToggle(t.id));
    listEl.appendChild(btn);
  });
}

api.getState().then(s => {
  data = s.data; today = s.today;
  openedEmpty = undone().length === 0 ? true : false;
  render();
});
api.onData(p => { data = p.data; today = p.today; render(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') api.closeOverlay();
});
document.getElementById('ovClose').addEventListener('click', () => api.closeOverlay());

/* 浮层内直接新增任务 */
var ovAdd = document.getElementById('ovAdd');
ovAdd.addEventListener('keydown', function (e) {
  if (e.isComposing) return;
  if (e.key === 'Enter' && ovAdd.value.trim()) {
    api.addTask({ dateKey: today, title: ovAdd.value.trim(), desc: '' });
    ovAdd.value = '';
  }
});
// 主窗口按钮唤起（有焦点）时，输入框自动就位
window.addEventListener('focus', function () { ovAdd.focus(); });
