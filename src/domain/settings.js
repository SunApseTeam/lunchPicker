// How the balls are made, the same for everyone; each member's own size and bounce adjust it (see
// memberPhysics). Ball size also caps how many balls fit.
export const BALL = { size: 56, softness: 100, bounce: 60 };

// What a viewer can tune in the settings dialog. speed: how fast the simulation runs (1 is real
// time). chaosDelay: seconds from the first ball coming down onto another slot's floor to the 혼란
// button's cover opening. theme: the map theme picked on the board, by id; it changes only how
// the scene looks. rows: how many peg rows the balls fall through, so how long the drop is.
export const DEFAULT_SETTINGS = { sound: true, speed: 1, chaosDelay: 5, rows: 8, theme: 'meadow' };
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const ROWS = [8, 10, 12, 14, 16];
export const CHAOS_DELAY_MAX = 15;
