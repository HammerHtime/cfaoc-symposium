#!/usr/bin/env node
/**
 * Renders a 1200x630 link-preview image per event into static/assets/og/.
 *
 *   node scripts/make-og.js
 *
 * Run it after adding a city, changing a date, or adding a skyline photo, then
 * commit the PNGs. Deliberately NOT part of `node build.js`: it needs a real
 * browser, and making every deploy depend on one is a good way to break deploys.
 *
 * Needs Chrome or Chromium. Set CHROME=/path/to/chrome to point at a specific one.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static', 'assets', 'og');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'events.json'), 'utf8'));

const CANDIDATES = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!CHROME) {
  console.error('No Chrome/Chromium found. Set CHROME=/path/to/chrome and re-run.');
  process.exit(1);
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ogName = (ev) => ev.slug || slugify(ev.regionLabel) + (ev.sortDate ? '-' + ev.sortDate.slice(0, 4) : '');

const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
};

const whorl = (() => {
  const built = path.join(ROOT, 'dist', '404.html');
  if (!fs.existsSync(built)) {
    console.error('Run `node build.js` first — the whorl is taken from the built output.');
    process.exit(1);
  }
  const m = fs.readFileSync(built, 'utf8').match(/<svg class="whorl"[\s\S]*?<\/svg>/);
  return m ? m[0] : '';
})();

function page(ev) {
  const line1 = ev.date
    ? `${fmtDate(ev.date)} · ${fmtTime(ev.startTime)} – ${fmtTime(ev.endTime)}`
    : (ev.dateNote || 'Date to be announced');
  const city = ev.city ? `${ev.city}, ${ev.province}` : ev.regionLabel;
  const sub = ev.venue && ev.venue.name ? ev.venue.name : 'City and venue to be announced';
  const sky = ev.skylineImage
    ? `background:url('${ev.skylineImage}') center 38% / cover no-repeat;` +
      `filter:grayscale(1) contrast(1.15) brightness(1.05);mix-blend-mode:screen;opacity:.20;`
    : 'display:none;';

  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css">
<style>
html,body{margin:0;background:#120406}
.og{width:1200px;height:630px;position:relative;overflow:hidden;box-sizing:border-box;
    background:radial-gradient(115% 110% at 76% 34%,#3d1218 0%,#1e080b 50%,#120406 84%),#120406;
    padding:56px 60px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
.og__skyline{position:absolute;left:0;right:0;bottom:0;height:62%;${sky}
    -webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.85) 45%,transparent 100%);
    mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.85) 45%,transparent 100%)}
.og__whorl{position:absolute;top:50%;right:-150px;width:680px;height:680px;transform:translateY(-50%);opacity:.8}
.og__whorl svg{width:100%;height:100%}
.og__inner{position:relative;max-width:700px}
.og__title{font-family:var(--display);font-weight:700;font-size:40px;line-height:1.02;letter-spacing:.01em;
    text-transform:uppercase;color:#eae6e4;margin:0 0 2px;text-shadow:0 2px 14px rgba(0,0,0,.6)}
.og__city{font-family:var(--display);font-weight:700;font-size:92px;line-height:.94;letter-spacing:-.01em;
    text-transform:uppercase;color:#fff;margin:0;text-shadow:0 3px 20px rgba(0,0,0,.65)}
.og__rule{height:3px;border:0;background:linear-gradient(90deg,#c8191f 0%,#c8191f 58%,rgba(200,25,31,.1) 100%);
    margin:16px 0 14px;width:580px}
.og__meta{font-family:var(--display);font-weight:600;font-size:30px;letter-spacing:.02em;color:#fff;
    margin:0 0 6px;text-transform:uppercase;text-shadow:0 2px 14px rgba(0,0,0,.7)}
.og__sub{font-family:var(--body);font-size:21px;color:#cdc2c0;margin:0;text-shadow:0 2px 12px rgba(0,0,0,.7)}
.og__foot{display:flex;align-items:center;gap:18px;margin-top:24px}
.og__free{padding:11px 20px;background:#c8191f;color:#fff;font-family:var(--display);font-weight:600;
    font-size:22px;letter-spacing:.11em;text-transform:uppercase;line-height:1}
.og__url{font-family:var(--body);font-size:20px;color:#c0b4b2;text-shadow:0 2px 12px rgba(0,0,0,.7)}
</style>
<div class="og">
  <div class="og__skyline"></div>
  <div class="og__whorl">${whorl}</div>
  <div class="og__inner">
    <p class="og__title">${esc(data.site.name)}</p>
    <h1 class="og__city">${esc(city)}</h1>
    <hr class="og__rule">
    <p class="og__meta">${esc(line1)}</p>
    <p class="og__sub">${esc(sub)}</p>
    <div class="og__foot">
      <span class="og__free">Free to attend</span>
      <span class="og__url">${esc(data.site.baseUrl.replace(/^https?:\/\//, ''))}</span>
    </div>
  </div>
</div>`;
}

const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(OUT, { recursive: true });

let made = 0;
for (const ev of data.events) {
  const name = ogName(ev);
  const tmp = path.join(DIST, `_og_${name}.html`);
  fs.writeFileSync(tmp, page(ev));
  const dest = path.join(OUT, `${name}.png`);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1200,630',
    '--virtual-time-budget=8000', `--screenshot=${dest}`,
    `http://localhost:8080/_og_${name}.html`,
  ], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  console.log('  ·', path.relative(ROOT, dest), `(${(fs.statSync(dest).size / 1024).toFixed(0)} kB)`);
  made++;
}
console.log(`\n${made} preview image(s). Commit static/assets/og/ and rebuild.`);
