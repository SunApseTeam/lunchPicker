// How the trigger slot and the glowing re-drops look, for show only: the physics is in
// domain/round.js.
// The trigger slot is a dark pit with a red button on its floor and nothing to say what it does.
// It starts shut under a cover with a sleeping face, which pops off once the first member lands
// in another slot; then the button sparkles to say it can be pressed. When it is pressed it slams
// flat with a flash and a ring, every slot's floor kicks up on its spring and wobbles back, the
// screen shakes hard and "혼란!" pops up across it. Then the button goes grey and the cover drops
// back on, its face knocked out cold.
// A member dropped again sparkles all the way down, and anyone not deciding that they touch
// bursts with a bang.
import { hexToRgba } from './themes/art.js';

const BANNER_TIME = 1.4;
const INK = '#1c1d26';
// The button is red on every map: it should look like something you must not press.
export const BUTTON = { cap: '#e3262b', rim: '#6e0d10', glow: '#ff4d42' };
const DEAD = { cap: '#8a8a8f', rim: '#4a4a50' };
// The cover: a plum shell, cute and a little sinister, unlike the wooden lids.
const COVER = { shell: '#7b1d3a', light: '#c2456b', cheek: '#ff8fb1' };
const OPEN_TIME = 0.35;
// The cover drops back on this long after the press, landing as the round covers the slot.
const COVER_DROP = [0.3, 0.5];
const POP_TIME = 0.7;

