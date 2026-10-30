import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { createLocalStore } from './local-store.js';
import { createSupabaseStore } from './supabase-store.js';

// ?local keeps a session on this browser's storage, so trying things out never writes to the
// team's shared records.
export function createStore() {
  const local = new URLSearchParams(location.search).has('local');
  return SUPABASE_URL && !local ? createSupabaseStore(SUPABASE_URL, SUPABASE_KEY) : createLocalStore();
}
