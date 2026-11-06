// Usage: node render.mjs <post-id>  ->  out/<post-id>/{ig-N.jpg, reel.mp4, caption.txt}
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');

const FORMATS = {
  ig: { h: 1350, y: 960, top: 96, right: 84 },   // Instagram 4:5
  tt: { h: 1920, y: 1190, top: 250, right: 150 } // TikTok 9:16, clear of the app's buttons
};

// Neon drawings, centred on the tube: x -220..220, y 0 = the tube itself.
const L = 'M-220 0H220';
const HOUSE = 'M150 0V-125L0 -225L-150 -125V0M-62 -125H62V-85H-62ZM-62 -65H62V-25H-62ZM-42 -105H-41M-42 -45H-41';
const ART = {
  ask: { c: `${L}M-120 0V-140Q-120 -180 -80 -180H80Q120 -180 120 -140V0M-60 0V50L-10 0M-35 -115Q-35 -150 0 -150Q35 -150 35 -118Q35 -95 0 -82V-62M0 -30V-29`, first: true },
  laptop: { c: `${L}M-150 0V-170Q-150 -190 -130 -190H130Q150 -190 150 -170V0M-190 0Q-190 26 -160 26H160Q190 26 190 0M0 -165Q8 -108 62 -98Q8 -88 0 -32Q-8 -88 -62 -98Q-8 -108 0 -165Z` },
  broken: { c: 'M-220 0H-70', p: 'M-70 0L-35 -48L0 22L32 -30M92 -18L60 34M120 0L220 0M-30 -110L-48 -150M30 -100L52 -145M100 -80L135 -112', rightDim: true }, 
  robots: { c: `${L}${[-130, 0, 130].map(x => `M${x - 48} 0V-82Q${x - 48} -104 ${x - 26} -104H${x + 26}Q${x + 48} -104 ${x + 48} -82V0M${x} -104V-138M${x} -150V-149M${x - 20} -62V-61M${x + 20} -62V-61M${x - 20} -28H${x + 20}`).join('')}`, leftDim: true },
  gates: { c: L, p: [-100, 100].map(x => `M${x - 72} 0V-120Q${x - 72} -192 ${x} -192Q${x + 72} -192 ${x + 72} -120V0M${x - 38} 0Q${x - 38} -62 ${x} -62Q${x + 38} -62 ${x + 38} 0M${x} -128Q${x + 24} -128 ${x + 24} -104Q${x + 24} -80 ${x} -80Q${x - 24} -80 ${x - 24} -104Q${x - 24} -128 ${x} -128Z`).join('') },
  home: { c: `M-220 0H150${HOUSE}`, last: true },
  mascot: { c: L, big: true },
  line: { c: L },
  cage: { c: `${L}M-130 0V-190H130V0M-78 0V-190M78 0V-190M-26 0V-190M26 0V-190M-130 -95H130` },
  seal: { c: `${L}M-140 0V-150H140V0M-140 -150L0 -80L140 -150`, p: 'M0 -62Q30 -62 30 -32Q30 -2 0 -2Q-30 -2 -30 -32Q-30 -62 0 -62ZM-14 -32L-3 -21L15 -44' },
  tunnel: { c: 'M-220 0H-34M34 0H220M-205 0Q-130 -215 0 -215Q130 -215 205 0M-120 -28L-92 0L-120 28M120 -28L92 0L120 28', p: 'M0 -46V-20M-24 -36L-12 -18M24 -36L12 -18' },
  dup: { c: `${L}${[-82, 54, 190].map(x => `M${x - 58} 0V-120H${x + 58}V0M${x - 58} -92H${x + 58}M${x - 30} -52H${x + 30}`).join('')}` },
  gauge: { c: `${L}M-150 0Q-150 -170 0 -170Q150 -170 150 0`, p: 'M0 0L92 -104M92 -160L126 -128' },
  copy: { c: `${L}M-120 0V-180H120V0M-74 -130H74M-74 -84H20`, p: 'M28 -50L58 -20L112 -92' },
  house: { c: `${L}${HOUSE}` },
  cloud: { c: `${L}M-130 0Q-195 0 -195 -58Q-195 -108 -140 -112Q-122 -180 -48 -180Q10 -180 34 -132Q62 -150 96 -134Q124 -120 126 -92Q190 -88 190 -42Q190 0 140 0M-45 -95H45V-35H-45ZM-45 -75H45` },
  nosub: { c: L, p: 'M-140 -175H140V-30H-140ZM-140 -135H140M-95 -70H-30M-175 -8L175 -196' }
};

