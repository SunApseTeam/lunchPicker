import { SUPABASE_URL } from './config.js';

// Team face photos live in the public "team" bucket of the shared Supabase project, as
// <member id>.png (and <member id>-squish.png for the squeezed face). The local copies in
// team-faces/ (kept out of git) serve a dev server before or without the bucket.
export function teamPhotoUrls(id, variant = '') {
  const file = `${id}${variant ? `-${variant}` : ''}.png`;
  const shared = SUPABASE_URL ? [`${SUPABASE_URL}/storage/v1/object/public/team/${file}`] : [];
  return [...shared, `team-faces/${file}`];
}
