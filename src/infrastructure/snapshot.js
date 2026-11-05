// The last team and places fetched from the shared store, kept in this browser so a return visit
// shows them at once while the fresh ones load. Only ever a head start: the store has the say.
const PREFIX = 'lunch-plinko:snapshot:';

export function readSnapshot(name) {
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + name));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(name, value) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // Blocked or full storage: the next visit just waits for the store.
  }
}
