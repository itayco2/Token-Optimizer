// (1) Which tools do workflow agents actually call? (2) Where does wall-clock go: model vs each tool?
const fs = require('fs'), path = require('path');
const ROOT = 'C:/Users/itay7/.claude/projects';
const used = {}, time = {}; let agents = 0, turns = 0, calls = 0, turnsOneCall = 0;
const GAP_CAP = 30 * 60 * 1000; // ignore gaps over 30 min (machine asleep / paused)
for (const proj of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, proj); if (!fs.statSync(p).isDirectory()) continue;
  for (const sess of fs.readdirSync(p)) {
    const wd = path.join(p, sess, 'subagents', 'workflows'); if (!fs.existsSync(wd)) continue;
    for (const wf of fs.readdirSync(wd)) for (const f of fs.readdirSync(path.join(wd, wf)).filter(f => /^agent-.*\.jsonl$/.test(f))) {
      const L = fs.readFileSync(path.join(wd, wf, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.timestamp);
      agents++; const names = {}, mine = new Set(), perMsg = {};
      for (let i = 0; i < L.length; i++) {
        const e = L[i], m = e.message || {};
        if (e.type === 'assistant') for (const c of m.content || []) if (c && c.type === 'tool_use') { names[c.id] = c.name; mine.add(c.name); calls++; perMsg[m.id] = (perMsg[m.id] || 0) + 1; }
        if (i === 0) continue;
        const gap = new Date(e.timestamp) - new Date(L[i - 1].timestamp); if (gap < 0 || gap > GAP_CAP) continue;
        let k = 'other';
        if (e.type === 'assistant') k = 'model';
        else if (e.type === 'user' && Array.isArray(m.content)) { const tr = m.content.find(c => c && c.type === 'tool_result'); if (tr) k = 'tool:' + (names[tr.tool_use_id] || '?'); }
        time[k] = (time[k] || 0) + gap;
      }
      const ids = new Set(L.filter(e => e.type === 'assistant').map(e => e.message.id)); turns += ids.size;
      turnsOneCall += Object.values(perMsg).filter(n => n === 1).length;
      for (const n of mine) used[n] = (used[n] || 0) + 1;
    }
  }
}
const tot = Object.values(time).reduce((a, b) => a + b, 0);
console.log(`agents ${agents} | turns ${turns} | tool calls ${calls} | turns with exactly 1 tool call: ${(100 * turnsOneCall / turns).toFixed(0)}% | turns with no tool call: ${(100 * (turns - Object.keys({}).length) / turns - 0).toFixed(0) === '' ? '' : ''}`);
console.log(`\nwhere wall-clock went (${(tot / 3.6e6).toFixed(0)} agent-hours):`);
for (const [k, v] of Object.entries(time).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log('  ', k.padEnd(40), (100 * v / tot).toFixed(1) + '%', (v / 3.6e6).toFixed(1) + 'h');
console.log('\nshare of agents that ever called each tool:');
const watch = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'ToolSearch', 'StructuredOutput', 'PowerShell', 'Artifact', 'SendUserFile', 'Skill', 'SuggestSkills', 'mcp__visualize__show_widget', 'mcp__ccd_session__spawn_task', 'Agent'];
for (const n of watch) console.log('  ', n.padEnd(34), ((100 * (used[n] || 0)) / agents).toFixed(1) + '%');
const browser = Object.entries(used).filter(([k]) => /Claude_Browser|claude-in-chrome|chrome-mcp/.test(k)).reduce((a, [, v]) => Math.max(a, v), 0);
console.log('   any browser tool (max over tools)'.padEnd(37), ((100 * browser) / agents).toFixed(1) + '%');
