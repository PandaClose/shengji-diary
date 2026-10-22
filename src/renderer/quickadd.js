'use strict';

const inp = document.getElementById('inp');
const doneEl = document.getElementById('done');
let closing = false;

inp.addEventListener('keydown', async e => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { api.closeQuickAdd(); return; }
  if (e.key === 'Enter' && inp.value.trim() && !closing) {
    closing = true;
    await api.quickCreate(inp.value.trim());
    inp.style.display = 'none';
    doneEl.style.display = 'inline';
    setTimeout(() => api.closeQuickAdd(), 500);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') api.closeQuickAdd();
});

setTimeout(() => inp.focus(), 50);
