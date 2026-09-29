import { useEffect, useState } from 'react';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Workspace from './pages/Workspace.jsx';
import Admin from './pages/Admin.jsx';
import { OrbMark, orbSnapshot } from './components/Orb.jsx';
import { usePath } from './lib/router.js';

export default function App() {
  const path = usePath();
  // The logo intro plays once: shown, then fading, then removed so its orb stops rendering.
  const [intro, setIntro] = useState('show');

  useEffect(() => {
    const fade = setTimeout(() => setIntro('fading'), 900);
    const gone = setTimeout(() => setIntro('gone'), 1600);
    return () => { clearTimeout(fade); clearTimeout(gone); };
  }, []);

  // The browser tab icon is a still frame of the orb.
  useEffect(() => {
    const url = orbSnapshot(64);
    if (!url) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  }, []);

  const section = path.startsWith('/admin') ? 'admin'
    : path.startsWith('/app') ? 'app' : path === '/login' ? 'login' : path === '/signup' ? 'signup' : 'landing';

  return (
    <>
      {intro !== 'gone' && (
        <div className={`loader${intro === 'fading' ? ' done' : ''}`} aria-hidden="true"><div className="lm"><OrbMark className="lg" />MIRA</div></div>
      )}
      <div className="page-in" key={section}>
        {section === 'admin' && <Admin />}
        {section === 'app' && <Workspace path={path} />}
        {section === 'login' && <Login />}
        {section === 'signup' && <Signup />}
        {section === 'landing' && <Landing />}
      </div>
    </>
  );
}
