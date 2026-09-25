// What fills the first turn of each workflow agent? Components in chars (unescaped) vs first-turn tokens.
const fs = require('fs'), path = require('path');
const ROOT = 'C:/Users/itay7/.claude/projects';
const len = v => typeof v === 'string' ? v.length : Array.isArray(v) ? v.reduce((a, x) => a + len(x), 0) : v && typeof v === 'object' ? Object.values(v).reduce((a, x) => a + len(x), 0) : 0;
const attTypes = {}, fileSizes = {}, toolSizes = {}; const rows = [];
for (const proj of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, proj); if (!fs.statSync(p).isDirectory()) continue;
  for (const sess of fs.readdirSync(p)) {
    const wd = path.join(p, sess, 'subagents', 'workflows'); if (!fs.existsSync(wd)) continue;
    for (const wf of fs.readdirSync(wd)) for (const f of fs.readdirSync(path.join(wd, wf)).filter(f => /^agent-.*\.jsonl$/.test(f))) {
      const L = fs.readFileSync(path.join(wd, wf, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const firstA = L.find(e => e.type === 'assistant'); if (!firstA) continue;
      const u = firstA.message.usage || {}; const firstTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const before = L.slice(0, L.indexOf(firstA));
      const c = { sys: 0, tools: 0, nTools: 0, instr: 0, skills: 0, deferred: 0, prompt: 0, otherAtt: 0 };
      for (const e of L.filter(e => e.type === 'attachment' && e.attachment && e.attachment.type === 'prompt_snapshot')) { const a = e.attachment; if (a.tools) { c.tools = len(a.tools); c.nTools = a.tools.length; for (const tl of a.tools) { toolSizes[tl.name] = toolSizes[tl.name] || { n: 0, ch: 0 }; toolSizes[tl.name].n++; toolSizes[tl.name].ch += len(tl); } } c.sys = Math.max(c.sys, len(a.systemPrompt)); }
      const prompt = before.find(e => e.type === 'user'); c.prompt = prompt ? len(prompt.message.content) : 0;
      for (const e of before.filter(e => e.type === 'attachment')) {
        const a = e.attachment || {}; const t = a.type || '?';
        attTypes[t] = attTypes[t] || { n: 0, ch: 0 }; attTypes[t].n++; attTypes[t].ch += len(a);
        if (t === 'skill_listing') c.skills += len(a); else if (t === 'deferred_tools_delta') c.deferred += len(a); else if (t === 'prompt_snapshot') { if (false) { if (a.tools) { c.tools = len(a.tools); c.nTools = a.tools.length; for (const tl of a.tools) { toolSizes[tl.name] = toolSizes[tl.name] || { n: 0, ch: 0 }; toolSizes[tl.name].n++; toolSizes[tl.name].ch += len(tl); } } }
        }
        else if (t === 'instructions') { c.instr = len(a); for (const fl of a.files || []) { const k = String(fl.path).split(String.fromCharCode(92)).join('/').replace(/^.*\.claude\//, '~/.claude/'); fileSizes[k] = fileSizes[k] || { n: 0, ch: 0 }; fileSizes[k].n++; fileSizes[k].ch += len(fl.content); } }
        else c.otherAtt += len(a);
      }
      rows.push({ firstTok, ...c });
    }
  }
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const snap = rows.filter(r => r.tools > 0);
console.log('agents:', rows.length, '| with prompt snapshot:', snap.length);
const R = 3.6; // chars per token, rough
for (const k of ['firstTok', 'sys', 'tools', 'nTools', 'instr', 'skills', 'deferred', 'prompt', 'otherAtt']) {
  const v = med(snap.map(r => r[k])); console.log(k.padEnd(9), 'median', v, k === 'firstTok' || k === 'nTools' ? '' : `chars (~${Math.round(v / R / 1000)}k tokens)`);
}
const acc = snap.map(r => (r.sys + r.tools + r.instr + r.skills + r.deferred + r.prompt + r.otherAtt) / R); console.log('median accounted ~tokens:', Math.round(med(acc)), '| median unexplained:', Math.round(med(snap.map((r, i) => r.firstTok - acc[i]))));
console.log('\nattachment types before first turn:'); for (const [k, v] of Object.entries(attTypes).sort((a, b) => b[1].ch - a[1].ch).slice(0, 10)) console.log('  ', k.padEnd(24), 'n', v.n, 'avg chars', Math.round(v.ch / v.n));
console.log('\nlargest injected instruction files (avg chars):'); for (const [k, v] of Object.entries(fileSizes).sort((a, b) => b[1].ch / b[1].n - a[1].ch / a[1].n).slice(0, 14)) console.log('  ', k.slice(-60).padEnd(60), Math.round(v.ch / v.n), 'x', v.n);
console.log('\nlargest tool definitions (avg chars):'); for (const [k, v] of Object.entries(toolSizes).sort((a, b) => b[1].ch / b[1].n - a[1].ch / a[1].n).slice(0, 14)) console.log('  ', k.padEnd(40), Math.round(v.ch / v.n), 'in', v.n, 'agents');
