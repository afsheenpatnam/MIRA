import { useLayoutEffect, useRef } from 'react';

/**
 * Animates height when its content grows or shrinks, then returns to natural height,
 * so content is never clipped. Overflow is hidden only while the animation runs.
 */
export default function Smooth({ children, className = '' }) {
  const outer = useRef(null);
  const inner = useRef(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    let last = content.offsetHeight;
    let timer;

    const ro = new ResizeObserver(() => {
      const next = content.offsetHeight;
      if (next === last) return;
      const from = box.getBoundingClientRect().height || last;
      last = next;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      clearTimeout(timer);
      box.classList.add('animating');
      box.style.height = `${from}px`;
      box.getBoundingClientRect(); // commit the starting height before animating
      box.style.height = `${next}px`;
      timer = setTimeout(() => {
        box.style.height = '';
        box.classList.remove('animating');
      }, 520);
    });
    ro.observe(content);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  return (
    <div ref={outer} className={`smooth ${className}`}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
