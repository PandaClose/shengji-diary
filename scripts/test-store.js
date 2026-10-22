'use strict';
// store.js 纯逻辑自测：node scripts/test-store.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { createStore, computeStats, buildMarkdown, normalize, todayKey, fmtKey, addDays } = require('../src/main/store');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sjd-test-'));
const store = createStore({ dataFile: path.join(tmp, 'data.json'), backupDir: path.join(tmp, 'backups') });
store.load();

const today = todayKey();
const y1 = fmtKey(addDays(new Date(), -1));
const y3 = fmtKey(addDays(new Date(), -3));

// 新增 / 勾选
const a = store.addTask({ dateKey: today, title: '任务A', desc: '描述' });
const b = store.addTask({ dateKey: today, title: '任务B' });
store.addTask({ dateKey: y1, title: '昨天未完成' });
const ydone = store.addTask({ dateKey: y1, title: '昨天已完成' });
store.toggleTask({ dateKey: y1, id: ydone });
assert.strictEqual(store.get().days[today].tasks.length, 2);
store.toggleTask({ dateKey: today, id: a });
assert.ok(store.get().days[today].tasks[0].done);

// 删除 + 恢复
const removed = store.deleteTask({ dateKey: today, id: b });
assert.strictEqual(removed.index, 1);
store.restoreTask({ dateKey: today, index: removed.index, task: removed.task });
assert.strictEqual(store.get().days[today].tasks.length, 2);

// 感悟：空日期自动建天、清空后自动删天
store.setReflection({ dateKey: y3, text: '想法' });
assert.ok(store.get().days[y3]);
store.setReflection({ dateKey: y3, text: '' });
assert.ok(!store.get().days[y3]);

// 统计：昨天 1/2 记录、今天记录 → 当前连续 2
const s1 = computeStats(store.get(), today);
assert.strictEqual(s1.currentStreak, 2);
assert.strictEqual(s1.dayCount, 2);

// 搬运：昨天 1 个未完成 → 今天；昨天保留已完成任务作历史
const n = store.carryTo(today);
assert.strictEqual(n, 1);
const carried = store.get().days[today].tasks.find(t => t.title === '昨天未完成');
assert.strictEqual(carried.carriedFrom, y1);
assert.strictEqual(store.get().days[today].tasks[store.get().days[today].tasks.length - 1].title, '昨天未完成');

// 搬运后统计：昨天的已完成任务留在原日期作历史（仍是记录日），未完成清空搬走
const s2 = computeStats(store.get(), today);
assert.strictEqual(s2.dayCount, 2);
assert.strictEqual(s2.currentStreak, 2);
assert.strictEqual(s2.doneTotal, 2);
assert.strictEqual(store.get().days[y1].tasks.length, 1);

// 导出 Markdown
const md = buildMarkdown(store.get());
assert.ok(md.includes(`## ${today}`));
assert.ok(md.includes('- [x] 任务A —— 描述'));
assert.ok(md.includes('- [ ] 任务B'));

// 拖动排序：按 id 重排；未知 id 忽略、缺失的按原相对顺序追加
const order0 = store.get().days[today].tasks.map(t => t.id);
store.reorderTasks({ dateKey: today, order: [order0[2], order0[0], order0[1]] });
assert.deepStrictEqual(store.get().days[today].tasks.map(t => t.id), [order0[2], order0[0], order0[1]]);
store.reorderTasks({ dateKey: today, order: [order0[0]] });
assert.deepStrictEqual(
  store.get().days[today].tasks.map(t => t.id),
  [order0[0], order0[2], order0[1]]
);

// normalize 拒绝非日记数据
assert.throws(() => normalize({ foo: 1 }));

// 持久化：新实例读回一致
store.saveNow();
const store2 = createStore({ dataFile: path.join(tmp, 'data.json'), backupDir: path.join(tmp, 'backups') });
store2.load();
assert.strictEqual(store2.get().days[today].tasks.length, 3);

console.log('[test-store] 全部通过 ✓');
