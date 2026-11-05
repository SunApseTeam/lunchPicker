// How the spring trigger looks, for show only: the physics is in domain/round.js.
// The trigger slot is a striped mat with a big round button on its floor, glowing to catch the
// eye. When a member lands on it the button slams flat with a flash and a ring, every slot's
// floor kicks up on its spring and wobbles back, the screen shakes hard and "스프링 발동!"
// pops up across it.
import { hexToRgba } from './themes/art.js';

const BANNER_TIME = 1.4;
const INK = '#1c1d26';

export function createSpringFx(ctx) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // board -> when its button was pressed. Each round's board is its own, so a fresh board
  // starts unpressed.
  const pressedAt = new WeakMap();
  let shake = { at: -10, power: 0 };
  let bannerAt = -10;

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

  // The trigger slot, from x0 to x1: a mat striped in the button's colour, the button on the
  // floor, and a sign under it.
  function drawTriggerSlot(board, theme, now, x0, x1) {
    const { cap, rim, glow } = theme.trigger;
    const at = pressedAt.get(board);
    const since = at === undefined ? null : now - at;
    const top = board.dividerTop - 6;
    const w = x1 - x0;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + 5, top, w - 10, board.height - top, 12);
    ctx.clip();
    ctx.fillStyle = hexToRgba(glow, since === null ? 0.35 + 0.15 * Math.sin(now * 4) : 0.25);
    ctx.fillRect(x0, top, w, board.height - top);
    ctx.strokeStyle = hexToRgba(cap, 0.35);
    ctx.lineWidth = 9;
    for (let k = -board.height; k < w + board.height; k += 26) {
      ctx.beginPath();
      ctx.moveTo(x0 + k, top);
      ctx.lineTo(x0 + k - (board.height - top), board.height);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = cap;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x0 + 5, top, w - 10, board.height - top, 12);
    ctx.stroke();

    // The button: a dome on a ring, standing proud until pressed, then squashed flat.
    const cx = (x0 + x1) / 2;
    const floor = board.floorY;
    const r = Math.min(w / 2 - 14, 46);
    let height;
    if (since === null) height = r * (0.55 + 0.05 * Math.sin(now * 5));
    else if (since < 0.08) height = r * 0.55 * (1 - since / 0.08) + 4;
    else height = 4 + 3 * Math.exp(-6 * since) * Math.abs(Math.sin(since * 30));
    if (since !== null && since < 0.8) {
      const k = since / 0.8;
      if (since < 0.12) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - since / 0.12)})`;
        ctx.beginPath();
        ctx.arc(cx, floor - 10, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = hexToRgba(cap, 0.9 * (1 - k));
      ctx.lineWidth = 12 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(cx, floor - 10, r * (1.2 + 6 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = rim;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - r - 8, floor - 8, (r + 8) * 2, 12, 6);
    ctx.fill();
    ctx.stroke();
    const pressed = since !== null;
    ctx.fillStyle = pressed ? hexToRgba(cap, 0.6) : cap;
    ctx.beginPath();
    ctx.ellipse(cx, floor - 8, r, height, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!pressed) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.35, floor - 8 - height * 0.6, r * 0.28, height * 0.18, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // The sign: what the slot is for.
    const signTop = floor + 8;
    ctx.fillStyle = 'rgba(255, 253, 242, 0.95)';
    ctx.strokeStyle = 'rgba(120, 100, 70, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x0 + 11, signTop, w - 22, board.height - floor - 14, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pressed ? hexToRgba(INK, 0.45) : INK;
    ctx.font = `${Math.min(26, Math.round(w / 5))}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pressed ? '꾹!' : '스프링', cx, signTop + (board.height - floor - 14) / 2);
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
      ctx.fillStyle = hexToRgba(theme.trigger.glow, glowing * 0.6);
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

  // "스프링 발동!" across the screen, popping in and fading out.
  function drawBanner(width, height, theme, now) {
    const t = now - bannerAt;
    if (t > BANNER_TIME) return;
    const text = '스프링 발동!';
    const pop = t < 0.18 ? 0.4 + 0.8 * (t / 0.18) : 1.2 - 0.2 * Math.min(1, (t - 0.18) / 0.2);
    const alpha = t > BANNER_TIME - 0.3 ? (BANNER_TIME - t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2, height * 0.38);
    ctx.scale(pop, pop);
    ctx.rotate(-0.06);
    ctx.font = `${Math.round(Math.min(72, width / 9))}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = theme.trigger.cap;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  return { press, shakeOffset, drawTriggerSlot, drawSprings, drawBanner };
}
