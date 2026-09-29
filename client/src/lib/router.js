import { useEffect, useState } from 'react';

// Three pages: "/" (showcase), "/login", "/app" (+ "/app/history", "/app/insights").
export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new Event('mira:navigate'));
  scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener('popstate', update);
    addEventListener('mira:navigate', update);
    return () => {
      removeEventListener('popstate', update);
      removeEventListener('mira:navigate', update);
    };
  }, []);
  return path;
}
