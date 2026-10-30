// Settings are a per-viewer convenience, so they stay in this browser even though menus and
// visits live in the shared store.
const KEY = 'lunch-plinko:settings';

export function loadSettings(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {};
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, typeof saved[key] === typeof value ? saved[key] : value]),
    );
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings still apply for this visit.
  }
}
