const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Hides below-the-fold `.rv` elements and fades them in as they scroll into view. */
export function setupReveal() {
  if (reduce || !('IntersectionObserver' in window)) return () => {};
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.remove('pre');
        io.unobserve(e.target);
      }
    }),
    // Start revealing slightly before an element scrolls into view, so fast scrolling never shows blank space.
    { rootMargin: '0px 0px 15% 0px' }
  );
  document.querySelectorAll('.rv').forEach((el) => {
    if (el.getBoundingClientRect().top > innerHeight * 0.92) {
      el.classList.add('pre');
      io.observe(el);
    }
  });
  return () => io.disconnect();
}