const THEMES = {
  cyan: { a: '#2ff3d6', r: '#0f3a44' }, pink: { a: '#ff4fa3', r: '#3a1030' },
  violet: { a: '#a78bfa', r: '#241a52' }, amber: { a: '#ffc24b', r: '#3d2a08' }
};
let theme = THEMES.cyan;

const LETTERS = {
  E: 'M50 0H0V80H50M0 40H40', U: 'M0 0V55Q0 80 25 80Q50 80 50 55V0', P: 'M0 80V0H30Q52 0 52 22Q52 44 30 44H0',
  A: 'M0 80L25 0L50 80M10 52H40', D: 'M0 0V80H22Q52 80 52 40Q52 0 22 0Z', V: 'M0 0L25 80L50 0'
};
const word = cls => [...'EUPADEV'].map((l, i) => `<path class="${cls}" pathLength="1" transform="translate(${i * 74})" d="${LETTERS[l]}"/>`).join('');
const logo = (x, y, scale, cls = '') => `<g class="logo ${cls}" transform="translate(${x} ${y}) scale(${scale})">${word('glow')}${word('core')}</g>`;

const tube = (d, color, cls = '') => d ? `<g class="${cls}"><path class="glow" style="stroke:${color}" pathLength="1" d="${d}"/><path class="core" pathLength="1" d="${d}"/></g>` : '';

