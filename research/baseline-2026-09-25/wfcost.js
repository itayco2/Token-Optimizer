const fs = require('fs'), path = require('path');
const d = process.argv[2];
const files = fs.readdirSync(d).filter(f => /^agent-.*\.jsonl$/.test(f));
const rows = [];
for (const f of files) {
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(d, f.replace('.jsonl', '.meta.json')), 'utf8')); } catch {}
  let ctx = 0, cr = 0, out = 0, turns = 0, trc = 0, maxctx = 0; const tools = {}, seen = new Set(), ts = [], models = new Set();
  for (const line of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.timestamp) ts.push(e.timestamp);
    const m = e.message || {};
    if (e.type === 'assistant') {
      if (!seen.has(m.id)) { seen.add(m.id); turns++; const u = m.usage || {};
        const c = (u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);
        ctx += c; cr += u.cache_read_input_tokens||0; out += u.output_tokens||0; maxctx = Math.max(maxctx, c); }
      if (m.model) models.add(m.model);
      for (const c of m.content || []) if (c && c.type === 'tool_use') tools[c.name] = (tools[c.name]||0)+1;
    }
    if (e.type === 'user' && Array.isArray(m.content)) for (const c of m.content) if (c && c.type === 'tool_result') trc += JSON.stringify(c.content||'').length;
  }
  const dur = ts.length > 1 ? ((new Date(ts[ts.length-1]) - new Date(ts[0])) / 60000).toFixed(1) : '';
  rows.push({ label: meta.description || f, phase: meta.workflowPhase || '', dur, turns, ctx, cr, out, maxctx, trc, tools, models: [...models].join(',') });
}
rows.sort((a,b) => a.phase.localeCompare(b.phase));
const fmt = n => n.toLocaleString('en-US');
console.log('label'.padEnd(28), 'min'.padStart(5), 'turns'.padStart(5), 'ctx_in_total'.padStart(12), 'peak_ctx'.padStart(9), 'out'.padStart(8), 'toolres_chars'.padStart(13), ' tools');
const T = { turns:0, ctx:0, out:0, trc:0 };
for (const r of rows) {
  const top = Object.entries(r.tools).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k}:${v}`).join(' ');
  console.log(r.label.slice(0,28).padEnd(28), String(r.dur).padStart(5), String(r.turns).padStart(5), fmt(r.ctx).padStart(12), fmt(r.maxctx).padStart(9), fmt(r.out).padStart(8), fmt(r.trc).padStart(13), ' '+top, r.models);
  T.turns+=r.turns; T.ctx+=r.ctx; T.out+=r.out; T.trc+=r.trc;
}
console.log('TOTAL'.padEnd(28), ''.padStart(5), String(T.turns).padStart(5), fmt(T.ctx).padStart(12), ''.padStart(9), fmt(T.out).padStart(8), fmt(T.trc).padStart(13));
