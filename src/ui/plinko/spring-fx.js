// How the spring trigger looks, for show only: the physics is in domain/round.js.
// Before it is pressed the trigger is a little raised button that pulses to catch the eye.
// Pressed, it clicks flat with a flash and a ring, the screen jolts and "스프링 장전!" pops up;
// the slot floors glow, armed. When everyone is down they sink as the springs wind up, then let
// go, kick up and wobble back while the screen shakes hard under "스프링 발동!".
import { hexToRgba } from './themes/art.js';

const SPRING_DELAY = 0.5;
const BANNER_TIME = 1.4;
const INK = '#1c1d26';

export function createSpringFx(ctx) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // trigger object -> when it was pressed, and when its springs let go. Each board has its own
  // trigger, so a fresh board starts unpressed.
  const pressedAt = new WeakMap();
  const windAt = new WeakMap();
  const sprungAt = new WeakMap();
  let shake = { at: -10, power: 0 };
  let banner = { text: '', at: -10 };

  function press(trigger, now) {
    pressedAt.set(trigger, now);
    shake = { at: now, power: 9 };
    banner = { text: '스프링 장전!', at: now };
  }

  function windUp(trigger, now) {
    windAt.set(trigger, now);
  }

  function spring(trigger, now) {
    sprungAt.set(trigger, now);
    shake = { at: now, power: 26 };
    banner = { text: '스프링 발동!', at: now };
  }

  // How far the view is jolted right now, in screen pixels.
  function shakeOffset(now) {
    const t = now - shake.at;
    if (still || t > 0.7) return { x: 0, y: 0 };
    const a = shake.power * Math.exp(-7 * t);
    return { x: a * Math.sin(t * 83), y: a * Math.cos(t * 67) };
  }

  function drawTrigger(board, theme, now) {
    const t = board.trigger;
    if (!t) return;
    const { cap, rim, glow } = theme.trigger;
    const at = pressedAt.get(t);
    const since = at === undefined ? null : now - at;
    if (since === null) {
      // Waiting: a soft pulse and a ring that rolls out now and then.
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      ctx.fillStyle = hexToRgba(glow, 0.25 + 0.25 * pulse);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (2 + 0.4 * pulse), 0, Math.PI * 2);
      ctx.fill();
      const roll = (now % 1.6) / 1.6;
      ctx.strokeStyle = hexToRgba(cap, 0.7 * (1 - roll));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (1.4 + 2.2 * roll), 0, Math.PI * 2);
      ctx.stroke();
    } else if (since < 0.8) {
      // Just pressed: a white flash, then a wide ring in the button's colour.
      const k = since / 0.8;
      if (since < 0.12) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - since / 0.12)})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = hexToRgba(cap, 0.9 * (1 - k));
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (1.5 + 12 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    // The base, and the cap: raised and lit before, pushed flat and dulled after.
    const down = since !== null;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 1, t.y + 4, t.r * 1.45, t.r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rim;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const lift = down ? 0 : 3;
    ctx.fillStyle = down ? hexToRgba(cap, 0.55) : cap;
    ctx.beginPath();
    ctx.arc(t.x, t.y - lift, t.r * (down ? 0.9 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!down) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(t.x - t.r * 0.35, t.y - lift - t.r * 0.35, t.r * 0.35, t.r * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = down ? hexToRgba(INK, 0.5) : INK;
    ctx.font = `900 ${Math.round(t.r * 1.3)}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', t.x, t.y - lift + 1);
  }

  // The slot floors: glowing softly while armed, sinking and flickering as the springs wind up,
  // kicking up and wobbling back once they let go.
  function drawSprings(board, theme, now) {
    const t = board.trigger;
    if (!t || !pressedAt.has(t)) return;
    const wound = windAt.get(t);
    const released = sprungAt.get(t);
    const since = released === undefined ? null : now - released;
    if (since !== null && since > 1.2) return;
    let offset;
    let glowing;
    if (since !== null) {
      offset = -26 * Math.exp(-5 * since) * Math.cos(16 * since);
      glowing = Math.max(0, 0.8 - since);
    } else if (wound !== undefined) {
      const charge = Math.min(1, (now - wound) / SPRING_DELAY);
      offset = 10 * charge;
      glowing = 0.35 + 0.35 * Math.sin(now * 40);
    } else {
      offset = 0;
      glowing = 0.12 + 0.1 * Math.sin(now * 5);
    }
    const { fill, ink } = theme.wood;
    for (let i = 0; i < board.slotEdges.length - 1; i++) {
      const x0 = board.slotEdges[i] + 8;
      const x1 = board.slotEdges[i + 1] - 8;
      const cx = (x0 + x1) / 2;
      const y = board.floorY + offset;
      // The coil under the floor: squashed while winding up, stretched as it lets go.
      const depth = Math.max(8, 30 - offset);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const turns = 6;
      for (let k = 0; k <= turns; k++) {
        const px = cx + (k % 2 === 0 ? -16 : 16);
        const py = y + 4 + (depth * k) / turns;
        if (k === 0) ctx.moveTo(cx, y + 2);
        ctx.lineTo(px, py);
      }
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

  // The banner across the screen, popping in and fading out.
  function drawBanner(width, height, theme, now) {
    const t = now - banner.at;
    if (t > BANNER_TIME) return;
    const text = banner.text;
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

  return { press, windUp, spring, shakeOffset, drawTrigger, drawSprings, drawBanner };
}
