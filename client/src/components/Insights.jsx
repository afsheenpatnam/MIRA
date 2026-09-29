import { useCallback, useEffect, useState } from 'react';
import Orb from './Orb.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { splitSentences } from '../lib/voice.js';

export default function Insights({ workspace, speaker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(-1);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api.insights()
      .then((d) => setData({ ...d, sentences: splitSentences(d.lessons || 'I have not found a pattern yet.') }))
      .catch((e) => setError(e));
  }, []);
  useEffect(() => {
    if (workspace.incidents > 0) load();
  }, [load, workspace.incidents]);

  const readAloud = () => {
    if (!data || speaker.cast) return;
    speaker.speakSentences('MIRA · what I have learned', data.sentences, setReading);
  };

  if (!workspace.incidents || error?.status === 409) {
    return (
      <div className="pane-pad">
        <div className="empty2">
          <b>Nothing to learn from yet</b>
          <p>Import your incident history and MIRA will show your most common root causes, risky services and fixes that keep failing.</p>
          <button className="a-btn primary" onClick={() => navigate('/app/sources')}>Import incident history</button>
        </div>
      </div>
    );
  }
  if (error) return <div className="pane-pad"><div className="ans-err">{error.message}</div><button className="a-btn" style={{ marginTop: 12 }} onClick={load}>Try again</button></div>;
  if (!data) {
    return (
      <div className="pane-pad">
        <div className="ins-wait">
          <div className="ins-wait-orb">{!speaker.cast && <Orb />}</div>
          <p>MIRA is looking for patterns in {workspace.incidents} incidents…</p>
        </div>
      </div>
    );
  }

  const maxCause = Math.max(1, ...data.causes.map((c) => c.count));
  const maxRisk = Math.max(1, ...data.risky.map((r) => r.count));
  const decided = data.feedback.worked + data.feedback.failed;

  return (
    <div className="pane-pad">
      <section className="ins-hero">
        <div className="ins-hero-top">
          <span className="ins-tag">What MIRA has learned</span>
          <div className="row">
            <button className="a-btn" onClick={load}>Refresh</button>
            <button className="a-btn primary" onClick={readAloud} disabled={Boolean(speaker.cast)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>Read aloud
            </button>
          </div>
        </div>
        <p className="ins-lessons">
          {data.sentences.map((s, i) => <span key={i} className={i === reading ? 'now' : undefined}>{s} </span>)}
        </p>
      </section>

      <div className="ins-grid">
        <section className="ins-card wide">
          <h3>Most common root causes</h3>
          <p>Past incidents per cause</p>
          <div className="bars2">
            {data.causes.map((c) => (
              <div key={c.label} className="bar2">
                <span>{c.label}</span>
                <span className="track"><i style={{ width: `${(c.count / maxCause) * 100}%` }} /></span>
                <b>{c.count}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="ins-card">
          <h3>Riskiest services</h3>
          <p>Where incidents keep coming back</p>
          <ol className="risk2">
            {data.risky.map((r) => (
              <li key={r.service}>
                <code>{r.service}</code>
                <span className="rbar"><i style={{ width: `${(r.count / maxRisk) * 100}%` }} /></span>
                <span>{r.count}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="ins-card">
          <h3>Fixes confirmed</h3>
          <p>Feedback from your team in the Console</p>
          <div className="fb2">
            <div><b className="good">{data.feedback.worked}</b><span>worked</span></div>
            <div><b className="bad">{data.feedback.failed}</b><span>failed</span></div>
            <div><b>{decided ? `${Math.round((data.feedback.worked / decided) * 100)}%` : '–'}</b><span>success rate</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
