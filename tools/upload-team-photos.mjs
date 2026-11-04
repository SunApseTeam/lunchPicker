// Uploads the team's face photos in team-faces/ to the public "team" bucket of the shared
// Supabase project, replacing files of the same name.
//
// Needs the project's secret key in SUPABASE_SECRET_KEY (Project Settings > API Keys > Secret
// keys), set in the environment or in the git-ignored .env file at the project root. The key is
// only sent to Supabase; never commit it or paste it anywhere else.
//   node tools/upload-team-photos.mjs
//
// Only <member id>.png and <member id>-squish.png files are sent.
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL } from '../src/infrastructure/config.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!key) {
  console.error('SUPABASE_SECRET_KEY is not set. See the top of this file.');
  process.exit(1);
}

const dir = new URL('../team-faces/', import.meta.url);
const files = (await readdir(dir)).filter((f) => /^[a-z0-9-]+(-squish)?\.png$/.test(f)).sort();
if (files.length === 0) {
  console.error('No <id>.png files in team-faces/.');
  process.exit(1);
}

// Newer sb_secret_ keys go in the apikey header alone; a legacy service_role key also works as a
// bearer token. Try the first and fall back to the second.
async function upload(name, body) {
  const url = `${SUPABASE_URL}/storage/v1/object/team/${name}`;
  const base = { apikey: key, 'Content-Type': 'image/png', 'x-upsert': 'true', 'Cache-Control': 'max-age=300' };
  let res = await fetch(url, { method: 'POST', headers: base, body });
  if (res.status === 401 || res.status === 403) res = await fetch(url, { method: 'POST', headers: { ...base, Authorization: `Bearer ${key}` }, body });
  return res;
}

let failed = 0;
for (const name of files) {
  const body = await readFile(new URL(name, dir));
  const res = await upload(name, body);
  if (res.ok) console.log(`ok    ${name} (${Math.round(body.length / 1024)} KB)`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
}
console.log(failed ? `${failed} of ${files.length} failed.` : `All ${files.length} uploaded.`);
process.exit(failed ? 1 : 0);
