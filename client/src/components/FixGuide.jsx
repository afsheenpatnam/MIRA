import { useMemo, useRef } from 'react';

// Icons for each kind of step MIRA can suggest (24×24, stroke).
const ICONS = {
  database: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  config: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  restart: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  deploy: 'M12 3v12M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  rollback: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  network: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  cache: 'M13 2 4 14h7l-1 8 9-12h-7z',
  queue: 'M4 6h16M4 12h16M4 18h10',
  scale: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  security: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  monitor: 'M3 12h4l3-8 4 16 3-8h4',
  communicate: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  investigate: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
};

const W = 680;
const PAD = 22;

function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > max) { if (line) lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lays out the plan as an SVG drawing, so it can be shown inline and saved as an image. */
function layout(guide, heading, label) {
  let y = PAD;
  const parts = [];
  const font = "'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif";

  parts.push(`<text x="${PAD}" y="${y + 12}" font-family="${font}" font-size="11" font-weight="700" letter-spacing="2" fill="#ff8a3d">${esc(label)}</text>`);
  if (guide.eta) {
    const label = `≈ ${guide.eta}`;
    const w = label.length * 7 + 22;
    parts.push(`<rect x="${W - PAD - w}" y="${y - 2}" width="${w}" height="22" rx="11" fill="rgba(255,91,20,.14)"/><text x="${W - PAD - w / 2}" y="${y + 13}" text-anchor="middle" font-family="${font}" font-size="11.5" font-weight="600" fill="#ffb36b">${esc(label)}</text>`);
  }
  y += 30;
  if (heading) {
    for (const line of wrap(heading, 72)) {
      parts.push(`<text x="${PAD}" y="${y + 14}" font-family="${font}" font-size="15.5" font-weight="600" fill="#f4f2ef">${esc(line)}</text>`);
      y += 22;
    }
    y += 12;
  }

  const steps = guide.steps.map((s, i) => {
    const detail = wrap(s.detail, 64);
    const h = Math.max(64, 44 + detail.length * 18);
    const top = y;
    y += h + 14;
    return { ...s, i, top, h, detail };
  });

  // Connector drawn first so the step cards sit on top of it.
  if (steps.length > 1) {
    const x = PAD + 34;
    const y1 = steps[0].top + 32;
    const y2 = steps[steps.length - 1].top + 32;
    parts.push(`<line class="fg-line" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="rgba(255,138,61,.45)" stroke-width="2" stroke-dasharray="4 5" pathLength="100"/>`);
  }

  for (const s of steps) {
    const cx = PAD + 34;
    const cy = s.top + 32;
    parts.push(`<g class="fg-step" style="animation-delay:${0.12 + s.i * 0.14}s">`);
    parts.push(`<rect x="${PAD}" y="${s.top}" width="${W - PAD * 2}" height="${s.h}" rx="16" fill="#18181b" stroke="rgba(255,255,255,.08)"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="19" fill="url(#fgOrb)"/>`);
    parts.push(`<g transform="translate(${cx - 10} ${cy - 10}) scale(.84)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[s.kind] || ICONS.investigate}"/></g>`);
    parts.push(`<text x="${cx + 30}" y="${s.top + 27}" font-family="${font}" font-size="11" font-weight="700" fill="#ff8a3d">STEP ${s.i + 1}</text>`);
    parts.push(`<text x="${cx + 88}" y="${s.top + 27}" font-family="${font}" font-size="14.5" font-weight="600" fill="#f4f2ef">${esc(s.title)}</text>`);
    s.detail.forEach((line, k) => {
      parts.push(`<text x="${cx + 30}" y="${s.top + 49 + k * 18}" font-family="${font}" font-size="12.5" fill="#b9b2ab">${esc(line)}</text>`);
    });
    parts.push('</g>');
  }

  const box = (label, items, color, tint, stroke, delay) => {
    const lines = items.flatMap((t) => wrap(t, 78).map((l, k) => (k ? `   ${l}` : `• ${l}`)));
    const h = 40 + lines.length * 18;
    parts.push(`<g class="fg-step" style="animation-delay:${delay}s">`);
    parts.push(`<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${h}" rx="14" fill="${tint}" stroke="${stroke}"/>`);
    parts.push(`<text x="${PAD + 16}" y="${y + 24}" font-family="${font}" font-size="11" font-weight="700" letter-spacing="1.5" fill="${color}">${label}</text>`);
    lines.forEach((l, k) => parts.push(`<text x="${PAD + 16}" y="${y + 46 + k * 18}" font-family="${font}" font-size="12.5" fill="#e7e1db">${esc(l)}</text>`));
    parts.push('</g>');
    y += h + 12;
  };
  const after = 0.12 + steps.length * 0.14;
  if (guide.avoid?.length) box("✕  DON'T DO THIS · IT FAILED BEFORE", guide.avoid, '#ff8f8f', 'rgba(229,72,77,.08)', 'rgba(229,72,77,.3)', after);
  if (guide.verify) box('✓  CHECK IT IS FIXED', [guide.verify], '#6ee7a8', 'rgba(47,191,113,.08)', 'rgba(47,191,113,.3)', after + 0.1);

  const height = y + PAD - 12;
  const defs = '<defs><radialGradient id="fgOrb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd2ad"/><stop offset=".35" stop-color="#ff8a3d"/><stop offset=".75" stop-color="#ff5b14"/><stop offset="1" stop-color="#8a1e00"/></radialGradient></defs>';
  return {
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}">${defs}<rect width="${W}" height="${height}" rx="18" fill="#111113"/>${parts.join('')}</svg>`,
  };
}

/** A visual, step-by-step plan for fixing the incident, drawn from MIRA's answer. */
export default function FixGuide({ guide, heading, label = 'FIX PLAN', fileName = 'mira-fix-plan' }) {
  const { svg, height } = useMemo(() => layout(guide, heading, label), [guide, heading, label]);
  const busy = useRef(false);

  const download = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileName}.png`;
      a.click();
    } finally {
      busy.current = false;
    }
  };

  return (
    <figure className="fixguide">
      <div className="fg-art" role="img" aria-label={`Fix plan: ${guide.steps.map((s, i) => `step ${i + 1}, ${s.title}`).join('; ')}`}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption>
        <span>Generated from your past incidents</span>
        <button type="button" className="a-btn" onClick={download}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></svg>
          Save as image
        </button>
      </figcaption>
    </figure>
  );
}