// Mascot, feet at y 0. Kinds share a body plan: node render.mjs <post-id> [mole|cat|alien].
const MOOD = { ask: 'puzzled', mascot: 'puzzled', cloud: 'sad', broken: 'sad' };
const KIND = process.argv[3] ?? 'cat';
const BODY = 'M-72 -8Q-90 -95 -56 -138Q-30 -172 0 -172Q30 -172 56 -138Q90 -95 72 -8Q0 8 -72 -8Z';
const SMILE = { happy: 'M-16 -66Q0 -50 16 -66', sad: 'M-13 -56Q0 -70 13 -56', puzzled: 'M-9 -60H9' };
const KINDS = {
  // Tunnel digger, after Eupalinos and the Samos tunnel.
  mole: mood => ({
    face: `<ellipse class="mf" cx="0" cy="-74" rx="34" ry="26"/><ellipse cx="0" cy="-94" rx="12" ry="8.5" fill="#ff4fa3"/><path class="m" d="${SMILE[mood]}"/>`,
    top: `<path class="m hf" d="M-54 -146Q-54 -200 0 -200Q54 -200 54 -146Z"/><path class="m hb" d="M-70 -146H70"/><circle cx="0" cy="-176" r="13" fill="#f4fffd"/>`
  }),
  cat: mood => ({
    back: `<path class="m tl" d="M62 -22Q128 -24 122 -86Q120 -112 98 -112"/><path class="m tl2" d="M62 -22Q128 -24 122 -86Q120 -112 98 -112"/>
      <path class="m mf" d="M-64 -118L-74 -206L-10 -166Z"/><path class="m mf" d="M64 -118L74 -206L10 -166Z"/>
      <path class="m pk" d="M-56 -138L-62 -184L-28 -162Z"/><path class="m pk" d="M56 -138L62 -184L28 -162Z"/>`,
    face: `<path class="m pk" d="M-10 -92H10L0 -80Z"/><path class="m" d="${mood === 'sad' ? 'M-15 -60Q0 -74 15 -60' : mood === 'puzzled' ? 'M-9 -66H9' : 'M-18 -72Q-9 -60 0 -72Q9 -60 18 -72'}"/>
      <path class="m wh" d="M-52 -84L-98 -94M-52 -72L-100 -70M52 -84L98 -94M52 -72L100 -70"/>`,
    top: '<path class="m col" d="M-66 -40Q0 -18 66 -40"/><circle cx="0" cy="-20" r="11" fill="#f4fffd"/>'
  }),
  alien: mood => ({
    body: 'M-68 -8Q-96 -70 -96 -112Q-96 -176 0 -176Q96 -176 96 -112Q96 -70 68 -8Q0 8 -68 -8Z',
    back: '<path class="m an" d="M-34 -170Q-44 -206 -66 -218M34 -170Q44 -206 66 -218"/><circle cx="-70" cy="-222" r="14" fill="#ff4fa3"/><circle cx="70" cy="-222" r="14" fill="#ff4fa3"/>',
    eyes: `<g class="blink">${[-38, 38].map(x => `<ellipse cx="${x}" cy="-104" rx="27" ry="33" fill="#02161b" stroke="#f4fffd" stroke-width="5"/><circle cx="${x + 9}" cy="-118" r="9" fill="#f4fffd"/><circle cx="${x - 9}" cy="-92" r="4" fill="#f4fffd"/>`).join('')}</g>`,
    face: `<path class="m" d="${{ happy: 'M-14 -54Q0 -40 14 -54', sad: 'M-11 -44Q0 -56 11 -44', puzzled: 'M-7 -48H7' }[mood]}"/>`
  })
};
const GEAR = {
  helmet: { head: '<path class="m hf" d="M-48 -150Q-48 -198 0 -198Q48 -198 48 -150Z"/><path class="m hb" d="M-62 -150H62"/><circle cx="0" cy="-176" r="11" fill="#f4fffd"/>' },
  glasses: { head: '<circle class="gl" cx="-27" cy="-112" r="23"/><circle class="gl" cx="27" cy="-112" r="23"/><path class="m gb" d="M-4 -114H4"/>' },
  magnifier: { hand: '<circle class="gl" cx="122" cy="-108" r="32"/><path class="m gb" d="M104 -82L90 -60"/>' },
  clipboard: { hand: '<path class="m clip" d="M92 -140H150V-62H92Z"/><path class="m gb" d="M104 -118H138M104 -100H138M104 -82H126"/>' }
};
function mascot(x, y, s, mood = 'happy', kind = KIND, gear) {
  const k = KINDS[kind](mood), g = GEAR[gear] ?? {};
  const eye = cx => `<circle cx="${cx}" cy="-112" r="13" fill="#f4fffd"/><circle cx="${cx + 3}" cy="-117" r="4" fill="#06222a"/>`;
  const eyes = k.eyes ?? (mood === 'happy'
    ? '<path class="m" d="M-40 -114Q-27 -132 -14 -114M14 -114Q27 -132 40 -114"/>'
    : `<g class="blink">${eye(-27)}${eye(27)}</g>`);
  const brows = k.eyes ? '' : { sad: '<path class="m" d="M-42 -130L-16 -139M42 -130L16 -139"/>', puzzled: '<path class="m" d="M-42 -132L-14 -134M14 -140L42 -135"/>', happy: '' }[mood];
  return `<g transform="translate(${x} ${y}) scale(${s})"><g class="hop"><g class="bob mascot">
    ${k.back ?? ''}
    <ellipse class="mf" cx="-38" cy="-4" rx="30" ry="13"/><ellipse class="mf" cx="38" cy="-4" rx="30" ry="13"/>
    <path class="m mf" d="${k.body ?? BODY}"/>
    <ellipse cx="-58" cy="-70" rx="13" ry="8" fill="#ff4fa3" opacity=".45"/><ellipse cx="58" cy="-70" rx="13" ry="8" fill="#ff4fa3" opacity=".45"/>
    ${k.face}${eyes}${brows}<g class="hat">${k.top ?? ''}</g>${g.head ?? ''}
    <ellipse class="mf" cx="-84" cy="-50" rx="24" ry="19"/>
    <g class="wave"><ellipse class="mf" cx="84" cy="-50" rx="24" ry="19"/>${g.hand ?? ''}</g>
  </g></g></g>`;
}

function art(a, y) {
  const left = a.first ? '' : tube('M-620 0H-220', 'var(--a)', a.leftDim ? 'dim' : '');
  const right = a.last ? '' : tube('M220 0H620', 'var(--a)', a.rightDim ? 'dim' : '');
  const lit = left + right + tube(a.c, 'var(--a)') + tube(a.p, '#ff4fa3');
  const floor = a.last ? '' : `<g class="floor" transform="translate(0 34) scale(1 -.55)">${lit}</g>`;
  return `<g transform="translate(540 ${y}) scale(1.4)">${floor}${lit}</g>`;
}

