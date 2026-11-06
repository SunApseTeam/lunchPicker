// How the trigger slot and the glowing re-drops look, for show only: the physics is in
// domain/round.js.
// The trigger slot is a dark pit with a red button on its floor and nothing to say what it does.
// It starts shut under a glass cover, like an alarm button's, which flips open once the first
// member lands in another slot; then the button blinks and sparkles to say it can be pressed.
// When it is pressed it slams flat with a flash and a ring, every slot's floor kicks up on its
// spring and wobbles back and "혼란!" pops up across the screen, which stays still. Then the
// button goes grey and the glass cover slams shut again.
// A member dropped again glows gold behind a ring of spikes all the way down.
import { hexToRgba } from './themes/art.js';

const BANNER_TIME = 1.4;
const INK = '#1c1d26';
// The button is red on every map: it should look like something you must not press.
export const BUTTON = { cap: '#e3262b', rim: '#6e0d10', glow: '#ff4d42' };
const DEAD = { cap: '#8a8a8f', rim: '#4a4a50' };
const OPEN_TIME = 0.35;
// The glass cover swings shut this long after the press, landing as the round covers the slot.
const COVER_SHUT = [0.3, 0.5];
// How far the glass cover swings up on its hinge when open.
const COVER_SWING = 1.9;

export function createSpringFx(ctx) {
  // board -> when its cover came off and when its button was pressed. Each round's board is its
  // own, so a fresh board starts covered and unpressed.
  const openedAt = new WeakMap();
  const pressedAt = new WeakMap();
  let bannerAt = -10;

  function open(board, now) {
    openedAt.set(board, now);
  }

  function press(board, now) {
    pressedAt.set(board, now);
    bannerAt = now;
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
    // Armed, the dome lights up from inside and blinks like an alarm lamp.
    const blink = armed ? 0.5 + 0.5 * Math.sin(now * 10) : 0;
    if (armed) {
      const lit = ctx.createRadialGradient(cx - r * 0.2, floor - 8 - height * 0.5, 2, cx, floor - 8, r);
      lit.addColorStop(0, `rgba(255, 236, 214, ${0.55 + 0.45 * blink})`);
      lit.addColorStop(0.45, hexToRgba(BUTTON.glow, 0.95));
      lit.addColorStop(1, BUTTON.cap);
      ctx.fillStyle = lit;
      ctx.shadowColor = hexToRgba(BUTTON.glow, 0.9);
      ctx.shadowBlur = 18 + 26 * blink;
    } else {
      ctx.fillStyle = BUTTON.cap;
    }
    ctx.beginPath();
    ctx.ellipse(cx, floor - 8, r, height, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
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
      // Pressable: light shoots up off the dome and twinkles flicker on and over it.
      const top = floor - 8 - height;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.12 + (i / 6) * 0.76);
        const len = r * (0.45 + 0.35 * blink) * (i % 2 ? 0.7 : 1);
        const from = r * 0.25;
        ctx.strokeStyle = `rgba(255, 220, 120, ${0.35 + 0.55 * blink})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r + from), top + height * 0.4 + Math.sin(a) * (height + from));
        ctx.lineTo(cx + Math.cos(a) * (r + from + len), top + height * 0.4 + Math.sin(a) * (height + from + len));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      twinkles(cx, floor - 8 - height * 0.55, r * 0.55, now * 1.3, 4);
      twinkles(cx, floor - 8 - height * 0.5, r * 1.15, now, 6);
    }

    drawCover(board, now, x0, x1);
  }

  // The glass cover over the slot's mouth, hinged on its left like an alarm button's. It swings
  // up and away when the slot opens, and slams back down after the press.
  function drawCover(board, now, x0, x1) {
    const openAt = openedAt.get(board);
    const pressAt = pressedAt.get(board);
    // swing: 0 shut, 1 fully up. alpha fades it out once it is up.
    let swing = 0;
    let alpha = 1;
    let slammed = null;
    if (pressAt !== undefined) {
      const t = now - pressAt;
      if (t < COVER_SHUT[0]) return;
      const k = Math.min(1, (t - COVER_SHUT[0]) / (COVER_SHUT[1] - COVER_SHUT[0]));
      swing = 1 - k * k;
      alpha = Math.min(1, k * 3);
      if (k >= 1) slammed = t - COVER_SHUT[1];
    } else if (openAt !== undefined) {
      const k = (now - openAt) / OPEN_TIME;
      if (k >= 1) return;
      swing = 1 - (1 - k) ** 2;
      alpha = 1 - k * k;
    }
    // A little rebound just after it slams shut.
    if (slammed !== null && slammed < 0.4) swing = 0.06 * Math.exp(-9 * slammed) * Math.abs(Math.sin(slammed * 20));
    const w = x1 - x0;
    const y = board.lidY - 12;
    const h = 22;
    const hingeX = x0 + 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(hingeX, y + h / 2);
    ctx.rotate(-swing * COVER_SWING);
    ctx.translate(-hingeX, -(y + h / 2));
    // The glass: clear with a faint blue tint, a bright rim and a dark outline.
    const glass = ctx.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, 'rgba(230, 246, 255, 0.55)');
    glass.addColorStop(1, 'rgba(170, 214, 240, 0.25)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(x0 - 2, y, w + 4, h, [12, 12, 6, 6]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 60, 90, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x0 + 1, y + 2, w - 2, h - 4, [10, 10, 4, 4]);
    ctx.stroke();
    // Shine streaks across the glass.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.22, y + h - 5);
    ctx.lineTo(x0 + w * 0.32, y + 5);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.36, y + h - 6);
    ctx.lineTo(x0 + w * 0.42, y + 6);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // The hinge.
    ctx.fillStyle = '#5b6573';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x0 - 4, y + h / 2 - 6, 10, 12, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // A glint off the glass as it slams shut.
    if (slammed !== null && slammed < 0.25) twinkles((x0 + x1) / 2, y + h / 2, w * 0.4, now * 3, 3, '#ffffff');
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

  // A member dropped again: a golden halo pulsing round them behind a turning ring of sharp
  // spikes, to say they will burst whoever is in their way. Drawn under the ball.
  function drawCharge(b, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 9);
    const halo = ctx.createRadialGradient(b.cx, b.cy, b.R * 0.8, b.cx, b.cy, b.R * (1.7 + 0.2 * pulse));
    halo.addColorStop(0, 'rgba(255, 190, 60, 0.8)');
    halo.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.R * 2, 0, Math.PI * 2);
    ctx.fill();
    const spikes = 14;
    const turn = now * 1.8;
    const base = b.R - 2;
    const tip = b.R + 20 + 4 * pulse;
    const half = Math.PI / spikes;
    ctx.beginPath();
    for (let i = 0; i < spikes; i++) {
      const a = turn + (i / spikes) * Math.PI * 2;
      ctx.moveTo(b.cx + Math.cos(a - half) * base, b.cy + Math.sin(a - half) * base);
      ctx.lineTo(b.cx + Math.cos(a) * tip, b.cy + Math.sin(a) * tip);
      ctx.lineTo(b.cx + Math.cos(a + half) * base, b.cy + Math.sin(a + half) * base);
    }
    const steel = ctx.createRadialGradient(b.cx, b.cy, base, b.cx, b.cy, tip);
    steel.addColorStop(0, '#ffe08a');
    steel.addColorStop(1, '#ff7a1a');
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineJoin = 'miter';
  }

  // Twinkles over a glowing member, drawn on top of the ball.
  function drawChargeSparkles(b, now) {
    twinkles(b.cx, b.cy, b.R * 1.25, now * 1.4 + b.id, 7, '#fff3b0');
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

  return { open, press, drawTriggerSlot, drawSprings, drawCharge, drawChargeSparkles, drawBanner };
}