export function createSpringFx(ctx) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // board -> when its cover came off and when its button was pressed. Each round's board is its
  // own, so a fresh board starts covered and unpressed.
  const openedAt = new WeakMap();
  const pressedAt = new WeakMap();
  const pops = [];
  let shake = { at: -10, power: 0 };
  let bannerAt = -10;

  function open(board, now) {
    openedAt.set(board, now);
  }

  function press(board, now) {
    pressedAt.set(board, now);
    jolt(now, 26);
    bannerAt = now;
  }

  function jolt(now, power) {
    if (now - shake.at < 0.3 && shake.power > power) return;
    shake = { at: now, power };
  }

  // A burst where a member was popped: a ring, a flash and "펑!".
  function pop(x, y, now) {
    pops.push({ x, y, at: now });
    jolt(now, 12);
  }

  // How far the view is jolted right now, in screen pixels.
  function shakeOffset(now) {
    const t = now - shake.at;
    if (still || t > 0.7) return { x: 0, y: 0 };
    const a = shake.power * Math.exp(-7 * t);
    return { x: a * Math.sin(t * 83), y: a * Math.cos(t * 67) };
  }

  // A four-pointed twinkle.
  function star(x, y, size, alpha, color = '#fff6c2') {
    if (alpha <= 0) return;
    ctx.fillStyle = hexToRgba(color, alpha);
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
  }

  // Twinkles winking on and off in a ring round (x, y).
  function twinkles(x, y, spread, now, count, color) {
    for (let i = 0; i < count; i++) {
      const phase = (now * 1.6 + i * 0.37) % 1;
      const a = i * 2.39996 + Math.floor(now * 1.6 + i * 0.37) * 1.7;
      const d = spread * (0.75 + 0.35 * ((i * 0.618) % 1));
      star(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 5 + 6 * Math.sin(phase * Math.PI), Math.sin(phase * Math.PI), color);
    }
  }

  // The trigger slot, from x0 to x1: a dark pit with the button on its floor, sparkling while it
  // can be pressed, and the cover over it while it cannot.
  function drawTriggerSlot(board, now, x0, x1) {
    const at = pressedAt.get(board);
    const since = at === undefined ? null : now - at;
    const pressed = since !== null;
    const opened = openedAt.has(board);
    const armed = opened && !pressed;
    const top = board.dividerTop - 6;
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const floor = board.floorY;

    // The pit: near black, with a red glow throbbing up from the button like a heartbeat.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + 5, top, w - 10, board.height - top, 12);
    ctx.clip();
    ctx.fillStyle = pressed ? 'rgba(40, 40, 44, 0.85)' : 'rgba(26, 12, 14, 0.88)';
    ctx.fillRect(x0, top, w, board.height - top);
    if (!pressed) {
      const beat = (now * 1.3) % 1;
      const throb = Math.exp(-14 * beat) + (beat > 0.22 ? 0.6 * Math.exp(-14 * (beat - 0.22)) : 0);
      const glow = ctx.createRadialGradient(cx, floor, 4, cx, floor, w * 0.9);
      glow.addColorStop(0, hexToRgba(BUTTON.glow, (armed ? 0.35 : 0.15) + 0.45 * throb));
      glow.addColorStop(1, hexToRgba(BUTTON.glow, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x0, top, w, board.height - top);
    }
    ctx.restore();
    ctx.strokeStyle = pressed ? DEAD.rim : BUTTON.rim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x0 + 5, top, w - 10, board.height - top, 12);
    ctx.stroke();

    // The button: a red dome on a dark ring, standing proud until pressed, then squashed flat
    // and gone grey.
    const r = Math.min(w / 2 - 12, 46);
    let height;
    if (!pressed) height = r * (0.6 + 0.06 * Math.sin(now * 5));
    else if (since < 0.08) height = r * 0.6 * (1 - since / 0.08) + 4;
    else height = 4 + 3 * Math.exp(-6 * since) * Math.abs(Math.sin(since * 30));
    if (pressed && since < 0.8) {
      const k = since / 0.8;
      if (since < 0.12) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - since / 0.12)})`;
        ctx.beginPath();
        ctx.arc(cx, floor - 10, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = hexToRgba(BUTTON.cap, 0.9 * (1 - k));
      ctx.lineWidth = 12 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(cx, floor - 10, r * (1.2 + 6 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Grey creeps over the red as the flash dies, so it is plainly dead within a moment.
    const dead = pressed ? Math.min(1, Math.max(0, (since - 0.3) / 0.4)) : 0;
    ctx.fillStyle = dead > 0.5 ? DEAD.rim : BUTTON.rim;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - r - 8, floor - 8, (r + 8) * 2, 12, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BUTTON.cap;
    ctx.beginPath();
    ctx.ellipse(cx, floor - 8, r, height, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    if (dead > 0) {
      ctx.fillStyle = hexToRgba(DEAD.cap, dead);
      ctx.fill();
    }
    ctx.stroke();
    if (!pressed) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.35, floor - 8 - height * 0.6, r * 0.28, height * 0.18, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (armed) {
      // Pressable: the dome shimmers and twinkles dance round it.
      const shine = 0.5 + 0.5 * Math.sin(now * 7);
      ctx.fillStyle = `rgba(255, 240, 200, ${0.25 * shine})`;
      ctx.beginPath();
      ctx.ellipse(cx, floor - 8, r, height, 0, Math.PI, 0);
      ctx.fill();
      twinkles(cx, floor - 8 - height * 0.5, r * 1.1, now, 6);
    }

    drawCover(board, now, x0, x1);
  }

  // The cover over the slot's mouth: a plum shell with a little face, asleep until the slot
  // opens, then knocked out cold once the button has gone off. It pops up and away when the slot
  // opens and drops back on with a bounce after the press.
  function drawCover(board, now, x0, x1) {
    const openAt = openedAt.get(board);
    const pressAt = pressedAt.get(board);
    let lift = 0;
    let alpha = 1;
    let knocked = false;
    if (pressAt !== undefined) {
      const t = now - pressAt;
      if (t < COVER_DROP[0]) return;
      const k = Math.min(1, (t - COVER_DROP[0]) / (COVER_DROP[1] - COVER_DROP[0]));
      const after = t - COVER_DROP[1];
      lift = k < 1 ? -140 * (1 - k * k) : -10 * Math.exp(-8 * after) * Math.abs(Math.cos(after * 18));
      knocked = true;
    } else if (openAt !== undefined) {
      const k = (now - openAt) / OPEN_TIME;
      if (k >= 1) return;
      lift = -120 * k;
      alpha = 1 - k;
    }
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const y = board.lidY - 14 + lift;
    const h = 30;
    ctx.save();
    ctx.globalAlpha = alpha;
    // The pit under the cover darkens.
    if (lift > -20) {
      ctx.fillStyle = 'rgba(20, 10, 14, 0.35)';
      ctx.fillRect(x0 + 5, board.dividerTop, w - 10, board.floorY - board.dividerTop);
    }
    const shell = ctx.createLinearGradient(0, y, 0, y + h);
    shell.addColorStop(0, COVER.light);
    shell.addColorStop(1, COVER.shell);
    ctx.fillStyle = shell;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x0 - 2, y, w + 4, h, [14, 14, 8, 8]);
    ctx.fill();
    ctx.stroke();
    // Rivets at the ends.
    ctx.fillStyle = '#f3d6df';
    for (const rx of [x0 + 9, x1 - 9]) {
      ctx.beginPath();
      ctx.arc(rx, y + h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The face.
    const ey = y + h * 0.45;
    const gap = Math.min(16, w * 0.15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const ex = cx + side * gap;
      ctx.beginPath();
      if (knocked) {
        ctx.moveTo(ex - 4, ey - 4);
        ctx.lineTo(ex + 4, ey + 4);
        ctx.moveTo(ex + 4, ey - 4);
        ctx.lineTo(ex - 4, ey + 4);
      } else {
        ctx.arc(ex, ey - 2, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
      }
      ctx.stroke();
      ctx.fillStyle = hexToRgba(COVER.cheek, 0.8);
      ctx.beginPath();
      ctx.ellipse(ex + side * 7, ey + 6, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    if (knocked) {
      // A little tongue sticking out.
      ctx.moveTo(cx - 4, ey + 6);
      ctx.lineTo(cx + 4, ey + 6);
      ctx.stroke();
      ctx.fillStyle = COVER.cheek;
      ctx.beginPath();
      ctx.ellipse(cx + 1, ey + 9, 3, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(cx, ey + 4, 3, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      // Asleep, for now.
      ctx.fillStyle = INK;
      ctx.font = '700 13px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const bob = Math.sin(now * 2) * 2;
      ctx.fillText('z', x1 - 22, y - 4 + bob);
      ctx.font = '700 10px "IBM Plex Sans KR", sans-serif';
      ctx.fillText('z', x1 - 13, y - 13 + bob);
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  // Every slot's floor kicking up on its spring and wobbling back, once the button is pressed.
  function drawSprings(board, theme, now) {
    const at = pressedAt.get(board);
    if (at === undefined || now - at > 1.2) return;
    const since = now - at;
    const offset = -26 * Math.exp(-5 * since) * Math.cos(16 * since);
    const glowing = Math.max(0, 0.8 - since);
    const { fill, ink } = theme.wood;
    for (let i = 0; i < board.slotEdges.length - 1; i++) {
      if (i === board.triggerSlot) continue;
      const x0 = board.slotEdges[i] + 8;
      const x1 = board.slotEdges[i + 1] - 8;
      const cx = (x0 + x1) / 2;
      const y = board.floorY + offset;
      const depth = Math.max(8, 30 - offset);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, y + 2);
      for (let k = 0; k <= 6; k++) ctx.lineTo(cx + (k % 2 === 0 ? -16 : 16), y + 4 + (depth * k) / 6);
      ctx.stroke();
      ctx.lineJoin = 'miter';
      ctx.fillStyle = hexToRgba(BUTTON.glow, glowing * 0.5);
      ctx.fillRect(x0, board.dividerTop, x1 - x0, board.floorY - board.dividerTop);
      ctx.fillStyle = fill;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x0, y - 4, x1 - x0, 8, 4);
      ctx.fill();
      ctx.stroke();
    }
  }

  // A member dropped again: a golden halo pulsing round them and twinkles all about, to say they
  // will burst whoever is in their way. Drawn under the ball.
  function drawCharge(b, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 9);
    const halo = ctx.createRadialGradient(b.cx, b.cy, b.R * 0.8, b.cx, b.cy, b.R * (1.6 + 0.2 * pulse));
    halo.addColorStop(0, `rgba(255, 214, 90, ${0.75})`);
    halo.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.R * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Twinkles over a glowing member, drawn on top of the ball.
  function drawChargeSparkles(b, now) {
    twinkles(b.cx, b.cy, b.R * 1.25, now * 1.4 + b.id, 7, '#fff3b0');
  }

  // Rings, flashes and "펑!" where members were popped.
  function drawPops(now) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const { x, y, at } = pops[i];
      const t = now - at;
      if (t > POP_TIME) {
        pops.splice(i, 1);
        continue;
      }
      const k = t / POP_TIME;
      if (t < 0.1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * (1 - t / 0.1)})`;
        ctx.beginPath();
        ctx.arc(x, y, 90, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(255, 196, 60, ${1 - k})`;
      ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(x, y, 40 + 170 * k, 0, Math.PI * 2);
      ctx.stroke();
      const size = 54 * (t < 0.12 ? 0.5 + (t / 0.12) * 0.7 : 1.2 - 0.2 * Math.min(1, (t - 0.12) / 0.2));
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.translate(x, y - 20 - 30 * k);
      ctx.rotate(-0.12);
      ctx.font = `${Math.round(size)}px "Black Han Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText('펑!', 0, 0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.strokeText('펑!', 0, 0);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillText('펑!', 0, 0);
      ctx.restore();
    }
  }

  // "혼란!" across the screen, popping in and fading out.
  function drawBanner(width, height, now) {
    const t = now - bannerAt;
    if (t > BANNER_TIME) return;
    const text = '혼란!';
    const pop = t < 0.18 ? 0.4 + 0.8 * (t / 0.18) : 1.2 - 0.2 * Math.min(1, (t - 0.18) / 0.2);
    const alpha = t > BANNER_TIME - 0.3 ? (BANNER_TIME - t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2, height * 0.38);
    ctx.scale(pop, pop);
    ctx.rotate(-0.06);
    ctx.font = `${Math.round(Math.min(96, width / 6))}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = BUTTON.cap;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  return { open, press, pop, shakeOffset, drawTriggerSlot, drawSprings, drawCharge, drawChargeSparkles, drawPops, drawBanner };
}