const MASCOT_CSS = `
  .mascot { filter: drop-shadow(0 0 9px #2ff3d6aa); }
  .mf { fill: #0f3a44; stroke: #2ff3d6; stroke-width: 5; }
  .m { stroke: #f4fffd; stroke-width: 5; }
  path.mf { stroke: #2ff3d6; fill: #0f3a44; }
  path.hf { fill: #3a1030; stroke: #ff4fa3; }
  path.hb { stroke: #ff4fa3; stroke-width: 9; }
  path.pk { fill: #ff4fa3; stroke: none; }
  path.wh { stroke-width: 3.5; opacity: .85; }
  path.tl { stroke: #2ff3d6; stroke-width: 26; }
  path.tl2 { stroke: #0f3a44; stroke-width: 16; }
  path.col { stroke: #ff4fa3; stroke-width: 11; }
  path.an { stroke: #2ff3d6; stroke-width: 7; }
  .gl { fill: #ffffff14; stroke: #ff4fa3; stroke-width: 7; }
  path.gb { stroke: #ff4fa3; stroke-width: 7; }
  path.clip { fill: #3a1030; stroke: #ff4fa3; }
`;
const MASCOT_MOTION = `
  .hop { animation: hop .35s ease-out both; transform-box: fill-box; transform-origin: 50% 100%; }
  .bob { animation: bob .7s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 100%; }
  .blink { animation: blink 1.9s linear infinite; transform-box: fill-box; transform-origin: 50% 50%; }
  .wave { animation: wave .35s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 20% 100%; }
  @keyframes hop { from { transform: translateY(-70px) scale(.8, 1.15); } 70% { transform: scale(1.12, .88); } }
  @keyframes bob { to { transform: scale(1.03, .96); } }
  @keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.08); } }
  @keyframes wave { from { transform: translateY(0) rotate(-8deg); } to { transform: translateY(-34px) rotate(14deg); } }
`;

const TEXT = {
  chat: s => s.messages.map(([who, t]) => `<div class="msg ${who}">${t}</div>`).join(''),
  quiz: s => `<h1>${s.title}</h1><div class="pick"><b class="${s.answer === 'vrai' ? 'on' : s.answer ? 'off' : ''}">Vrai</b><b class="${s.answer === 'faux' ? 'on' : s.answer ? 'off' : ''}">Faux</b></div>${s.body ? `<p>${s.body}</p>` : ''}`,
  big: s => `<div class="huge">${s.big}</div><h1>${s.title}</h1>${s.body ? `<p>${s.body}</p>` : ''}`,
  list: s => `<h1>${s.title}</h1><ul class="${s.tick ? 'tick' : ''}">${s.items.map(i => `<li>${i}</li>`).join('')}</ul>`
};

