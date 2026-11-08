// Publishes one post to Instagram. Usage: node publish.mjs [post-id] [--dry]
// With no post id, takes today's entry (Paris time) in calendar.json. The token comes from META_TOKEN.
import { readFileSync, readdirSync } from 'node:fs';

const BASE = 'https://ilangour.github.io/eupadev-social/out';
const API = 'https://graph.facebook.com/v26.0';
const dry = process.argv.includes('--dry');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const id = process.argv.slice(2).find(a => a && !a.startsWith('--')) ?? JSON.parse(readFileSync('calendar.json', 'utf8'))[today];
if (!id) { console.log(`Rien de prévu le ${today}.`); process.exit(); }

const post = JSON.parse(readFileSync('posts.json', 'utf8')).find(p => p.id === id);
if (!post) throw new Error(`Post inconnu : ${id}`);
const caption = readFileSync(`out/${id}/caption.txt`, 'utf8');
const images = readdirSync(`out/${id}`).filter(f => /^ig-\d+\.jpg$/.test(f))
  .sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3))).map(f => `${BASE}/${id}/${f}`);
const video = `${BASE}/${id}/reel.mp4`;
const reel = post.ig === 'reel';
console.log(`${today} : ${id} en ${reel ? 'Reel' : `carrousel de ${images.length} images`}`);

for (const url of reel ? [video] : images) {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`Média inaccessible (${res.status}) : ${url}`);
}
if (dry) { console.log('Essai à blanc : médias accessibles, rien de publié.'); process.exit(); }

const token = process.env.META_TOKEN?.trim();
if (!token) throw new Error('META_TOKEN manquant');
async function call(path, params) {
  const res = await fetch(`${API}/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}` },
    body: params ? new URLSearchParams(params) : undefined
  });
  const body = await res.json();
  if (body.error) throw new Error(`${path} : ${body.error.code} ${body.error.message}`);
  return body;
}
async function ready(container) {
  for (let i = 0; i < 60; i++) {
    const { status_code: status } = await call(`${container}?fields=status_code`);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Conteneur ${container} : ${status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Conteneur ${container} : délai dépassé`);
}

// One token, several accounts: English posts go to @eupadev, the rest to @eupadev.fr.
const username = post.lang === 'en' ? 'eupadev' : 'eupadev.fr';
let ig;
for (const { id: a } of (await call('me/assigned_instagram_accounts')).data)
  if ((await call(`${a}?fields=username`)).username === username) ig = a;
if (!ig) throw new Error(`Compte @${username} non attribué au robot de publication`);
console.log(`Compte : @${username}`);

// A re-run must never post twice: skip if a recent post already has this caption.
const recent = (await call(`${ig}/media?fields=caption&limit=10`)).data;
if (recent.some(m => m.caption?.trim() === caption.trim())) { console.log('Déjà publié, rien à faire.'); process.exit(); }

// is_ai_generated shows Instagram's "AI info" label; it can only be set at creation, never added later.
let container;
if (reel) {
  ({ id: container } = await call(`${ig}/media`, { media_type: 'REELS', video_url: video, caption, share_to_feed: 'true', is_ai_generated: 'true' }));
} else {
  const children = [];
  for (const image_url of images) {
    const { id: child } = await call(`${ig}/media`, { image_url, is_carousel_item: 'true' });
    await ready(child);
    children.push(child);
  }
  ({ id: container } = await call(`${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption, is_ai_generated: 'true' }));
}
await ready(container);
const { id: media } = await call(`${ig}/media_publish`, { creation_id: container });
console.log(`Publié : ${(await call(`${media}?fields=permalink`)).permalink}`);
