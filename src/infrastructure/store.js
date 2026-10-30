import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { createDemoStore } from './demo-store.js';
import { createLocalStore } from './local-store.js';
import { createSupabaseStore } from './supabase-store.js';

// Which store this page runs on:
//   ?demo   made-up sample records in memory, to look at the screens; nothing is saved
//   ?local  this browser's storage, so trying things out never touches the team's records
//   default the team's shared Supabase project (or this browser if none is configured)
export function storeMode() {
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) return 'demo';
  if (params.has('local') || !SUPABASE_URL) return 'local';
  return 'shared';
}

export function createStore(mode = storeMode()) {
  if (mode === 'demo') return createDemoStore();
  if (mode === 'local') return createLocalStore();
  return createSupabaseStore(SUPABASE_URL, SUPABASE_KEY);
}
