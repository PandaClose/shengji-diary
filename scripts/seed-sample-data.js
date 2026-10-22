'use strict';
// 生成截图用示例数据：全部为通用演示内容，不含任何真实个人信息。
// 用法：node scripts/seed-sample-data.js <userDataDir> <dataDir> [dark|light]
//   写入 <userDataDir>/config.json 指向 <dataDir>，并生成约 8 周的示例记录。

const fs = require('fs');
const path = require('path');

const userDataDir = process.argv[2];
const dataDir = process.argv[3];
const theme = process.argv[4] === 'light' ? 'light' : 'dark';
if (!userDataDir || !dataDir) {
  console.error('用法: node scripts/seed-sample-data.js <userDataDir> <dataDir> [dark|light]');
  process.exit(1);
}

// 可复现的伪随机（mulberry32）
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261022);

const TITLES = [
  '晨间复盘', '阅读 30 分钟', '跑步 5 公里', '写周报', '整理待办清单',
  '学习英语 20 分钟', '整理桌面与文件', '给家里打电话', '采购生活用品', '复盘本周计划'
];
const REFLECTIONS = [
  '今天状态不错，效率比昨天高。',
  '有点累，但还是把计划完成了。',
  '下午被打断了几次，明天试试番茄钟。',
  '早睡早起第三天，明显感觉精力变好了。',
  '把最难的事放在早上做，果然是对的。',
  '今天没什么输出，整理了思路也算收获。',
  '坚持一周了，给自己点个赞。',
  '晚上想明白了一个纠结很久的问题。'
];

function pad(n) { return String(n).padStart(2, '0'); }
function key(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const days = {};
let seq = 0;
function addDay(dateStr, doneCount, withUndone, reflection) {
  const tasks = [];
  for (let i = 0; i < doneCount; i++) {
    tasks.push({
      id: `t_seed_${String(++seq).padStart(4, '0')}`,
      title: TITLES[(seq + i) % TITLES.length],
      desc: i === 0 && rand() < 0.4 ? '示例任务' : '',
      done: true,
      createdAt: Date.now() - 86400000 * 30
    });
  }
  if (withUndone) {
    tasks.push({
      id: `t_seed_${String(++seq).padStart(4, '0')}`,
      title: TITLES[(seq + 5) % TITLES.length],
      desc: '', done: false, createdAt: Date.now() - 86400000 * 30
    });
  }
  days[dateStr] = { reflection: reflection || '', tasks };
}

const start = new Date(2026, 8, 1);   // 2026-09-01
const end = new Date(2026, 9, 22);    // 2026-10-22（今天）
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const k = key(d);
  const daysFromToday = Math.round((end - d) / 86400000);
  let record = rand() < 0.45;
  if (daysFromToday <= 6) record = true;          // 最近一周连续记录
  if (daysFromToday === 3) record = false;        // 留一个中断，最长连续才有意义
  if (!record) continue;

  // 完成个数：以一档（1-5）为主，穿插二档，个别三档
  let done;
  const r = rand();
  if (daysFromToday <= 1) done = 2 + Math.floor(rand() * 3);
  else if (r < 0.55) done = 1 + Math.floor(rand() * 5);
  else if (r < 0.85) done = 6 + Math.floor(rand() * 4);
  else done = 11 + Math.floor(rand() * 3);
  addDay(k, done, rand() < 0.3, rand() < 0.4 ? REFLECTIONS[Math.floor(rand() * REFLECTIONS.length)] : '');
}

// 今天这页：2 条未完成 + 1 条已完成 + 感悟，贴近真实使用瞬间
days[key(end)] = {
  reflection: '状态在线，明天继续保持。',
  tasks: [
    { id: 't_seed_9001', title: '晨间复盘', desc: '', done: true, createdAt: Date.now() },
    { id: 't_seed_9002', title: '写周报', desc: '整理本周完成事项', done: true, createdAt: Date.now() },
    { id: 't_seed_9003', title: '跑步 5 公里', desc: '', done: false, createdAt: Date.now() }
  ]
};

const data = {
  version: 1,
  settings: { theme, hotkeys: { quickAdd: 'Alt+Space', overlay: 'Alt+F' } },
  days
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(data, null, 2));
fs.mkdirSync(userDataDir, { recursive: true });
fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({ dataDir }, null, 2));
console.log(`[seed] 示例数据就绪：${Object.keys(days).length} 天记录，主题=${theme}`);
console.log('[seed] dataDir =', dataDir);
