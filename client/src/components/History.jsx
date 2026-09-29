import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

const date = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const time = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function History({ onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('past');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.history()
      .then((d) => { setData(d); if (d.live.length) setTab('live'); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="pane-pad"><div className="ans-err">{error}</div></div>;
  if (!data) return <div className="pane-pad"><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /></div>;

  if (!data.live.length && !data.past.length) {
    return (
      <div className="pane-pad">
        <div className="empty2">
          <b>No incidents yet</b>
          <p>Import your incident history and it appears here, along with every question you ask MIRA.</p>
          <button className="a-btn primary" onClick={() => navigate('/app/sources')}>Import incident history</button>
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const past = q
    ? data.past.filter((i) => [i.code, i.title, i.service, i.category, i.rootCause, i.finalFix, i.resolvedBy].some((v) => v?.toLowerCase().includes(q)))
    : data.past;

  return (
    <div className="pane-pad">
      <div className="hist-bar">
        <div className="tabs2" role="tablist">
          <button role="tab" aria-selected={tab === 'live'} onClick={() => setTab('live')}>Conversations <span>{data.live.length}</span></button>
          <button role="tab" aria-selected={tab === 'past'} onClick={() => setTab('past')}>Past incidents <span>{data.past.length}</span></button>
        </div>
        {tab === 'past' && (
          <input className="search2" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incidents, services, people…" aria-label="Search past incidents" />
        )}
      </div>

      {tab === 'live' && (data.live.length === 0 ? (
        <div className="empty2">
          <b>No conversations yet</b>
          <p>Outages you ask MIRA about appear here. Click one to reopen it and carry on where you left off.</p>
        </div>
      ) : (
        <div className="list2" key="live">
          {data.live.map((i, k) => (
            <button key={i.id} type="button" className="row2 convo" style={{ animationDelay: `${Math.min(k, 8) * 0.04}s` }}
              onClick={() => onOpen(i.id)} aria-label={`Continue the conversation: ${i.alert}`}>
              <div className="row2-top">
                <span className={`out ${i.outcome || 'open'}`}>{i.outcome === 'worked' ? 'Fix worked' : i.outcome === 'failed' ? 'Fix failed' : 'No feedback yet'}</span>
                {i.messages > 1 && <span className="count2">{i.messages} questions</span>}
                <time>{time(i.lastAt || i.at)}</time>
                <span className="by">{i.askedBy}</span>
              </div>
              <p className="alert2">{i.alert}</p>
              <p className="brief2">{i.brief}</p>
              <span className="open2">Continue conversation <b>→</b></span>
            </button>
          ))}
        </div>
      ))}

      {tab === 'past' && (
        <div className="list2" key="past">
          {past.length === 0 && <p className="hint2">No incidents match "{query}".</p>}
          {past.map((i, k) => (
            <article key={i.id} className="row2" style={{ animationDelay: `${Math.min(k, 8) * 0.04}s` }}>
              <div className="row2-top">
                {i.code && <span className="code2">{i.code}</span>}
                {i.service && <span className="svc2">{i.service}</span>}
                {i.category && <span className="cat2">{i.category}</span>}
                <time>{date(i.at)}</time>
              </div>
              <h3>{i.title}</h3>
              <dl className="fix2">
                {i.rootCause && <div><dt>Root cause</dt><dd>{i.rootCause}</dd></div>}
                {i.failedFixes?.length > 0 && <div><dt className="bad">Failed</dt><dd>{i.failedFixes.join('; ')}</dd></div>}
                {i.finalFix && <div><dt className="good">Worked</dt><dd>{i.finalFix}</dd></div>}
              </dl>
              {(i.resolvedBy || i.minutes) && (
                <p className="res2">
                  {i.resolvedBy && <>Resolved by <b>{i.resolvedBy}</b></>}
                  {i.minutes ? <> in <b>{i.minutes} min</b></> : null}
                  {i.origin && <span className="from2"> · from {i.origin}</span>}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
