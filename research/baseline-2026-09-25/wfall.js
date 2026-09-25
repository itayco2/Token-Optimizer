// Scan every finished workflow run on disk; per run: agents, turns, tokens, fixed-prefix share,
// cross-agent duplicate reads (same file/URL read by 2+ agents), models, longest agent.
const fs = require('fs'), path = require('path');
const ROOT = 'C:/Users/itay7/.claude/projects';
const runs = [];
for (const proj of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, proj); if (!fs.statSync(p).isDirectory()) continue;
  for (const sess of fs.readdirSync(p)) {
    const wd = path.join(p, sess, 'subagents', 'workflows'); if (!fs.existsSync(wd)) continue;
    for (const wf of fs.readdirSync(wd)) runs.push({ proj, dir: path.join(wd, wf), id: wf });
  }
}
const keyOf = (name, input) => {
  if (!input) return null;
  if (name === 'Read') return 'file:' + String(input.file_path || '').toLowerCase().split(String.fromCharCode(92)).join('/');
  if (name === 'WebFetch') return 'url:' + String(input.url || '').replace(/[#?].*$/, '').replace(/\/$/, '');
  if (name === 'Grep') return 'grep:' + input.pattern + '@' + (input.path || '');
  if (name === 'Glob') return 'glob:' + input.pattern + '@' + (input.path || '');
  return null;
};
const out = [];
for (const r of runs) {
  const files = fs.readdirSync(r.dir).filter(f => /^agent-.*\.jsonl$/.test(f)); if (!files.length) continue;
  let turns = 0, ctx = 0, cr = 0, cw = 0, outT = 0, fixed = 0, trc = 0, maxMin = 0; const models = {}, reads = {}, kinds = {};
  let label0 = '';
  for (const f of files) {
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(r.dir, f.replace('.jsonl', '.meta.json')), 'utf8')); } catch {}
    const k = (meta.description || '').split(':')[0]; kinds[k] = (kinds[k] || 0) + 1;
    const seen = new Set(), ts = []; let first = null; const mine = new Set();
    for (const line of fs.readFileSync(path.join(r.dir, f), 'utf8').split('\n')) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.timestamp) ts.push(e.timestamp);
      const m = e.message || {};
      if (e.type === 'assistant') {
        if (!seen.has(m.id)) { seen.add(m.id); turns++; const u = m.usage || {};
          const c = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          ctx += c; cr += u.cache_read_input_tokens || 0; cw += u.cache_creation_input_tokens || 0; outT += u.output_tokens || 0;
          if (first === null) first = c; fixed += first; }
        if (m.model) models[m.model] = (models[m.model] || 0) + 1;
        for (const c of m.content || []) if (c && c.type === 'tool_use') { const key = keyOf(c.name, c.input); if (key) mine.add(key); }
      }
      if (e.type === 'user' && Array.isArray(m.content)) for (const c of m.content) if (c && c.type === 'tool_result') trc += JSON.stringify(c.content || '').length;
    }
    for (const key of mine) reads[key] = (reads[key] || 0) + 1;
    if (ts.length > 1) maxMin = Math.max(maxMin, (new Date(ts[ts.length - 1]) - new Date(ts[0])) / 60000);
  }
  const keys = Object.keys(reads); const dupKeys = keys.filter(k => reads[k] > 1);
  const totalReads = Object.values(reads).reduce((a, b) => a + b, 0); const dupReads = dupKeys.reduce((a, k) => a + reads[k] - 1, 0);
  const w = { cr: 0.1 * cr, cw: 1.25 * cw, out: 5 * outT }; const wt = w.cr + w.cw + w.out + (ctx - cr - cw);
  out.push({ run: r.proj.replace(/^C--Users-itay7-Desktop-/, '').slice(0, 22) + '/' + r.id.slice(3, 11), agents: files.length, turns, ctxM: ctx / 1e6, outK: outT / 1e3,
    fixedPct: 100 * fixed / Math.max(ctx, 1), crCostPct: 100 * w.cr / Math.max(wt, 1), dupPct: totalReads ? 100 * dupReads / totalReads : 0, maxMin,
    opus: Math.round(100 * Object.entries(models).filter(([m]) => /opus/.test(m)).reduce((a, [, v]) => a + v, 0) / Math.max(1, Object.values(models).reduce((a, b) => a + b, 0))),
    kinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + 'x' + v).join(' ') });
}
out.sort((a, b) => b.ctxM - a.ctxM);
console.log('run'.padEnd(32), 'ag'.padStart(3), 'turns'.padStart(6), 'readM'.padStart(7), 'outK'.padStart(6), 'fixed%'.padStart(7), 'reread$%'.padStart(9), 'dupRd%'.padStart(7), 'maxMin'.padStart(7), 'opus%'.padStart(6), ' stages');
for (const o of out) console.log(o.run.padEnd(32), String(o.agents).padStart(3), String(o.turns).padStart(6), o.ctxM.toFixed(1).padStart(7), o.outK.toFixed(0).padStart(6), o.fixedPct.toFixed(0).padStart(7), o.crCostPct.toFixed(0).padStart(9), o.dupPct.toFixed(0).padStart(7), o.maxMin.toFixed(0).padStart(7), String(o.opus).padStart(6), ' ' + o.kinds);
const T = out.reduce((a, o) => ({ agents: a.agents + o.agents, turns: a.turns + o.turns, ctx: a.ctx + o.ctxM, out: a.out + o.outK }), { agents: 0, turns: 0, ctx: 0, out: 0 });
console.log(`\nRUNS ${out.length} | agents ${T.agents} | turns ${T.turns} | read ${T.ctx.toFixed(0)}M tokens | written ${T.out.toFixed(0)}k tokens (${(100 * T.out / 1e3 / T.ctx).toFixed(3)}% of read)`);
// aggregates, weighted by tokens read
const sum = (f) => out.reduce((a, o) => a + f(o), 0);
const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log('fixed prefix share of all tokens read (weighted):', (100 * sum(o => o.fixedPct / 100 * o.ctxM) / sum(o => o.ctxM)).toFixed(1) + '%', '| median per run:', med(out.map(o => o.fixedPct)).toFixed(0) + '%');
console.log('re-read share of price-weighted cost, median per run:', med(out.map(o => o.crCostPct)).toFixed(0) + '%');
console.log('cross-agent duplicate reads, median per run:', med(out.map(o => o.dupPct)).toFixed(0) + '% | runs with >=30%:', out.filter(o => o.dupPct >= 30).length, 'of', out.length);
console.log('runs >=95% on Opus:', out.filter(o => o.opus >= 95).length, 'of', out.length);
