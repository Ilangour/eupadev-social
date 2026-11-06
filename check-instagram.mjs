// Read-only check of the Instagram connection. Publishes nothing, never prints the token.
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';

const file = `${homedir()}/.meta-eupa-publisher`;
const token = readFileSync(file, 'utf8').trim();
console.log(`fichier : ${token.length} caractères, droits ${(statSync(file).mode & 0o777).toString(8)}`);

const api = 'https://graph.facebook.com/v26.0';
async function get(path) {
  const res = await fetch(`${api}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (body.error) return { erreur: `${body.error.code}: ${body.error.message}` };
  return body;
}

console.log('robot :', await get('me?fields=id,name'));
const perms = await get('me/permissions');
console.log('autorisations :', perms.data?.filter(p => p.status === 'granted').map(p => p.permission) ?? perms);
const assigned = await get('me/assigned_instagram_accounts');
const id = assigned.data?.[0]?.id;
if (!id) { console.log('Aucun compte Instagram attribué :', JSON.stringify(assigned)); process.exit(1); }
console.log('compte :', JSON.stringify(await get(`${id}?fields=id,username,name,followers_count,media_count`)));
console.log('quota de publication :', JSON.stringify(await get(`${id}/content_publishing_limit?fields=config,quota_usage`)));