function slide(s, f, animated = false) {
  const { title, body, layout, gear, team } = s, name = s.art ?? 'line';
  const mood = s.mood ?? MOOD[name], sizeUp = animated ? 1.2 : 1.05;
  const hero = team
    ? team.map(([g, label], i) => mascot(210 + i * 330, f.y - 3, 1.1, 'happy', KIND, g) + `<text class="tag" x="${210 + i * 330}" y="${f.y + 76}" text-anchor="middle">${label}</text>`).join('')
    : ART[name].big ? mascot(540, f.y - 3, 2.1, mood, KIND, gear) : mascot(150, f.y - 3, sizeUp, mood, KIND, gear);
  const mark = ART[name].last ? logo(195, f.y + 90, 1.4) : logo(84, f.y + 250, .42, 'small');
  // French spacing: a question mark or colon never starts a line.
  const text = (TEXT[layout]?.(s) ?? `<h1>${title}</h1>${body ? `<p>${body}</p>` : ''}`).replace(/ ([?!:;])/g, '\u00a0$1');
  return `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  :root { --a: ${theme.a}; --r: ${theme.r}; }
  .huge { font-size: 300px; font-weight: 800; line-height: .95; letter-spacing: -.04em; color: var(--a); text-shadow: 0 0 44px var(--a); }
  .msg { font-size: 54px; font-weight: 500; line-height: 1.2; padding: 26px 36px; border-radius: 40px; width: fit-content; max-width: 84%; margin-bottom: 26px; background: #05090dcc; }
  .msg.eupa { border: 5px solid #2ff3d6; box-shadow: 0 0 22px #2ff3d688; border-bottom-left-radius: 8px; }
  .msg.toi { border: 5px solid #ff4fa3; box-shadow: 0 0 22px #ff4fa388; border-bottom-right-radius: 8px; margin-left: auto; }
  .pick { display: flex; gap: 28px; margin-top: 44px; }
  .pick b { font-size: 62px; font-weight: 800; padding: 16px 50px; border-radius: 26px; border: 5px solid #f4fffd; }
  .pick .on { border-color: var(--a); color: #05090d; background: var(--a); box-shadow: 0 0 40px var(--a); }
  .pick .off { opacity: .28; }
  ul { list-style: none; padding: 0; margin-top: 36px; }
  li { font-size: 52px; font-weight: 500; line-height: 1.16; padding-left: 74px; position: relative; margin-bottom: 22px; }
  li::before { content: '✕'; position: absolute; left: 0; color: #ff4fa3; font-weight: 800; text-shadow: 0 0 16px #ff4fa3; }
  .tick li::before { content: '✓'; color: var(--a); text-shadow: 0 0 16px var(--a); }
  .tag { font: 800 44px 'Bricolage Grotesque', sans-serif; fill: #f4fffd; }
  body { width: 1080px; height: ${f.h}px; overflow: hidden; color: #f4fffd; font-family: 'Bricolage Grotesque', sans-serif;
    background: radial-gradient(900px 620px at 50% ${f.y - 70}px, var(--r), #05090d 78%); position: relative; }
  svg { position: absolute; inset: 0; }
  .text { position: absolute; left: 84px; right: ${f.right}px; top: ${f.top}px; }
  h1 { font-size: 100px; font-weight: 800; line-height: 1.02; letter-spacing: -.025em; text-wrap: balance; }
  p { font-size: 50px; font-weight: 500; line-height: 1.25; color: #bfe9e3; margin-top: 34px; text-wrap: pretty; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .glow { stroke-width: 11; filter: url(#bloom); }
  .core { stroke: #f4fffd; stroke-width: 4; }
  .dim { opacity: .22; }
  .floor { opacity: .16; filter: blur(7px); }
  .logo .glow { stroke: var(--a); }
  .small { opacity: .75; }
  ${MASCOT_CSS}
  ${animated ? `
  h1 { font-size: 118px; }
  p { font-size: 54px; animation: in .3s .35s both; }
  .msg:nth-child(2) { animation: in .25s .9s both; }
  li:nth-child(2) { animation: in .2s .5s both; } li:nth-child(3) { animation: in .2s 1s both; }
  li:nth-child(4) { animation: in .2s 1.5s both; } li:nth-child(5) { animation: in .2s 2s both; }
  svg { animation: push 4s linear both; }
  ${MASCOT_MOTION}
  svg path:not(.m) { stroke-dasharray: 1.02 1; animation: draw .8s ease-out both; }
  @keyframes draw { from { stroke-dashoffset: 1.02; } to { stroke-dashoffset: 0; } }
  @keyframes in { from { opacity: 0; } }
  @keyframes push { to { transform: scale(1.05); } }` : ''}
</style>
<svg viewBox="0 0 1080 ${f.h}"><defs><filter id="bloom" filterUnits="userSpaceOnUse" x="-800" y="-800" width="2800" height="2800">
  <feGaussianBlur stdDeviation="7" result="a"/><feGaussianBlur stdDeviation="20" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  ${art(ART[name], f.y)}${mark}${hero}</svg>
<div class="text">${text}</div>`;
}

