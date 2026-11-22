// The map themes a viewer can pick from. They change how the scene looks, and a map may bring a
// feature of its own to the board (the 계곡's vines); otherwise the balls move the same on all.
//
// A theme is { id, name, icon } plus:
//   glow, pegShadow, dropLine, poke   colours for knocks, peg shadows, the drop line, click puffs
//   wood { fill, ink }                the slot floor rail, dividers and lids
//   wall { dark, base, light, outline, shadow }   the side walls
//   tile(ctx, rnd, wrapped, size)     paints one seamless tile of ground
//   weather(ctx, env)                 what moves over the ground (see ground.js)
//   peg / bumper / wallTexture / wallBump   how those are drawn
//   feature                           optional: 'vines' hangs vines on the board
import { beach } from './beach.js';
import { canyon } from './canyon.js';
import { meadow } from './meadow.js';
import { night } from './night.js';
import { snowfield } from './snow.js';

export const THEMES = [meadow, beach, snowfield, night, canyon];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? meadow;
