import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { scrollToId } from '../lib/scroll.js';
import { OrbMark } from './Orb.jsx';
import { navigate } from '../lib/router.js';
import { api } from '../lib/api.js';
import { adminApi } from '../lib/adminApi.js';

const LINKS = [
  ['product', 'Product'],
  ['features', 'Features'],
  ['sectors', 'Sectors'],
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(null);
  const [glider, setGlider] = useState({ left: 0, width: 0 });
  const linksRef = useRef(null);
  // Already logged in: offer the way back in (company workspace first, then the admin dashboard).
  const back = api.hasToken() ? { path: '/app', label: 'Open workspace' } : adminApi.hasToken() ? { path: '/admin', label: 'Open admin' } : null;

  // Shrink and darken the bar once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 40);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  // Highlight the link for the section in the middle of the screen.
  useEffect(() => {
    const sections = LINKS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => io.observe(s));
    const clearAtTop = () => { if (scrollY < innerHeight * 0.5) setActive(null); };
    addEventListener('scroll', clearAtTop, { passive: true });
    return () => { io.disconnect(); removeEventListener('scroll', clearAtTop); };
  }, []);

  useLayoutEffect(() => {
    const move = () => {
      const el = linksRef.current?.querySelector(`[data-id="${active}"]`);
      if (el) setGlider({ left: el.offsetLeft, width: el.offsetWidth });
    };
    move();
    addEventListener('resize', move);
    return () => removeEventListener('resize', move);
  }, [active]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    scrollToId(id);
  };
  const to = (path) => (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav className={`nav${scrolled ? ' scrolled' : ''}`} aria-label="Main">
        <a className="logo" href="#top" onClick={go('top')}><OrbMark />MIRA</a>
        <div className="links" ref={linksRef}>
          <span className={`glider${active ? ' show' : ''}`} style={{ left: glider.left, width: glider.width }} aria-hidden="true" />
          {LINKS.map(([id, label]) => (
            <a key={id} data-id={id} className={`lk${active === id ? ' on' : ''}`} href={`#${id}`} onClick={go(id)}
              aria-current={active === id ? 'true' : undefined}>{label}</a>
          ))}
        </div>
        <div className="right">
          {back ? (
            <a className="start" href={back.path} onClick={to(back.path)}>{back.label} <span>→</span></a>
          ) : (
            <>
              <a className="nav-login" href="/login" onClick={to('/login')}>Log in</a>
              <a className="start" href="/signup" onClick={to('/signup')}>Sign up <span>→</span></a>
            </>
          )}
          <button className="menu-b" onClick={() => setOpen(true)} aria-label="Open menu"><span /></button>
        </div>
      </nav>
      {open && (
        <div className="mmenu">
          <button className="x" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
          <span />
          {LINKS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
          {back ? <a href={back.path} onClick={to(back.path)}>{back.label}</a> : (
            <>
              <a href="/signup" onClick={to('/signup')}>Sign up</a>
              <a href="/login" onClick={to('/login')}>Log in</a>
            </>
          )}
        </div>
      )}
    </>
  );
}
