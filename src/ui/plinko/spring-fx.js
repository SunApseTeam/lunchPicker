// How the trigger slot looks, for show only: the physics is in domain/round.js.
// The trigger slot is a dark pit with a red button on its floor and nothing to say what it does.
// It starts shut under a hazard-striped hatch, which slides open once the first member lands in
// another slot. When the button is pressed it slams flat with a flash and a ring, every slot's
// floor kicks up on its spring and wobbles back, the screen shakes hard and "혼란!" pops up
// across it. From then on the slot is dead: the button grey and sunk, the light out, and caution
// tape crossed over it.
import { hexToRgba } from './themes/art.js';

const BANNER_TIME = 1.4;
const INK = '#1c1d26';
// The button is red on every map: it should look like something you must not press.
export const BUTTON = { cap: '#e3262b', rim: '#6e0d10', glow: '#ff4d42' };
const HAZARD = ['#ffc61a', '#1c1d26'];
const DEAD = { cap: '#8a8a8f', rim: '#4a4a50' };
const OPEN_TIME = 0.35;
const TAPE_AT = 0.9;

export function createSpringFx(ctx) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // board -> when its hatch opened and when its button was pressed. Each round's board is its
  // own, so a fresh board starts shut and unpressed.
  const openedAt = new WeakMap();
  const pressedAt = new WeakMap();
  let shake = { at: -10, power: 0 };
  let bannerAt = -10;

  function open(board, now) {
    openedAt.set(board, now);
  }

  function press(board, now) {
    pressedAt.set(board, now);
    shake = { at: now, power: 26 };
    bannerAt = now;
  }

  // How far the view is jolted right now, in screen pixels.
  function shakeOffset(now) {
    const t = now - shake.at;
    if (still || t > 0.7) return { x: 0, y: 0 };
    const a = shake.power * Math.exp(-7 * t);
    return { x: a * Math.sin(t * 83), y: a * Math.cos(t * 67) };
  }

  // Diagonal yellow and black stripes filling a rounded box.
  function hazard(x, y, w, h, radius, colors = HAZARD) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = colors[0];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors[1];
    for (let k = -h; k < w + h; k += 28) {
      ctx.beginPath();
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k + 14, y);
      ctx.lineTo(x + k + 14 - h, y + h);
      ctx.lineTo(x + k - h, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke();
  }

  // The trigger slot, from x0 to x1: a dark pit, the button on its floor, a striped plate under
  // it, and the hatch over it until it opens. Once pressed it goes dead and is taped off.
  function drawTriggerSlot(board, now, x0, x1) {
    const at = pressedAt.get(board);
    const since = at === undefined ? null : now - at;
    const pressed = since !== null;
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
      glow.addColorStop(0, hexToRgba(BUTTON.glow, 0.25 + 0.45 * throb));
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
    const r = Math.min(w / 2 - 14, 46);
    let height;
    if (!pressed) height = r * (0.55 + 0.05 * Math.sin(now * 5));
    else if (since < 0.08) height = r * 0.55 * (1 - since / 0.08) + 4;
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

    // The plate under the floor: hazard stripes and nothing else, greyed once it is dead.
    const plateH = board.height - floor - 14;
    hazard(x0 + 11, floor + 8, w - 22, plateH, 10, pressed ? ['#9a9aa0', '#55555c'] : HAZARD);

    if (pressed && since > TAPE_AT) drawTape(board, since - TAPE_AT, x0, x1);
    drawHatch(board, now, x0, x1);
  }

  // Two strips of caution tape slapped across the dead slot in an X.
  function drawTape(board, t, x0, x1) {
    const top = board.dividerTop + 10;
    const bottom = board.height - 10;
    const strips = [
      [x0 + 8, top, x1 - 8, bottom],
      [x1 - 8, top, x0 + 8, bottom],
    ];
    strips.forEach(([ax, ay, bx, by], i) => {
      const k = Math.min(1, Math.max(0, (t - i * 0.12) / 0.15));
      if (k === 0) return;
      const ex = ax + (bx - ax) * k;
      const ey = ay + (by - ay) * k;
      const len = Math.hypot(ex - ax, ey - ay);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(by - ay, bx - ax));
      hazard(-6, -11, len + 12, 22, 3);
      ctx.restore();
    });
  }

  // The hatch: a striped steel plate over the slot's mouth, sliding apart once it opens.
  function drawHatch(board, now, x0, x1) {
    const at = openedAt.get(board);
    const k = at === undefined ? 0 : Math.min(1, (now - at) / OPEN_TIME);
    if (k >= 1) return;
    const ease = 1 - (1 - k) ** 3;
    const w = x1 - x0;
    const half = (w / 2) * (1 - ease);
    const y = board.lidY - 10;
    ctx.fillStyle = 'rgba(20, 20, 24, 0.35)';
    ctx.fillRect(x0 + 5, board.dividerTop, w - 10, board.floorY - board.dividerTop);
    if (half < 1) return;
    hazard(x0, y, half, 16, 4);
    hazard(x1 - half, y, half, 16, 4);
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

  return { open, press, shakeOffset, drawTriggerSlot, drawSprings, drawBanner };
}