// Profile picture: out/profil/eupa.png. Everything sits inside the circle the apps crop to.
async function profilePicture() {
  const html = `<!doctype html><style>* { margin: 0; } body { width: 1080px; height: 1080px; overflow: hidden; background: radial-gradient(620px 620px at 50% 52%, #17606e, #05090d 92%); }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; } ${MASCOT_CSS}
  .mascot { filter: drop-shadow(0 0 18px #2ff3d6); }</style>
  <svg viewBox="0 0 1080 1080" width="1080" height="1080">${mascot(525, 860, 3.15, 'happy', 'cat')}</svg>`;
  mkdirSync('out/profil', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
  await page.setContent(html);
  await page.screenshot({ path: 'out/profil/eupa.png' });
  await browser.close();
}

// Side-by-side comparison of the kinds: out/mascottes/{planche.png, mascottes.mp4}.
async function mascotSheet() {
  const W = 1620, H = 1000, FPS = 30, cols = [['mole', 'Taupe'], ['cat', 'Chat'], ['alien', 'Alien']];
  const cell = cols.map(([kind, label], i) => {
    const x = 270 + i * 540;
    return `<text x="${x}" y="84" text-anchor="middle">${label}</text>
      <path class="line" d="M${x - 230} 590H${x + 230}"/>${mascot(x, 588, 1.75, 'happy', kind)}
      ${['puzzled', 'sad'].map((m, j) => mascot(x - 110 + j * 220, 900, .95, m, kind)).join('')}
      <path class="line" d="M${x - 230} 902H${x + 230}"/>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=block" rel="stylesheet">
<style>* { margin: 0; } body { width: ${W}px; height: ${H}px; overflow: hidden; background: radial-gradient(1100px 700px at 50% 55%, #0f3a44, #05090d 80%); }
  text { font: 800 58px 'Bricolage Grotesque', sans-serif; fill: #f4fffd; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .line { stroke: #2ff3d6; stroke-width: 6; filter: drop-shadow(0 0 10px #2ff3d6); }
  ${MASCOT_CSS}${MASCOT_MOTION}</style><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${cell}</svg>`;
  const dir = 'out/mascottes', frames = `${dir}/frames`;
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const at = ms => page.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }), ms);
  for (let i = 0; i < 4 * FPS; i++) {
    await at(i * 1000 / FPS);
    await page.screenshot({ path: `${frames}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await at(700);
  await page.screenshot({ path: `${dir}/planche.png` });
  await browser.close();
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`,
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '19', `${dir}/mascottes.mp4`]);
  rmSync(frames, { recursive: true });
}

const id = process.argv[2];
if (id === 'mascottes') { await mascotSheet(); process.exit(); }
if (id === 'profil') { await profilePicture(); process.exit(); }
const post = JSON.parse(readFileSync('posts.json', 'utf8')).find(p => p.id === id);
if (!post) throw new Error(`Post inconnu : ${id}`);
theme = THEMES[post.theme ?? 'cyan'];
const dir = `out/${id}`;
mkdirSync(dir, { recursive: true });
const NOTICE = "EupaDev est open source et en préversion : pas encore prêt pour la production. Lien en bio.";
const CREDIT = 'Voix : corpus SIWIS (CC-BY 4.0).';
writeFileSync(`${dir}/caption.txt`, `${post.caption.includes('préversion') ? post.caption : `${post.caption}\n\n${NOTICE}\n\n#ia #opensource #autohebergement #eupadev`}\n\n${CREDIT}`);

const browser = await chromium.launch({ channel: 'chrome' });

// Carousel: JPEG, as the Instagram API requires.
const ig = await browser.newPage({ viewport: { width: 1080, height: FORMATS.ig.h } });
for (const [i, s] of post.slides.entries()) {
  await ig.setContent(slide(s, FORMATS.ig), { waitUntil: 'networkidle' });
  await ig.evaluate(() => document.fonts.ready);
  await ig.screenshot({ path: `${dir}/ig-${i + 1}.jpg`, type: 'jpeg', quality: 93 });
}

// Reel, also used for TikTok: frames stepped one by one, so the timing is exact.
const FPS = 30, frames = `${dir}/frames`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);

// What Eupa says on each scene; the voice sets each scene's length.
const narration = s => {
  if (s.say) return [['eupa', s.say]];
  if (s.messages) return s.messages;
  if (s.layout === 'quiz' && s.answer) return [['eupa', `${s.answer === 'vrai' ? 'Vrai' : 'Faux'}. ${s.body ?? ''}`]];
  if (s.items) return [['eupa', `${s.title} ${s.items.join('. ')}.`]];
  return [['eupa', [s.big, s.title, s.body].filter(Boolean).join(' ')]];
};
const scenes = post.reel ?? post.slides;
writeFileSync(`${dir}/scenes.json`, JSON.stringify(scenes.map(s => ({ min: s.d ?? 1.4, say: narration(s) }))));
const durations = JSON.parse(execFileSync('.tts/bin/python', ['audio.py', `${dir}/scenes.json`, `${dir}/audio.wav`, id], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop());

// Reel, also used for TikTok: frames stepped one by one, so the timing is exact.
const video = await browser.newPage({ viewport: { width: 1080, height: FORMATS.tt.h } });
let n = 0;
for (const [k, scene] of scenes.entries()) {
  await video.setContent(slide(scene, FORMATS.tt, true), { waitUntil: 'networkidle' });
  await video.evaluate(() => document.fonts.ready);
  for (let i = 0; i < durations[k] * FPS; i++) {
    await video.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), i * 1000 / FPS);
    await video.screenshot({ path: `${frames}/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
}
await browser.close();
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`, '-i', `${dir}/audio.wav`,
  '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${dir}/reel.mp4`]);
rmSync(`${dir}/audio.wav`);
rmSync(`${dir}/scenes.json`);
rmSync(frames, { recursive: true });
console.log(`OK ${dir}`);
