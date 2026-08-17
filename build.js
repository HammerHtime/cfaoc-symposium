#!/usr/bin/env node
/**
 * CFAOC static site builder — zero dependencies, Node 18+.
 *
 *   node build.js            build into ./dist
 *   node build.js --serve    build, then serve ./dist on http://localhost:8080
 *
 * Everything the site says lives in events.json. This file only turns it into HTML.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_STATIC = path.join(ROOT, 'static');
const OUT = path.join(ROOT, 'dist');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'events.json'), 'utf8'));
const SITE = data.site;
const C = data.content;
const EVENTS = data.events;

const BASE = SITE.baseUrl.replace(/\/+$/, '');

/* ---------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attr = (s) => esc(s);

/** "2026-11-24" -> Date at noon UTC (avoids any timezone slippage in formatting) */
const dateOf = (iso) => (iso ? new Date(`${iso}T12:00:00Z`) : null);

const fmtLong = (iso) => {
  const d = dateOf(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
};

const fmtShort = (iso) => {
  const d = dateOf(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
};

const fmtDayMonth = (iso) => {
  const d = dateOf(iso);
  if (!d) return '';
  return {
    month: d.toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' }).toUpperCase().replace('.', ''),
    day: String(d.getUTCDate()),
    year: String(d.getUTCFullYear()),
  };
};

/** 24h "08:00" -> "8:00 a.m." */
const fmtTime = (t) => {
  if (!t) return '';
  const [hRaw, m] = t.split(':').map(Number);
  const suffix = hRaw < 12 ? 'a.m.' : 'p.m.';
  const h = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
};

const isLive = (ev) => ev.status !== 'tba' && !!ev.slug;
const hasRegistration = (ev) => !!(ev.registerUrl && ev.registerUrl.trim());

const eventTitle = (ev) => `${SITE.name} — ${ev.city || ev.regionLabel}`;
const eventPath = (ev) => (isLive(ev) ? `/${ev.slug}/` : '/');
const eventUrl = (ev) => `${BASE}${eventPath(ev)}`;

const startISO = (ev) => (ev.date ? `${ev.date}T${ev.startTime || '08:00'}:00${ev.utcOffset || '-05:00'}` : '');
const endISO = (ev) => (ev.date ? `${ev.date}T${ev.endTime || '16:30'}:00${ev.utcOffset || '-05:00'}` : '');

const venueLine = (v) =>
  [v.street, v.city, [v.region, v.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');

const mapsUrl = (v) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [v.name, v.street, v.city, v.region].filter(Boolean).join(', ')
  )}`;

/** Section numbers run in document order, so they stay right whatever a page includes. */
let secNo = 0;
const resetSections = () => { secNo = 0; };
const num = () => String(++secNo).padStart(2, '0');

/** Photos an operator dropped into static/assets/hotel/<slug>/, in filename order. */
function hotelPhotos(slug) {
  const dir = path.join(SRC_STATIC, 'assets', 'hotel', slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f))
    .sort()
    .map((f) => ({ file: f, src: `/assets/hotel/${slug}/${f}` }));
}

/** Detect an operator-supplied hero image dropped into static/assets/. */
function heroArtwork() {
  const dir = path.join(SRC_STATIC, 'assets');
  if (!fs.existsSync(dir)) return null;
  const hit = fs
    .readdirSync(dir)
    .find((f) => /^hero-artwork\.(png|jpg|jpeg|webp|avif|svg)$/i.test(f));
  return hit ? `/assets/${hit}` : null;
}
const HERO_ART = heroArtwork();

/**
 * Intrinsic pixel size of a static asset. Used to reserve layout space for the
 * hero artwork and to declare the social card's dimensions — both of which
 * matter and neither of which anyone will remember to update by hand.
 * Reads the file header directly: PNG, JPEG, GIF, WebP. SVG has no raster size.
 */
function imageSize(webPath) {
  if (!webPath) return null;
  const file = path.join(SRC_STATIC, webPath.replace(/^\//, ''));
  if (!fs.existsSync(file)) return null;
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') {
    return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    if (b.toString('ascii', 12, 16) === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    return null; // lossy/lossless WebP headers vary; not worth decoding here
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
      }
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  return null;
}
const HERO_ART_SIZE = imageSize(HERO_ART);

/** The social card. Falls back to the hero artwork, then to nothing at all. */
const OG_IMAGE = ['/assets/og-default.png', HERO_ART].find(
  (p) => p && fs.existsSync(path.join(SRC_STATIC, p.replace(/^\//, '')))
) || null;
const OG_SIZE = imageSize(OG_IMAGE);

/* ------------------------------------------------- the fingerprint device */

/** Deterministic PRNG so every build emits byte-identical SVG. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 1 decimal place — keeps the emitted path data small and diffable. */
const n1 = (v) => (Math.round(v * 10) / 10).toString();

/** Catmull-Rom through a list of points, emitted as cubic beziers. */
function smoothPath(pts, closed) {
  const n = pts.length;
  const at = (k) => (closed ? pts[(k + n) % n] : pts[Math.min(Math.max(k, 0), n - 1)]);
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${n1(c1x)} ${n1(c1y)} ${n1(c2x)} ${n1(c2y)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

const chordLength = (pts, closed) => {
  let total = 0;
  for (let k = 0; k < (closed ? pts.length : pts.length - 1); k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
};

/**
 * The ridge whorl from the event artwork: broken concentric ridges winding out
 * from an off-centre core. The rings are not circles — a fixed harmonic profile
 * deforms them the way friction ridges deform, and a "land" term flattens the
 * south edge and lifts the two northern lobes so the outer rings loosely carry
 * the silhouette of the country. Seeded throughout: same seed, same bytes.
 */
function fingerprint({ rings = 40, seed = 20261124, id = 'fp' } = {}) {
  const rand = lcg(seed);
  const CX = 282;              // core sits up and left of the box centre
  const CY = 262;
  const parts = [];

  // Angles are SVG-style (y grows downward), so sin(a) > 0 is the ring's south.
  // The land term scales with the ring (it shapes the silhouette); the ridge
  // flow is in flat pixels so ridge-to-ridge spacing stays even and the lines
  // never cross each other the way a plain multiplier would make them.
  const land = (a, t) => {
    const south = Math.max(0, Math.sin(a));
    const north = Math.max(0, -Math.sin(a));
    const west = Math.max(0, -Math.cos(a));
    const shape = -0.26 * Math.pow(south, 1.6) + 0.15 * north * Math.abs(Math.cos(a)) - 0.07 * west * west;
    return 1 + shape * Math.min(1, 0.35 + t * 1.4);
  };
  const flow = (a, phase) =>
    0.55 * Math.sin(a * 2 + phase) + 0.3 * Math.sin(a * 3 - phase * 0.6) + 0.15 * Math.sin(a * 5 + phase * 1.4);

  /* --- the core: one continuous spiral, the way a whorl actually starts --- */
  const core = [];
  for (let k = 0; k <= 44; k++) {
    const a = 1.15 + k * 0.4;
    const rr = 2.5 + k * 0.66;
    core.push([CX + Math.cos(a) * rr * 1.06, CY + Math.sin(a) * rr * 0.93]);
  }
  parts.push(
    `<path d="${smoothPath(core, false)}" stroke-width="1.7" opacity=".92"/>`
  );

  /* --- the ridges --- */
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const base = 34 + i * 5.2 + Math.pow(i, 1.4) * 0.34;
    const phase = 0.55 + i * 0.29;
    const drift = Math.pow(t, 1.3);
    const ox = CX + drift * 44 + Math.sin(i * 0.4) * t * 9;
    const oy = CY + drift * 50 + Math.cos(i * 0.33) * t * 7;

    const spin = rand() * 0.7;
    const steps = i < 8 ? 12 : i < 20 ? 16 : 20;
    const pts = [];
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2 + spin;
      const rr = base * land(a, t) + (4 + t * 11) * flow(a, phase) + (rand() - 0.5) * 2.4;
      pts.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.92]);
    }

    // Broken-ridge rhythm: long strokes inside, shorter and gappier outside.
    const per = chordLength(pts, true);
    const dash = [];
    let used = 0;
    while (used < per) {
      const on = per * (0.09 + rand() * 0.2) * (1 - t * 0.42);
      const off = per * (0.012 + rand() * 0.03) * (0.7 + t * 1.9);
      dash.push(n1(on), n1(off));
      used += on + off;
    }

    parts.push(
      `<path d="${smoothPath(pts, true)}" stroke-width="${(1.6 + t * 3).toFixed(1)}" ` +
        `stroke-dasharray="${dash.join(' ')}" stroke-dashoffset="${n1(rand() * per)}" ` +
        `opacity="${(1 - t * 0.5).toFixed(2)}"/>`
    );
  }

  return `<svg class="whorl" viewBox="0 0 600 600" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${id}-ink" cx="47%" cy="43%" r="64%">
      <stop offset="0%" stop-color="#ff5c60"/>
      <stop offset="38%" stop-color="#e5262e"/>
      <stop offset="100%" stop-color="#660e12"/>
    </radialGradient>
    <radialGradient id="${id}-vig" cx="47%" cy="43%" r="57%">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="62%" stop-color="#fff" stop-opacity=".9"/>
      <stop offset="88%" stop-color="#fff" stop-opacity=".42"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="${id}-mask">
      <rect width="600" height="600" fill="url(#${id}-vig)"/>
    </mask>
  </defs>
  <g fill="none" stroke="url(#${id}-ink)" stroke-linecap="round" mask="url(#${id}-mask)">
${parts.map((p) => '    ' + p).join('\n')}
  </g>
</svg>`;
}

/* ------------------------------------------------------------- components */

function head({ title, description, canonical, jsonld, ogImage, noindex }) {
  const img = ogImage || (OG_IMAGE ? `${BASE}${OG_IMAGE}` : '');
  /* A square card is centre-cropped by the large-image players; declaring the
     real dimensions is what stops them guessing wrong. */
  const imgMeta = !img
    ? ''
    : `<meta property="og:image" content="${attr(img)}">
<meta property="og:image:alt" content="${attr(`${SITE.name} — ${SITE.tagline}`)}">${
        OG_SIZE && !ogImage
          ? `\n<meta property="og:image:width" content="${OG_SIZE.w}">
<meta property="og:image:height" content="${OG_SIZE.h}">`
          : ''
      }`;
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(SITE.name)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonical)}">
${imgMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1b070a">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/styles.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
${SITE.googleAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(SITE.googleAnalyticsId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${attr(SITE.googleAnalyticsId)}');</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>`;
}

function navBar(links, cta) {
  return `<header class="masthead" data-masthead>
  <div class="wrap masthead__inner">
    <a class="brand" href="/">
      <span class="brand__mark" aria-hidden="true"></span>
      <span class="brand__text">
        <span class="brand__name">CFAOC</span>
        <span class="brand__sub">National Symposium</span>
      </span>
    </a>
    <button class="navtoggle" data-navtoggle aria-expanded="false" aria-controls="sitenav">
      <span class="navtoggle__bars" aria-hidden="true"></span>
      <span class="navtoggle__label">Menu</span>
    </button>
    <nav class="nav" id="sitenav" data-nav aria-label="Main">
      <ul class="nav__list">
        ${links.map((l) => `<li><a href="${attr(l.href)}">${esc(l.label)}</a></li>`).join('\n        ')}
      </ul>
      ${cta}
    </nav>
  </div>
</header>`;
}

/** Primary call to action. Falls back to a "coming soon" state when no URL is set. */
function registerButton(ev, { size = '', block = false } = {}) {
  const cls = `btn btn--primary${size ? ' btn--' + size : ''}${block ? ' btn--block' : ''}`;
  if (!hasRegistration(ev)) {
    return `<span class="${cls} btn--pending" role="note">Registration opening soon</span>`;
  }
  return `<a class="${cls}" href="${attr(ev.registerUrl)}" target="_blank" rel="noopener">
    ${esc(ev.registerLabel || 'Register — free')}
    <svg class="btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>`;
}

/* The head block is shrink-to-fit: the red rule below it is therefore always
   exactly as wide as the display type above, whatever face is loaded. */
function titleLockup(sub) {
  return `<div class="lockup">
  <div class="lockup__head">
    <p class="lockup__eyebrow">Canadian Forum Against</p>
    <h1 class="lockup__title"><span>Organized</span><span>Crime</span></h1>
    <p class="lockup__series">National Symposium</p>
    <hr class="lockup__rule">
  </div>
  <p class="lockup__tagline">${esc(SITE.tagline)}</p>
  ${sub || ''}
</div>`;
}

/** Bottom-left scroll cue, aligned to the same gutter as the lockup. */
function scrollCue() {
  return `<div class="hero__foot" aria-hidden="true">
    <div class="wrap"><p class="hero__scroll">Scroll<i></i></p></div>
  </div>`;
}

/* The vector whorl behind the hero. When artwork is supplied it carries the
   motif on small screens only — the artwork itself has a whorl of its own and
   the two must never appear together. */
function heroMedia() {
  return `<div class="hero__media">${fingerprint({ id: 'hero' })}</div>`;
}

/**
 * The left half of the hero.
 *
 * With no artwork on disk: the HTML lockup, set live.
 * With artwork: the supplied graphic IS the lockup — it already contains the
 * full title, rule and tagline — so it is shown at full strength and the HTML
 * lockup is clipped away for screen readers and crawlers only. The image is
 * silent (alt="") so the title is announced exactly once, by the <h1>. Below
 * the artwork's legible size the swap reverses: image out, live lockup back.
 */
function heroLead(sub) {
  const lockup = titleLockup(sub);
  if (!HERO_ART) return lockup;
  const size = HERO_ART_SIZE || { w: 1452, h: 830 };
  return `<div class="hero__lead" style="--hero-art:url('${attr(HERO_ART)}')">
    <img class="hero__art" src="${attr(HERO_ART)}" alt="" width="${size.w}" height="${size.h}"
      fetchpriority="high" decoding="async">
    ${lockup}
  </div>`;
}

function factsStrip(ev) {
  const items = [];
  if (ev.date) {
    items.push(['Date', fmtLong(ev.date)]);
    items.push(['Time', `${fmtTime(ev.startTime)} – ${fmtTime(ev.endTime)} ${ev.timezoneLabel || ''}`.trim()]);
  } else {
    items.push(['Date', 'To be announced']);
  }
  items.push(['Location', ev.city ? `${ev.city}, ${ev.province}` : `${ev.regionLabel} — city to be announced`]);
  items.push(['Cost', `${ev.cost || 'Free'} to attend`]);
  return `<ul class="facts">
    ${items.map(([k, v]) => `<li><span class="facts__k">${esc(k)}</span><span class="facts__v">${esc(v)}</span></li>`).join('\n    ')}
  </ul>`;
}

function aboutSection() {
  return `<section class="section" id="about">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — The Forum</p>
        <h2 class="h2">${esc(C.aboutHeading)}</h2>
      </div>
      <div class="cols__main">
        <p class="lead">${esc(C.aboutLead)}</p>
        ${C.aboutBody.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>`;
}

function themesSection() {
  return `<section class="section section--alt" id="themes">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Content</p>
        <h2 class="h2">${esc(C.themesHeading)}</h2>
        <p class="muted">${esc(C.themesIntro)}</p>
      </div>
      <div class="cols__main">
        <ul class="themes">
          ${C.themes
            .map(
              (t, i) => `<li class="theme" data-reveal>
            <span class="theme__num">${String(i + 1).padStart(2, '0')}</span>
            <h3 class="theme__title">${esc(t.title)}</h3>
            <p class="theme__body">${esc(t.body)}</p>
          </li>`
            )
            .join('\n          ')}
        </ul>
      </div>
    </div>
  </div>
</section>`;
}

function audienceSection() {
  return `<section class="section" id="who">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Delegates</p>
        <h2 class="h2">${esc(C.audienceHeading)}</h2>
        <p class="muted">${esc(C.audienceIntro)}</p>
      </div>
      <div class="cols__main">
        <ul class="ticks">
          ${C.audience.map((a) => `<li>${esc(a)}</li>`).join('\n          ')}
        </ul>
      </div>
    </div>
  </div>
</section>`;
}

function agendaSection() {
  return `<section class="section section--alt" id="programme">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — The day</p>
        <h2 class="h2">${esc(C.agendaHeading)}</h2>
        <p class="muted">${esc(C.agendaNote)}</p>
      </div>
      <div class="cols__main">
        ${
          C.agenda && C.agenda.length
            ? `<ol class="agenda">
          ${C.agenda
            .map(
              (s) => `<li class="agenda__row">
            <span class="agenda__time">${esc(s.time ? fmtTime(s.time) : 'TBD')}</span>
            <span class="agenda__body">
              <span class="agenda__title">${esc(s.title)}</span>
              ${s.detail ? `<span class="agenda__detail">${esc(s.detail)}</span>` : ''}
            </span>
          </li>`
            )
            .join('\n          ')}
        </ol>`
            /* No sessions confirmed yet: say so plainly rather than show a
               table of placeholder rows that reads as a real schedule. */
            : `<div class="tbd">
          <p class="tbd__mark">TBD</p>
          <div class="tbd__body">
            <h3 class="tbd__title">${esc(C.agendaEmptyTitle || 'Programme to be announced')}</h3>
            ${(C.agendaEmptyBody || []).map((t) => `<p>${esc(t)}</p>`).join('\n            ')}
          </div>
        </div>`
        }
      </div>
    </div>
  </div>
</section>`;
}

function speakersSection() {
  return `<section class="section" id="speakers">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Presenters</p>
        <h2 class="h2">${esc(C.speakersHeading || 'Speakers')}</h2>
      </div>
      <div class="cols__main">
        <div class="panel">
          ${(C.speakersBody || []).map((t, i) =>
            i === 0
              ? `<p class="lead" style="margin-top:0">${esc(t)}</p>`
              : `<p>${esc(t)}</p>`
          ).join('\n          ')}
          ${C.speakersContact
            ? `<p class="muted">${esc(C.speakersContact)} <a href="mailto:${attr(SITE.contactEmail)}">${esc(SITE.contactEmail)}</a></p>`
            : ''}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function venueSection(ev) {
  const v = ev.venue;
  if (!v || !v.name) return '';
  return `<section class="section section--alt" id="venue">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Getting there</p>
        <h2 class="h2">Venue</h2>
      </div>
      <div class="cols__main">
        <div class="venue">
          <h3 class="venue__name">${esc(v.name)}</h3>
          <address class="venue__addr">${esc(venueLine(v))}</address>
          ${v.notes ? `<p>${esc(v.notes)}</p>` : ''}
          <p class="venue__links">
            <a class="btn btn--ghost" href="${attr(mapsUrl(v))}" target="_blank" rel="noopener">Open in Maps</a>
            ${v.website ? `<a class="btn btn--ghost" href="${attr(v.website)}" target="_blank" rel="noopener">Hotel website</a>` : ''}
            ${ev.date ? `<a class="btn btn--ghost" href="/${attr(ev.slug)}/${attr(ev.slug)}.ics" download>Add to calendar</a>` : ''}
          </p>
          ${ev.hotel && ev.hotel.rate ? `<p class="venue__hotel">Staying over? A delegate room block is held here at <strong>${esc(ev.hotel.rate)} ${esc(ev.hotel.rateUnit || 'per night')}</strong> — <a href="#hotel">see the hotel section</a>.</p>` : ''}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function hotelSection(ev) {
  const h = ev.hotel;
  if (!h || !h.name) return '';

  const photos = hotelPhotos(ev.slug);
  const caps = h.captions || {};
  // The gallery is laid out for however many photos actually exist — and the
  // section is composed so that it still reads as finished with none at all.
  const gallery = photos.length
    ? `<figure class="gallery gallery--n${Math.min(photos.length, 6)}" role="group" aria-label="Photos of ${attr(h.name)}">
          ${photos
            .map(
              (p, i) => `<button class="gallery__item${i === 0 ? ' gallery__item--lead' : ''}" type="button"
            data-lightbox data-src="${attr(p.src)}" data-caption="${attr(caps[p.file] || h.name)}">
            <img src="${attr(p.src)}" alt="${attr(caps[p.file] || h.name)}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
            ${caps[p.file] ? `<span class="gallery__cap">${esc(caps[p.file])}</span>` : ''}
          </button>`
            )
            .join('\n          ')}
          ${h.photoCredit ? `<figcaption class="gallery__credit">${esc(h.photoCredit)}</figcaption>` : ''}
        </figure>`
    : '';

  return `<section class="section section--alt" id="hotel">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Staying over</p>
        <h2 class="h2">The hotel</h2>
        <p class="muted">Delegate room block at the Forum venue.</p>
      </div>
      <div class="cols__main">
        <div class="rate">
          <div class="rate__price">
            <span class="rate__amount">${esc(h.rate)}</span>
            <span class="rate__unit">${esc(h.rateUnit || 'per night')}</span>
          </div>
          <div class="rate__body">
            <h3 class="rate__name">${esc(h.name)}</h3>
            ${h.intro ? `<p>${esc(h.intro)}</p>` : ''}
            ${h.bookingUrl ? `<p><a class="btn btn--primary" href="${attr(h.bookingUrl)}" target="_blank" rel="noopener">${esc(h.bookingLabel || 'Book your room')}<svg class="btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></p>` : ''}
            ${h.rateNote ? `<p class="rate__note">${esc(h.rateNote)}</p>` : ''}
          </div>
        </div>
        ${
          h.highlights && h.highlights.length
            ? `<div class="hotelfeat">
          <ul class="ticks ticks--tight">
          ${h.highlights.map((x) => `<li>${esc(x)}</li>`).join('\n          ')}
          </ul>
        </div>`
            : ''
        }
        ${gallery}
      </div>
    </div>
  </div>
</section>`;
}

/* Netlify picks this form up at deploy time from the rendered HTML: the
   data-netlify attribute enables capture, the hidden form-name field makes the
   POST match, and bot-field is a honeypot the real form hides. Submissions
   land in the Netlify dashboard — no backend, no third party. */
function hostSection() {
  return `<section class="section section--alt" id="host">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Future cities</p>
        <h2 class="h2">${esc(C.hostHeading)}</h2>
        <p class="muted">${esc(C.hostIntro)}</p>
      </div>
      <div class="cols__main">
        <form class="form" name="host-request" method="POST" action="/thanks/"
              data-netlify="true" netlify-honeypot="bot-field">
          <input type="hidden" name="form-name" value="host-request">
          <p class="form__hp" hidden>
            <label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label>
          </p>

          <div class="form__row">
            <div class="field">
              <label for="f-name">Your name</label>
              <input id="f-name" name="name" type="text" autocomplete="name" required>
            </div>
            <div class="field">
              <label for="f-email">Email</label>
              <input id="f-email" name="email" type="email" autocomplete="email" required>
            </div>
          </div>

          <div class="form__row">
            <div class="field">
              <label for="f-agency">Agency or organization</label>
              <input id="f-agency" name="agency" type="text" autocomplete="organization" required>
            </div>
            <div class="field">
              <label for="f-city">City and province</label>
              <input id="f-city" name="city" type="text" required>
            </div>
          </div>

          <div class="field">
            <label for="f-why">Why should the Forum come to your city?</label>
            <textarea id="f-why" name="why" rows="5" required></textarea>
          </div>

          <p class="form__note">${esc(C.hostNote)}</p>
          <button class="btn btn--primary" type="submit">${esc(C.hostButton)}</button>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

function citiesSection(current) {
  const cards = EVENTS.map((ev) => {
    const live = isLive(ev);
    const dm = ev.date ? fmtDayMonth(ev.date) : null;
    const isCurrent = current && ev.slug && ev.slug === current.slug;
    return `<article class="city${live ? '' : ' city--tba'}${isCurrent ? ' city--current' : ''}" data-reveal>
      <p class="city__region">${esc(ev.regionLabel)}</p>
      <h3 class="city__name">${esc(ev.city || 'City to be announced')}${ev.province ? `<span class="city__prov">${esc(ev.province)}</span>` : ''}</h3>
      ${
        dm
          ? `<p class="city__date"><span class="city__mon">${esc(dm.month)}</span> <span class="city__day">${esc(dm.day)}</span> <span class="city__yr">${esc(dm.year)}</span></p>`
          : `<p class="city__date city__date--tba">Dates to be announced</p>`
      }
      <p class="city__blurb">${esc(ev.blurb)}</p>
      ${ev.venue && ev.venue.name ? `<p class="city__venue">${esc(ev.venue.name)}</p>` : ''}
      <p class="city__actions">
        ${live ? `<a class="btn btn--ghost" href="${attr(eventPath(ev))}">Event details</a>` : ''}
        ${live ? registerButton(ev, { size: 'sm' }) : `<span class="tag">Announcement soon</span>`}
      </p>
    </article>`;
  }).join('\n    ');

  return `<section class="section section--paper" id="cities">
  <div class="wrap">
    <div class="section__head">
      <p class="kicker kicker--dark">Coast to coast</p>
      <h2 class="h2">Three cities. One national problem.</h2>
      <p class="muted muted--dark">The Forum runs as a series of free one-day events across the country. Each is registered separately.</p>
    </div>
    <div class="cities">
    ${cards}
    </div>
  </div>
</section>`;
}

function faqSection() {
  return `<section class="section" id="faq">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${num()} — Practicalities</p>
        <h2 class="h2">${esc(C.faqHeading)}</h2>
      </div>
      <div class="cols__main">
        <div class="faq">
          ${C.faq
            .map(
              (f) => `<details class="faq__item">
            <summary>${esc(f.q)}</summary>
            <div class="faq__a"><p>${esc(f.a)}</p></div>
          </details>`
            )
            .join('\n          ')}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function ctaSection(ev) {
  return `<section class="cta" id="register">
  <div class="wrap cta__inner">
    <div>
      <h2 class="h2 cta__title">${esc(C.ctaHeading)}</h2>
      <p class="cta__body">${esc(C.ctaBody)}</p>
      ${ev && ev.registerNote && hasRegistration(ev) ? `<p class="cta__note">${esc(ev.registerNote)}</p>` : ''}
    </div>
    <div class="cta__action">
      ${ev ? registerButton(ev, { size: 'lg' }) : `<a class="btn btn--primary btn--lg" href="/#cities">Choose your city</a>`}
      ${ev && ev.date ? `<p class="cta__meta">${esc(fmtLong(ev.date))} · ${esc(ev.city ? ev.city + ', ' + ev.province : ev.regionLabel)}</p>` : ''}
    </div>
  </div>
</section>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `<footer class="foot">
  <div class="wrap foot__inner">
    <div class="foot__brand">
      <p class="foot__name">Canadian Forum Against Organized Crime</p>
      <p class="foot__tag">${esc(SITE.tagline)}</p>
    </div>
    <div class="foot__col">
      <p class="foot__h">Series</p>
      <ul>
        ${EVENTS.map((ev) =>
          isLive(ev)
            ? `<li><a href="${attr(eventPath(ev))}">${esc(ev.city)}, ${esc(ev.province)}</a></li>`
            : `<li><span class="muted">${esc(ev.regionLabel)} — TBA</span></li>`
        ).join('\n        ')}
      </ul>
    </div>
    <div class="foot__col">
      <p class="foot__h">Contact</p>
      <ul>
        <li><a href="mailto:${attr(SITE.contactEmail)}">${esc(SITE.contactEmail)}</a></li>
        ${SITE.organizerUrl ? `<li><a href="${attr(SITE.organizerUrl)}" target="_blank" rel="noopener">${esc(SITE.organizerName)}</a></li>` : ''}
        <li><a href="/#faq">Questions</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap foot__legal">
    <p>© ${year} ${esc(SITE.organizerName)}. Hosted as a non-profit training and education event.</p>
  </div>
</footer>
<div class="lightbox" data-lightbox-overlay role="dialog" aria-modal="true" aria-label="Photo viewer" hidden>
  <button class="lightbox__close" type="button" data-lightbox-close aria-label="Close photo">&times;</button>
  <button class="lightbox__nav lightbox__nav--prev" type="button" data-lightbox-prev aria-label="Previous photo" hidden>&#8592;</button>
  <button class="lightbox__nav lightbox__nav--next" type="button" data-lightbox-next aria-label="Next photo" hidden>&#8594;</button>
  <figure class="lightbox__fig">
    <img alt="" data-lightbox-img>
    <figcaption data-lightbox-cap></figcaption>
  </figure>
</div>
<script src="/main.js" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ pages */

function hubPage() {
  resetSections();
  const featured = EVENTS.find((e) => isLive(e)) || EVENTS[0];
  const nav = [
    { href: '#about', label: 'About' },
    { href: '#cities', label: 'Cities' },
    { href: '#host', label: 'Host it' },
    { href: '#themes', label: 'Topics' },
    { href: '#programme', label: 'Programme' },
    { href: '#venue', label: 'Venue' },
    { href: '#hotel', label: 'Hotel' },
    { href: '#faq', label: 'FAQ' },
  ];

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': EVENTS.filter(isLive).map((ev) => eventJsonLd(ev)),
  };

  const dm = featured.date ? fmtDayMonth(featured.date) : null;

  return (
    head({
      title: `${SITE.name} — ${SITE.tagline}`,
      description: SITE.description,
      canonical: `${BASE}/`,
      jsonld,
    }) +
    navBar(nav, `<a class="btn btn--primary btn--sm nav__cta" href="#cities">Register</a>`) +
    `<main id="main">
<section class="hero${HERO_ART ? ' hero--art' : ''}">
  ${heroMedia()}
  <div class="wrap hero__inner">
    ${heroLead(`<p class="lockup__meta">A free one-day symposium series · Three cities · ${dm ? esc(dm.year) : '2026'}</p>`)}
    <div class="hero__next">
      <p class="hero__nextlabel">Next event</p>
      <p class="hero__nextcity">${esc(featured.city || featured.regionLabel)}${featured.province ? `, ${esc(featured.province)}` : ''}</p>
      <p class="hero__nextdate">${esc(featured.date ? fmtLong(featured.date) : 'Date to be announced')}</p>
      ${featured.venue && featured.venue.name ? `<p class="hero__nextvenue">${esc(featured.venue.name)}</p>` : ''}
      <div class="hero__actions">
        ${registerButton(featured)}
        ${isLive(featured) ? `<a class="btn btn--ghost" href="${attr(eventPath(featured))}">Event details</a>` : ''}
      </div>
      ${featured.date ? countdown(featured) : ''}
    </div>
  </div>
  ${scrollCue()}
</section>
${factsBand(featured)}
${aboutSection()}
${citiesSection(null)}
${hostSection()}
${themesSection()}
${audienceSection()}
${agendaSection()}
${speakersSection()}
${isLive(featured) ? venueSection(featured) : ''}
${isLive(featured) ? hotelSection(featured) : ''}
${faqSection()}
${ctaSection(isLive(featured) ? featured : null)}
</main>` +
    footer()
  );
}

function eventPage(ev) {
  resetSections();
  const nav = [
    { href: '/', label: 'Series' },
    { href: '#about', label: 'About' },
    { href: '#themes', label: 'Topics' },
    { href: '#programme', label: 'Programme' },
    { href: '#venue', label: 'Venue' },
    { href: '#hotel', label: 'Hotel' },
    { href: '#faq', label: 'FAQ' },
  ];

  const desc = `${SITE.name}: a free one-day symposium in ${ev.city}, ${ev.province} on ${fmtLong(ev.date)} at ${ev.venue.name}. ${SITE.tagline}.`;

  return (
    head({
      title: `${ev.city}, ${ev.province} · ${fmtShort(ev.date)} — ${SITE.name}`,
      description: desc,
      canonical: eventUrl(ev),
      jsonld: eventJsonLd(ev),
    }) +
    navBar(nav, registerButton(ev, { size: 'sm' }).replace('btn--primary', 'btn--primary nav__cta')) +
    `<main id="main">
<section class="hero hero--event${HERO_ART ? ' hero--art' : ''}">
  ${heroMedia()}
  <div class="wrap hero__inner">
    ${heroLead(`<p class="lockup__meta">${esc(ev.city)}, ${esc(ev.provinceName || ev.province)} · ${esc(fmtLong(ev.date))}</p>`)}
    <div class="hero__next">
      <p class="hero__nextlabel">${esc(ev.regionLabel)} edition</p>
      <p class="hero__nextcity">${esc(ev.city)}, ${esc(ev.province)}</p>
      <p class="hero__nextdate">${esc(fmtLong(ev.date))} · ${esc(fmtTime(ev.startTime))} – ${esc(fmtTime(ev.endTime))} ${esc(ev.timezoneLabel || '')}</p>
      <p class="hero__nextvenue">${esc(ev.venue.name)}</p>
      <div class="hero__actions">
        ${registerButton(ev)}
        <a class="btn btn--ghost" href="#programme">See the programme</a>
      </div>
      ${countdown(ev)}
    </div>
  </div>
  ${scrollCue()}
</section>
${factsBand(ev)}
<section class="section" id="intro">
  <div class="wrap">
    <div class="cols">
      <div class="cols__side">
        <p class="kicker">${esc(ev.city)}</p>
        <h2 class="h2">The ${esc(ev.regionLabel)} edition</h2>
      </div>
      <div class="cols__main">
        <p class="lead">${esc(ev.blurb)}</p>
        <p>${esc(C.aboutLead)}</p>
        ${C.aboutBody.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>
${themesSection()}
${audienceSection()}
${agendaSection()}
${speakersSection()}
${venueSection(ev)}
${hotelSection(ev)}
${faqSection()}
${citiesSection(ev)}
${hostSection()}
${ctaSection(ev)}
</main>` +
    footer()
  );
}

function countdown(ev) {
  return `<div class="countdown" data-countdown="${attr(startISO(ev))}" role="group"
      aria-label="Time remaining until the ${attr(ev.city || ev.regionLabel)} Forum" hidden>
      <p class="countdown__unit"><span data-cd="days">–</span><small>days</small></p>
      <p class="countdown__unit"><span data-cd="hours">–</span><small>hrs</small></p>
      <p class="countdown__unit"><span data-cd="mins">–</span><small>min</small></p>
    </div>`;
}

function factsBand(ev) {
  return `<section class="band" aria-label="Event essentials">
  <div class="wrap">
    ${factsStrip(ev)}
  </div>
</section>`;
}

function eventJsonLd(ev) {
  const v = ev.venue;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: eventTitle(ev),
    description: `${SITE.tagline}. ${ev.blurb}`,
    startDate: startISO(ev),
    endDate: endISO(ev),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true,
    url: eventUrl(ev),
    location: {
      '@type': 'Place',
      name: v.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: v.street,
        addressLocality: v.city,
        addressRegion: v.region,
        postalCode: v.postalCode,
        addressCountry: 'CA',
      },
    },
    organizer: { '@type': 'Organization', name: SITE.organizerName, url: SITE.organizerUrl },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock',
      url: ev.registerUrl || eventUrl(ev),
    },
  };
}

/* -------------------------------------------------------------- ICS files */

const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function icsFor(ev) {
  const fold = (line) => line.match(/.{1,73}/g).join('\r\n ');
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ONGIA//CFAOC//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cfaoc-${ev.slug}-${ev.date}@ongia.ca`,
    `DTSTAMP:${icsStamp(startISO(ev))}`,
    `DTSTART:${icsStamp(startISO(ev))}`,
    `DTEND:${icsStamp(endISO(ev))}`,
    fold(`SUMMARY:${eventTitle(ev)}`),
    fold(`DESCRIPTION:${SITE.tagline}. Free to attend. Details: ${eventUrl(ev)}`),
    fold(`LOCATION:${[ev.venue.name, venueLine(ev.venue)].filter(Boolean).join(', ')}`),
    `URL:${eventUrl(ev)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return body.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ write */

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function write(rel, contents) {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
  console.log('  ·', rel, `(${(Buffer.byteLength(contents) / 1024).toFixed(1)} kB)`);
}

function notFoundPage() {
  return (
    (resetSections(), head({
      title: `Page not found — ${SITE.name}`,
      description: SITE.description,
      canonical: `${BASE}/404`,
    })) +
    navBar([{ href: '/', label: 'Home' }], `<a class="btn btn--primary btn--sm nav__cta" href="/#cities">Register</a>`) +
    `<main id="main">
<section class="hero hero--mini">
  <div class="hero__media">${fingerprint({ id: 'nf', rings: 34, seed: 404 })}</div>
  <div class="wrap hero__inner">
    <div class="lockup">
      <p class="lockup__eyebrow">404</p>
      <h1 class="lockup__title"><span>Page not</span><span>found</span></h1>
      <hr class="lockup__rule">
      <p class="lockup__tagline">That page has moved or never existed.</p>
      <p class="hero__actions"><a class="btn btn--primary" href="/">Back to the Forum</a></p>
    </div>
  </div>
</section>
</main>` +
    footer()
  );
}

function thanksPage() {
  return (
    (resetSections(), head({
      title: `${C.hostThanksTitle} — ${SITE.name}`,
      description: C.hostThanksTitle,
      canonical: `${BASE}/thanks/`,
      noindex: true,
    })) +
    navBar([{ href: '/', label: 'Home' }], `<a class="btn btn--primary btn--sm nav__cta" href="/#cities">Register</a>`) +
    `<main id="main">
<section class="hero hero--mini">
  <div class="hero__media">${fingerprint({ id: 'tx', rings: 34, seed: 77 })}</div>
  <div class="wrap hero__inner">
    <div class="lockup">
      <p class="lockup__eyebrow">Thank you</p>
      <h1 class="lockup__title"><span>Request</span><span>received</span></h1>
      <hr class="lockup__rule">
      ${(C.hostThanksBody || []).map((t) => `<p class="lockup__tagline">${esc(t)}</p>`).join('\n      ')}
      <p class="hero__actions"><a class="btn btn--primary" href="/">Back to the Forum</a></p>
    </div>
  </div>
</section>
</main>` +
    footer()
  );
}

function build() {
  console.log(`\nBuilding ${SITE.name}`);
  console.log(HERO_ART ? `  hero artwork: ${HERO_ART}` : '  hero artwork: none found — using the vector whorl');

  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });
  copyDir(SRC_STATIC, OUT);

  write('index.html', hubPage());

  const live = EVENTS.filter(isLive);
  for (const ev of live) {
    write(`${ev.slug}/index.html`, eventPage(ev));
    if (ev.date) write(`${ev.slug}/${ev.slug}.ics`, icsFor(ev));
  }

  write('404.html', notFoundPage());
  write('thanks/index.html', thanksPage());

  const urls = ['/', ...live.map(eventPath)];
  write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${BASE}${u}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>
`
  );

  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);

  console.log(`\nDone — ${live.length} event page(s) + hub in ./dist\n`);
}

build();

/* --------------------------------------------------------- optional serve */

if (process.argv.includes('--serve')) {
  const http = require('http');
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.ics': 'text/calendar', '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  };
  const port = 8080;
  http
    .createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      let file = path.join(OUT, rel);
      if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(OUT, '404.html');
      const code = file.endsWith('404.html') && rel !== '/404.html' ? 404 : 200;
      res.writeHead(code, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    })
    .listen(port, () => console.log(`Serving ./dist on http://localhost:${port}\n`));
}
