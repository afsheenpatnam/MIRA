import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/adminApi.js';

const when = (d) => {
  const t = new Date(d);
  const today = new Date().toDateString() === t.toDateString();
  const clock = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return today ? `Today, ${clock}` : `${t.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${clock}`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const SECTOR = { fintech: 'Fintech', ecommerce: 'E-commerce', edtech: 'EdTech' };
const MATCH = { known: 'Seen before', partial: 'Similar incidents', new: 'New issue', followup: 'Follow-up question' };

/** Plain-language title for a log entry. */
function title(b) {
  const failed = b.outcome !== 'ok';
  switch (b.action) {
    case 'ledger.created': return 'Audit log started';
    case 'company.created': return 'Company signed up';
    case 'user.login': return failed ? 'Failed company login' : 'Company user logged in';
    case 'user.added': return b.detail.reset ? 'Teammate password reset' : 'Teammate added';
    case 'admin.login': return failed ? 'Failed admin login' : 'Admin logged in';
    case 'admin.created': return b.detail.reset ? 'Admin password reset' : 'Admin account created';
    case 'data.imported': return 'History imported';
    case 'mira.answered': return 'MIRA answered a question';
    case 'feedback.saved': return b.detail.outcome === 'worked' ? 'Fix marked as worked' : "Fix marked as didn't work";
    case 'ingest.key.created': return 'Webhook key created';
    case 'alert.received': return 'Monitoring alert received';
    case 'alert.rejected': return 'Alert rejected: invalid key';
    case 'admin.company.viewed': return 'Admin opened company details';
    case 'admin.company.deleted': return 'Company deleted';
    case 'admin.mira.asked': return 'Admin asked MIRA';
    case 'admin.audit.exported': return 'Audit log exported';
    default: return b.action;
  }
}

/** The small facts stored with the entry, in words. */
function facts(b) {
  const d = b.detail || {};
  switch (b.action) {
    case 'company.created': return SECTOR[d.sector] || d.sector || '';
    case 'user.added': return [b.target, d.role].filter(Boolean).join(' · ');
    case 'admin.created': return b.target;
    case 'data.imported': return [plural(d.files || 0, 'file'), plural(d.incidents || 0, 'incident'), d.hidden ? `${d.hidden} private values hidden` : '', d.failed ? `${d.failed} failed` : ''].filter(Boolean).join(' · ');
    case 'mira.answered': return MATCH[d.match] || '';
    case 'ingest.key.created': return d.hint ? `Key ending ${d.hint}` : '';
    case 'alert.rejected': return d.key ? `Key ${d.key}` : '';
    case 'alert.received': return MATCH[d.match] || '';
    case 'admin.company.deleted': return `${plural(d.users || 0, 'user')} · data removed`;
    default: return '';
  }
}

function who(b) {
  const a = b.actor || {};
  if (a.kind === 'anonymous') return `Unknown person · tried ${a.email || 'an unknown email'}`;
  if (a.kind === 'user' || a.kind === 'admin') return a.email ? `${a.name} (${a.email})` : a.name;
  return a.name || 'System';
}

const ICONS = {
  access: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  data: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  admin: <><path d="M12 3 5 6v5c0 4.4 3 8.4 7 9.9 4-1.5 7-5.5 7-9.9V6l-7-3z" /><path d="m9 12 2 2 4-4" /></>,
  system: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};
const TABS = [['all', 'All'], ['access', 'Sign-ins'], ['data', 'Activity'], ['admin', 'Admin'], ['failed', 'Failed']];

/** Who did what, and when. Newest first. */
export default function AuditLog({ toast }) {
  const [tab, setTab] = useState('all');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async (before) => {
    const data = await adminApi.audit(tab === 'failed' ? { problems: true, before } : { category: tab, before });
    setList((prev) => (before != null && prev ? { ...data, blocks: [...prev.blocks, ...data.blocks] } : data));
  }, [tab]);

  useEffect(() => {
    setList(null);
    setError('');
    load().catch((e) => setError(e.message));
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list?.blocks || []).filter((b) => !s || [title(b), facts(b), who(b), b.company?.name]
      .some((v) => v?.toLowerCase().includes(s)));
  }, [list, q]);

  return (
    <div className="pane-pad">
      <div className="hist-bar au-bar">
        <div className="tabs2" role="tablist" aria-label="Filter logs">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <input className="search2" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, companies or actions…" aria-label="Search the audit logs" />
        <span className="au-lock" title="Each entry is linked to the one before it, so entries can't be secretly changed or deleted.">🔒 Tamper-proof</span>
      </div>

      {error ? <div className="ans-err">{error}</div> : !list ? (
        <><div className="skeleton short" /><div className="skeleton short" /><div className="skeleton short" /></>
      ) : shown.length === 0 ? (
        <div className="empty2"><b>Nothing here</b><p>{q ? 'Nothing matches that search.' : tab === 'failed' ? 'No failed or denied actions. That is good news.' : 'Entries appear as people sign in and use MIRA.'}</p></div>
      ) : (
        <ol className="au-list">
          {shown.map((b, i) => (
            <li key={b.index} className={`au-item${b.outcome !== 'ok' ? ' bad' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 0.025}s` }}>
              <div className="au-row">
                <span className={`au-ic ${b.category}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[b.category]}</svg></span>
                <span className="au-t">
                  <b>{title(b)}</b>
                  <small>{[who(b), b.company?.name, facts(b)].filter(Boolean).join(' · ')}</small>
                </span>
                {b.outcome !== 'ok' && <span className="au-out">{b.outcome}</span>}
                <time dateTime={new Date(b.at).toISOString()}>{when(b.at)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
      {list?.more && !q && (
        <button className="a-btn au-older" disabled={loadingMore}
          onClick={async () => { setLoadingMore(true); try { await load(list.blocks[list.blocks.length - 1].index); } catch (e) { toast(e.message); } setLoadingMore(false); }}>
          {loadingMore ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}
