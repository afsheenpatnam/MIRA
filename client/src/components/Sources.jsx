import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

const ACCEPT = '.csv,.pdf,.docx,.txt,.md,.log';
const MAX_BYTES = 8 * 1024 * 1024;
const CSV_TEMPLATE = 'id,title,service,category,alert,root cause,failed fixes,fix,resolved by,minutes,date\n'
  + 'INC-1001,"Checkout slow at peak",checkout-api,Connection pool exhaustion,"p99 latency 6s","DB pool too small for peak traffic","Restarting pods; Adding app servers","Raised pool size from 20 to 60",Your Name,18,2026-08-01\n';
const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    r.readAsDataURL(file);
  });
}

export default function Sources({ workspace, toast, onImported }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Each queued item: { key, name, size, file?, text?, status: 'queued'|'working'|'done'|'error', incidents, masked, error }
  const [queue, setQueue] = useState([]);
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    api.sources().then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const addFiles = (list) => {
    const picked = [...list];
    const bad = picked.filter((f) => !ACCEPT.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)) || f.size > MAX_BYTES);
    if (bad.length) toast(`${bad.map((f) => f.name).join(', ')}: use CSV, PDF, Word, TXT or Markdown under 8 MB.`);
    const good = picked.filter((f) => !bad.includes(f)).map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, size: f.size, file: f, status: 'queued' }));
    setQueue((cur) => {
      const kept = cur.filter((q) => q.status !== 'done');
      const keys = new Set(kept.map((q) => q.key));
      return [...kept, ...good.filter((g) => !keys.has(g.key))].slice(0, 30);
    });
  };

  const set = (key, changes) => setQueue((cur) => cur.map((q) => (q.key === key ? { ...q, ...changes } : q)));

  // Files are imported one at a time so each shows its own progress.
  const runImport = async () => {
    const items = [...queue.filter((q) => q.status === 'queued' || q.status === 'error')];
    if (text.trim()) items.push({ key: `text-${Date.now()}`, name: 'Pasted post-mortem', text, status: 'queued' });
    if (importing || !items.length) return;
    if (text.trim()) { setQueue((cur) => [...cur, items[items.length - 1]]); setText(''); }
    setImporting(true);
    let added = 0;
    for (const item of items) {
      set(item.key, { status: 'working', error: '' });
      try {
        const payload = item.text ? { text: item.text } : { files: [{ name: item.name, data: await readBase64(item.file) }] };
        const res = await api.importData(payload);
        const r = res.results[0];
        if (r.error) set(item.key, { status: 'error', error: r.error });
        else { set(item.key, { status: 'done', incidents: r.incidents, masked: r.masked }); added += r.incidents; }
      } catch (e) {
        set(item.key, { status: 'error', error: e.message });
      }
    }
    setImporting(false);
    load();
    onImported();
    if (added) toast(`${added} incident${added === 1 ? '' : 's'} added. MIRA is ready to answer from them.`);
  };

  if (error) return <div className="pane-pad"><div className="ans-err">{error}</div></div>;

  const done = queue.filter((q) => q.status === 'done');
  const pending = queue.filter((q) => q.status === 'queued' || q.status === 'error').length + (text.trim() ? 1 : 0);
  const position = queue.findIndex((q) => q.status === 'working');
  const progress = queue.length ? Math.round((queue.filter((q) => q.status === 'done' || q.status === 'error').length / queue.length) * 100) : 0;
  const files = data ? data.recent.filter((s) => s.kind !== 'alert').length : null;

  return (
    <div className="pane-pad">
      <div className="src-summary">
        <div><b>{data ? data.imported : '–'}</b><span>incidents learned</span></div>
        <div><b>{files ?? '–'}</b><span>files imported</span></div>
      </div>

      <div className="src-single">
        <section className="src-card">
          <header>
            <span className="src-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg></span>
            <div><h3>Import incident history</h3><p>Ticket exports and post-mortems. MIRA answers from these.</p></div>
          </header>

          <div
            className={`drop2${drag ? ' over' : ''}`}
            onClick={() => !importing && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (!importing) addFiles(e.dataTransfer.files); }}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          >
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <b>Drop files here or click to choose</b>
            <span>CSV (Jira, ServiceNow, PagerDuty exports) · PDF · Word · TXT · Markdown · several at once</span>
          </div>

          {queue.length > 0 && (
            <>
              {importing && (
                <div className="prog3" aria-label={`Importing file ${position + 1} of ${queue.length}`}>
                  <div className="prog3-top"><span>Importing {position + 1} of {queue.length}</span><span>{progress}%</span></div>
                  <div className="prog3-bar"><i style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              <ul className="files2">
                {queue.map((q) => (
                  <li key={q.key} className={q.status}>
                    <span className="ext">{q.text ? 'text' : q.name.split('.').pop()}</span>
                    <span className="nm">
                      {q.name}
                      {q.status === 'done' && <small className="ok"> · {q.incidents} incident{q.incidents === 1 ? '' : 's'} added{q.masked ? ` · ${q.masked} private value${q.masked === 1 ? '' : 's'} hidden` : ''}</small>}
                      {q.status === 'error' && <small className="err"> · {q.error}</small>}
                    </span>
                    {q.status === 'working' && <span className="spin sm" aria-label="Importing" />}
                    {q.status === 'done' && <span className="tick" aria-label="Imported">✓</span>}
                    {q.status === 'queued' && <small>{q.size ? kb(q.size) : ''}</small>}
                    {(q.status === 'queued' || q.status === 'error') && !importing && (
                      <button type="button" onClick={() => setQueue((cur) => cur.filter((x) => x.key !== q.key))} aria-label={`Remove ${q.name}`}>✕</button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="paste2">
            <label htmlFor="pm">Or paste a post-mortem</label>
            <textarea id="pm" rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={importing} placeholder="Paste an incident report, war-room notes or a post-mortem…" />
          </div>

          <div className="src-acts">
            <a className="a-btn" href={templateHref} download="mira-incidents-template.csv">CSV template</a>
            <span className="grow" />
            {done.length > 0 && !importing && <button type="button" className="a-btn" onClick={() => navigate('/app')}>Ask MIRA →</button>}
            <button type="button" className="a-btn primary" onClick={runImport} disabled={importing || !pending}>
              {importing ? 'Importing…' : pending > 1 ? `Import ${pending} items` : 'Import'}
            </button>
          </div>
        </section>
      </div>

      <section className="src-card act2">
        <header><div><h3>Recent imports</h3><p>Files and notes added to {workspace.name}'s history</p></div></header>
        {!data ? <div className="skeleton short" /> : files === 0 ? (
          <p className="hint2">Nothing yet. Import your first file above.</p>
        ) : (
          <ul className="feed2">
            {data.recent.filter((s) => s.kind !== 'alert').map((s) => (
              <li key={s.id}>
                <span className={`k ${s.kind}`}>{s.kind === 'csv' ? 'CSV' : s.kind === 'document' ? 'Doc' : 'Text'}</span>
                <div>
                  <b>{s.name}</b>
                  <small>{`${s.incidents} incident${s.incidents === 1 ? '' : 's'} added${s.masked ? ` · ${s.masked} private values hidden` : ''}`}</small>
                </div>
                <time>{when(s.at)}{s.by ? ` · ${s.by}` : ''}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
