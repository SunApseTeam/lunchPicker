// The map themes a viewer can pick from. They change only how the scene looks, never how the
// balls move.
//
// A theme is { id, name, icon } plus:
//   glow, pegShadow, dropLine, poke   colours for knocks, peg shadows, the drop line, click puffs
//   wood { fill, ink }                the slot floor rail, dividers and lids
//   trigger { cap, rim, glow }        the spring trigger button
//   wall { dark, base, light, outline, shadow }   the side walls
//   tile(ctx, rnd, wrapped, size)     paints one seamless tile of ground
//   weather(ctx, env)                 what moves over the ground (see ground.js)
//   peg / bumper / wallTexture / wallBump   how those are drawn
import { beach } from './beach.js';
import { meadow } from './meadow.js';
import { night } from './night.js';
import { snowfield } from './snow.js';

export const THEMES = [meadow, beach, snowfield, night];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? meadow;
