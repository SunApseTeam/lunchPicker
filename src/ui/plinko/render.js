import { menuIcon } from '../../domain/icon.js';
import { BUBBLE_FONT } from './bench.js';
import { FRAME, cameraTarget, createCamera, followCamera, onScreen } from './camera.js';
import { createMeadow } from './meadow.js';

export const SLOT_COLORS = [
  '#ff6b6b', '#ffb347', '#ffe066', '#7bd389', '#4fd1c5', '#5ab8ff',
  '#8c9eff', '#c38bff', '#ff8ad8', '#ff9f7a', '#b5e655', '#5ee7f0',
];
const BALL_COLORS = ['#ffe066', '#4fd1c5', '#ff6b6b', '#8c9eff', '#ff8ad8'];
const INK = '#1c1d26';
const MUTED = '#8a8c9c';
const ACCENT = '#f96262';
const PINK = '#ff4d7d';
// There is no board panel: the balls fall through the meadow. Pegs are little flowers, bumpers
// pink blossoms, the side walls hedges, the dividers fence posts and the slots picnic mats, all
// inked like the meadow but crisper and bigger than anything in it.
const LEAF = '#8cc46c';
const LEAF_LIGHT = '#a9d88a';
const LEAF_DARK = '#679c4b';
const OUTLINE = 'rgba(80, 110, 58, 0.8)';
const PETAL_INK = 'rgba(120, 110, 80, 0.6)';
const WOOD = '#c8955f';
const WOOD_INK = '#8a5f38';
// How far the side hedges reach past the board when nothing wider stands above them.
const HEDGE = 90;
// Room under the waiting line for the members' names, above where thick walls begin.
const NAME_ROOM = 46;

// Measured in simulated rounds: knocks run from about 100 (a graze) to 1000+ (a straight drop
// onto a peg), and the fastest tenth of falling is above 750.
const SCARED_SPEED = 750;
const knockStrength = (speed) => Math.min(1, Math.max(0, (speed - 100) / 800));
const winceTime = (strength) => 0.2 + 0.3 * strength;

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = createCamera();
  const meadow = createMeadow();
  const flash = new Map();
  // slot -> when its lid started closing, so the lid can slide shut.
  const lidAt = new Map();
  const ouch = new WeakMap();
  const particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 1, color, size: 4 + Math.random() * 5 });
    }
  }

  // A softer knock never cuts a bigger wince short.
  function hurt(ball, speed, now) {
    const strength = knockStrength(speed);
    const prev = ouch.get(ball);
    if (prev && now - prev.at < winceTime(prev.strength) && prev.strength > strength) return;
    ouch.set(ball, { at: now, strength });
  }

  function onEvent(event, now) {
    if (event.type === 'hit') {
      hurt(event.ball, event.speed, now);
      // Ball-on-ball knocks (plain contact or a slot bounce) hurt both.
      if (event.target?.pts) hurt(event.target, event.speed, now);
      if (event.target) flash.set(event.target, now);
      if (event.kind === 'bumper') burst(event.target.x, event.target.y, PINK, 20, 520);
    } else if (event.type === 'redrop') {
      burst(event.ball.cx, event.ball.cy, MUTED, 24, 320);
    }
  }

  function celebrate(board, slots) {
    for (const slot of slots) {
      const x = (board.slotEdges[slot] + board.slotEdges[slot + 1]) / 2;
      for (let i = 0; i < 4; i++) burst(x, board.floorY - 40, SLOT_COLORS[(slot + i * 3) % SLOT_COLORS.length], 18, 760);
    }
  }

  // Cuts text to fit the width in the current font, ending it with an ellipsis.
  function fitText(text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  // The other slots of a claimed place dim, and a lid slides in from both sides across their
  // tops, where balls bounce off it.
  function drawLids(world, now) {
    if (!world) return;
    const { board, closed } = world;
    for (const slot of lidAt.keys()) if (!closed.has(slot)) lidAt.delete(slot);
    for (const slot of closed) {
      if (!lidAt.has(slot)) lidAt.set(slot, now);
      const shut = Math.min(1, (now - lidAt.get(slot)) / 0.25);
      const ease = 1 - (1 - shut) ** 3;
      const x0 = board.slotEdges[slot];
      const x1 = board.slotEdges[slot + 1];
      ctx.fillStyle = `rgba(250, 248, 238, ${0.55 * ease})`;
      ctx.fillRect(x0, board.dividerTop, x1 - x0, board.height - board.dividerTop);
      const half = ((x1 - x0) / 2) * ease;
      const mid = (x0 + x1) / 2;
      ctx.fillStyle = WOOD;
      ctx.strokeStyle = WOOD_INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(mid - half, board.lidY - 8, half * 2, 12, 5);
      ctx.fill();
      ctx.stroke();
    }
  }

  // span: how far the scene reaches sideways (wider than the board when the waiting line is),
  // and wallTop: where the hedges start, just under the waiting line's names.
  function drawBoard(board, slotMenus, winners, world, now, span) {
    drawHedges(board, span);

    ctx.setLineDash([10, 16]);
    ctx.strokeStyle = 'rgba(80, 110, 58, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, board.dropY);
    ctx.lineTo(board.width - 40, board.dropY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Each slot is a picnic mat in its colour, with the place's name on a little cream sign.
    for (let i = 0; i < slotMenus.length; i++) {
      const x0 = board.slotEdges[i];
      const x1 = board.slotEdges[i + 1];
      const color = SLOT_COLORS[i % SLOT_COLORS.length];
      const won = winners?.includes(i);
      ctx.fillStyle = hexToRgba(color, won ? 0.6 + 0.2 * Math.sin(now * 8) : 0.32);
      ctx.strokeStyle = hexToRgba(color, 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x0 + 5, board.dividerTop - 6, x1 - x0 - 10, board.height - board.dividerTop + 2, 12);
      ctx.fill();
      ctx.stroke();
      const max = x1 - x0 - 26;
      let size = 26;
      ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
      while (ctx.measureText(slotMenus[i].name).width > max && size > 16) {
        size -= 2;
        ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
      }
      const label = fitText(slotMenus[i].name, max);
      const cx = (x0 + x1) / 2;
      const mid = (board.floorY + board.height) / 2;
      const tags = slotMenus[i].tags ?? [];
      ctx.fillStyle = won ? '#fffdf2' : 'rgba(255, 253, 242, 0.92)';
      ctx.strokeStyle = 'rgba(120, 100, 70, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x0 + 11, board.floorY + 8, x1 - x0 - 22, board.height - board.floorY - 14, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // The placeholder slots shown before enough menus are picked have no id and no icon.
      if (slotMenus[i].id) {
        // Tags take a third line under the name, so the icon and name move up to make room.
        const lift = tags.length > 0 ? 10 : 0;
        ctx.fillText(label, cx, mid + 16 - lift);
        if (tags.length > 0) {
          ctx.font = '500 15px "IBM Plex Sans KR", sans-serif';
          ctx.fillStyle = 'rgba(28, 29, 38, 0.62)';
          ctx.fillText(fitText(tags.map((t) => `#${t}`).join(' '), max), cx, mid + 31);
        }
        ctx.font = `${Math.min(38, max * 0.55)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.fillText(menuIcon(slotMenus[i]), cx, mid - 18 - lift);
      } else {
        ctx.fillText(label, cx, mid);
      }
    }
    // The floor is a fence rail; the dividers are its posts.
    ctx.fillStyle = WOOD;
    ctx.strokeStyle = WOOD_INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-4, board.floorY - 3, board.width + 8, 6, 3);
    ctx.fill();
    ctx.stroke();
    for (const x of board.dividers) {
      const w = board.dividerHalfWidth + 2;
      ctx.beginPath();
      ctx.roundRect(x - w, board.dividerTop - w, w * 2, board.floorY - board.dividerTop + w + 3, [w, w, 2, 2]);
      ctx.fill();
      ctx.stroke();
    }
    drawLids(world, now);

    for (const peg of board.pegs) {
      const glow = Math.max(0, 1 - (now - (flash.get(peg) ?? -10)) / 0.35);
      if (peg.kind === 'bumper') drawBumper(peg, now - (flash.get(peg) ?? -10), now, glow);
      else if (peg.kind === 'wall') drawBushPuff(peg, board, glow);
      else drawFlowerPeg(peg, glow);
    }
  }

  // A peg is a little white flower with a dark-inked rim; a knock blushes it pink for a moment.
  function drawFlowerPeg(peg, glow) {
    const { x, y, r } = peg;
    if (glow > 0) {
      ctx.fillStyle = hexToRgba(PINK, 0.3 * glow);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5 + 12 * glow, 0, Math.PI * 2);
      ctx.fill();
    }
    const turn = x * 0.37 + y * 0.11;
    ctx.fillStyle = 'rgba(60, 90, 40, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, r * 1.3, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = PETAL_INK;
    ctx.fillStyle = glow > 0.3 ? '#ffc4d4' : '#ffffff';
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.64, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function tinyFlower(x, y, p, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = PETAL_INK;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * p * 0.8, y + Math.sin(a) * p * 0.8, p * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(x, y, p * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leafy puffs filling a shape already set as the clip, laid in staggered rows from `inner`.
  function leaves(inner, side, top, bottom, far) {
    const step = 34;
    let row = 0;
    for (let yy = top + 12; yy < bottom + step; yy += step * 0.8, row++) {
      for (let xx = inner + side * (row % 2 ? step * 0.5 : 0); side < 0 ? xx > far - step : xx < far + step; xx += side * step) {
        ctx.fillStyle = (row + Math.round(xx / step)) % 3 === 0 ? LEAF_LIGHT : LEAF;
        ctx.beginPath();
        ctx.arc(xx, yy, step * 0.58, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 110, 58, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(xx, yy, step * 0.58, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }
  }

  // Hedges line both sides of the board, from just under the waiting line's names down past the
  // slots. They are as thick as the waiting line reaches past the board, or HEDGE at least.
  function drawHedges(board, { lo, hi, wallTop }) {
    const bottom = board.height + FRAME;
    for (const side of [-1, 1]) {
      const inner = side < 0 ? 0 : board.width;
      const far = side < 0 ? Math.min(lo, -HEDGE) : Math.max(hi, board.width + HEDGE);
      const x = Math.min(inner, far);
      const w = Math.abs(far - inner);
      const shoulder = Math.min(40, w / 2);
      const radii = side < 0 ? [18, shoulder, 0, 0] : [shoulder, 18, 0, 0];
      ctx.save();
      ctx.shadowColor = 'rgba(40, 70, 28, 0.35)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = LEAF_DARK;
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.clip();
      leaves(inner, side, wallTop, bottom, far);
      let n = 0;
      for (let yy = wallTop + 50; yy < bottom - 20; yy += 70) {
        tinyFlower(inner + side * (16 + ((n * 37) % Math.max(1, w - 30))), yy, 4.5, ['#ffffff', '#f7c6d9', '#cdb8f0'][n % 3]);
        n++;
      }
      ctx.restore();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.stroke();
    }
  }

  // A wall bump is a round bush pushing out of the hedge into the board.
  function drawBushPuff(peg, board, glow) {
    const { x, y, r } = peg;
    const side = x <= 0 ? -1 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(side < 0 ? -1 : board.width - r - 2, y - r - 4, r + 3, r * 2 + 8);
    ctx.clip();
    ctx.fillStyle = LEAF_DARK;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LEAF;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexToRgba('#c6eba8', 0.65 + 0.35 * glow);
    ctx.beginPath();
    ctx.ellipse(x - side * r * 0.35, y - r * 0.32, r * 0.32, r * 0.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.stroke();
    tinyFlower(x - side * r * 0.5, y + r * 0.25, 4, '#ffffff');
    ctx.restore();
  }

  // A bumper is a pink blossom. A hit springs it: it pops big, then wobbles back while a ring
  // rolls outward. At rest it breathes and turns a little so it reads as something to aim for.
  function drawBumper(peg, since, now, glow) {
    const spring = since < 1 ? 0.7 * Math.exp(-5 * since) * Math.cos(24 * since) : 0;
    const scale = 1 + spring + 0.06 * Math.sin(now * 3 + peg.x);
    const r = peg.r * scale;
    if (since < 0.45) {
      const t = since / 0.45;
      ctx.strokeStyle = hexToRgba(PINK, 0.6 * (1 - t));
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r * (1.6 + 3.4 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hexToRgba(PINK, 0.12 + 0.3 * glow);
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60, 90, 40, 0.18)';
    ctx.beginPath();
    ctx.ellipse(peg.x + 3, peg.y + 6, r * 1.4, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const turn = now * 0.4 + peg.x;
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(200, 70, 115, 0.75)';
    ctx.fillStyle = '#ff9bbb';
    for (let i = 0; i < 8; i++) {
      const a = turn + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(peg.x + Math.cos(a) * r * 0.85, peg.y + Math.sin(a) * r * 0.85, r * 0.55, r * 0.36, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd0de';
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.strokeStyle = PETAL_INK;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function blobPath(pts) {
    const n = pts.length;
    const mid = (i) => ({ x: (pts[i].x + pts[(i + 1) % n].x) / 2, y: (pts[i].y + pts[(i + 1) % n].y) / 2 });
    ctx.beginPath();
    const start = mid(n - 1);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    ctx.closePath();
  }

  // A member's ball wears their photo; anyone else (or a photo not loaded yet) the cartoon face.
  function drawBall(b, now, member, faces) {
    const photo = member && faces?.face(member);
    if (photo) return drawPhotoBall(b, now, member, photo, faces.squish(member));
    const color = member?.color ?? BALL_COLORS[(b.id - 1) % BALL_COLORS.length];
    blobPath(b.pts);
    const g = ctx.createRadialGradient(b.cx - b.R * 0.35, b.cy - b.R * 0.45, b.R * 0.1, b.cx, b.cy, b.R * 1.15);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, color);
    g.addColorStop(1, hexToRgba(color, 0.85));
    ctx.shadowColor = 'rgba(28, 29, 38, 0.22)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 21, 31, 0.35)';
    ctx.stroke();

    drawFace(b, now);
  }

  // The photo is cut into a fan of triangles from the centre to each skin point and each piece is
  // stretched onto its triangle, so the face squashes with the jelly. It turns only a little as
  // the ball rolls, like the cartoon face, so a ball resting upside down still shows a face.
  function drawPhoto(b, img, alpha) {
    const tilt = 0.4 * Math.sin(b.angle);
    const cos = Math.cos(b.angle - tilt);
    const sin = Math.sin(b.angle - tilt);
    const half = img.width / 2;
    const k = half / b.R;
    const uv = b.rest.map((q) => ({ u: half + (q.x * cos - q.y * sin) * k, v: half + (q.x * sin + q.y * cos) * k }));
    const c = { x: b.cx, y: b.cy, u: half, v: half };
    if (alpha <= 0) return;
    ctx.globalAlpha *= alpha;
    for (let i = 0; i < b.pts.length; i++) {
      const j = (i + 1) % b.pts.length;
      drawTriangle(img, c, { ...b.pts[i], ...uv[i] }, { ...b.pts[j], ...uv[j] });
    }
    ctx.globalAlpha /= alpha;
  }

  function drawTriangle(img, p0, p1, p2) {
    const du1 = p1.u - p0.u;
    const dv1 = p1.v - p0.v;
    const du2 = p2.u - p0.u;
    const dv2 = p2.v - p0.v;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-6) return;
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p0.x;
    const dy2 = p2.y - p0.y;
    const a = (dx1 * dv2 - dx2 * dv1) / det;
    const c = (dx2 * du1 - dx1 * du2) / det;
    const b = (dy1 * dv2 - dy2 * dv1) / det;
    const d = (dy2 * du1 - dy1 * du2) / det;
    // Each piece is clipped a hair larger than its triangle so no hairline seams show.
    const mx = (p0.x + p1.x + p2.x) / 3;
    const my = (p0.y + p1.y + p2.y) / 3;
    const grow = (p) => {
      const l = Math.hypot(p.x - mx, p.y - my) || 1;
      return { x: p.x + ((p.x - mx) / l) * 0.8, y: p.y + ((p.y - my) / l) * 0.8 };
    };
    const [q0, q1, q2] = [p0, p1, p2].map(grow);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, p0.x - a * p0.u - c * p0.v, p0.y - b * p0.u - d * p0.v);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function drawPhotoBall(b, now, member, photo, squish) {
    blobPath(b.pts);
    ctx.shadowColor = 'rgba(28, 29, 38, 0.25)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = member.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    blobPath(b.pts);
    ctx.clip();
    drawPhoto(b, photo, 1);
    const { mood, strength = 0 } = moodOf(b, now);
    // The squeezed face fades in with the knock and out as the wince passes.
    if (squish && mood === 'ouch') {
      const o = ouch.get(b);
      const left = 1 - (now - o.at) / winceTime(o.strength);
      drawPhoto(b, squish, Math.min(1, 0.4 + strength) * Math.min(1, left * 3));
    }
    const gloss = ctx.createRadialGradient(b.cx - b.R * 0.4, b.cy - b.R * 0.5, b.R * 0.05, b.cx - b.R * 0.2, b.cy - b.R * 0.3, b.R * 1.1);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    gloss.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(b.cx - b.R * 2, b.cy - b.R * 2, b.R * 4, b.R * 4);
    ctx.restore();
    blobPath(b.pts);
    ctx.lineWidth = Math.max(3, b.R * 0.09);
    ctx.strokeStyle = member.color;
    ctx.stroke();
    if (mood === 'ouch' && strength > 0.55) drawSweat(b.cx + b.R * 0.62, b.cy - b.R * 0.55, b.R * 0.15);
  }

  // A wince after every knock, wide eyes when falling fast, a grin once resting in a slot.
  function moodOf(b, now) {
    const o = ouch.get(b);
    if (o && now - o.at < winceTime(o.strength)) return { mood: 'ouch', strength: o.strength };
    if (b.settled) return { mood: 'happy' };
    if (b.zone === null && Math.hypot(b.vx, b.vy) > SCARED_SPEED) return { mood: 'scared' };
    return { mood: 'calm' };
  }

  function drawFace(b, now) {
    const { mood, strength = 0 } = moodOf(b, now);
    const R = b.R;
    const ex = R * 0.3;
    const ey = -R * 0.08;
    const my = R * 0.26;
    ctx.save();
    ctx.translate(b.cx, b.cy);
    // The face only tilts as the body rolls: a ball resting upside down should still read.
    ctx.rotate(0.4 * Math.sin(b.angle));
    ctx.fillStyle = mood === 'calm' || mood === 'scared' ? 'rgba(255, 107, 107, 0.45)' : 'rgba(255, 77, 125, 0.6)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * R * 0.42, R * 0.12, R * 0.12, R * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * 0.07;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const side of [-1, 1]) {
      const x = side * ex;
      ctx.beginPath();
      if (mood === 'ouch') {
        // > < : each chevron points at the nose.
        const w = R * 0.08;
        const h = R * (0.07 + 0.04 * strength);
        ctx.moveTo(x + side * w, ey - h);
        ctx.lineTo(x - side * w, ey);
        ctx.lineTo(x + side * w, ey + h);
        ctx.stroke();
      } else if (mood === 'happy') {
        ctx.arc(x, ey + R * 0.05, R * 0.09, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (mood === 'scared') {
        ctx.ellipse(x, ey, R * 0.1, R * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + R * 0.03, ey - R * 0.05, R * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
      } else {
        ctx.ellipse(x, ey, R * 0.085, R * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.beginPath();
    if (mood === 'ouch' && strength > 0.55) {
      // Gritted teeth for the hard knocks.
      const w = R * 0.2;
      const h = R * 0.15;
      ctx.roundRect(-w, my - h / 2, w * 2, h, h * 0.4);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = R * 0.05;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w, my);
      ctx.lineTo(w, my);
      for (const tx of [-w / 3, w / 3]) {
        ctx.moveTo(tx, my - h / 2);
        ctx.lineTo(tx, my + h / 2);
      }
      ctx.stroke();
      drawSweat(R * 0.55, -R * 0.42, R * 0.13);
    } else if (mood === 'ouch') {
      const w = R * 0.18;
      const a = R * 0.05;
      ctx.moveTo(-w, my);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-w + (w / 2) * i, my + (i % 2 ? -a : a));
      ctx.stroke();
    } else if (mood === 'happy') {
      ctx.arc(0, my - R * 0.06, R * 0.17, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    } else if (mood === 'scared') {
      ctx.ellipse(0, my + R * 0.02, R * 0.07, R * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(0, my - R * 0.1, R * 0.11, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSweat(x, y, s) {
    ctx.fillStyle = '#5ab8ff';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x + s * 0.7, y, x, y + s * 0.6);
    ctx.quadraticCurveTo(x - s * 0.7, y, x, y - s);
    ctx.fill();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = hexToRgba(p.color, p.life);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  // A waiting member: a still ball that breathes, lifted and ringed when picked for the drop.
  function benchBall(spot, now, picked) {
    const wave = Math.sin(now * 3 + spot.x * 0.05);
    const hop = picked ? -Math.abs(Math.sin(now * 5 + spot.x)) * spot.r * 0.18 : 0;
    const sx = 1 + 0.035 * wave;
    const sy = 1 - 0.035 * wave;
    const cx = spot.x;
    const cy = spot.y + hop + spot.r * (1 - sy);
    const pts = [];
    const rest = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      rest.push({ x: Math.cos(a) * spot.r, y: Math.sin(a) * spot.r });
      pts.push({ x: cx + Math.cos(a) * spot.r * sx, y: cy + Math.sin(a) * spot.r * sy });
    }
    return { id: 0, pts, rest, R: spot.r, cx, cy, angle: 0, vx: 0, vy: 0, zone: null, settled: false };
  }

  function drawBench(bench, now, faces) {
    if (!bench) return;
    // The picked ones dim the rest only while they wait together; once they drop, the rest cheer.
    const anyPicked = bench.spots.some((s) => !bench.away.has(s.member.id) && bench.isSelected(s.member));
    for (const spot of bench.spots) {
      if (bench.away.has(spot.member.id)) continue;
      const picked = bench.isSelected(spot.member);
      const ball = benchBall(spot, now, picked);
      ctx.globalAlpha = anyPicked && !picked ? 0.55 : 1;
      drawBall(ball, now, spot.member, faces);
      ctx.globalAlpha = 1;
      if (picked) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ball.cx, ball.cy, spot.r + 7, 0, Math.PI * 2);
        ctx.stroke();
        const bx = ball.cx + spot.r * 0.72;
        const by = ball.cy - spot.r * 0.72;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(bx, by, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by);
        ctx.lineTo(bx - 1, by + 4);
        ctx.lineTo(bx + 6, by - 4);
        ctx.stroke();
      }
      ctx.font = `700 ${Math.min(22, Math.round(spot.r * 0.6))}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeText(spot.member.name, spot.x, spot.y + spot.r + 16);
      ctx.fillStyle = picked || !anyPicked ? INK : MUTED;
      ctx.fillText(spot.member.name, spot.x, spot.y + spot.r + 16);
    }
    for (const said of bench.speeches) {
      const spot = bench.spots.find((s) => s.member === said.member);
      if (spot) drawBubble(said.line, spot, now - said.at, said.life, bench.bounds);
    }
  }

  // Pops in over the speaker's head and fades out at the end of its life.
  function drawBubble(text, spot, age, life, { lo, hi }) {
    const pop = Math.min(1, age / 0.18);
    const scale = 0.6 + 0.4 * (1 - (1 - pop) ** 3);
    const fade = Math.max(0, Math.min(1, (life - age) / 0.3));
    if (fade <= 0) return;
    ctx.font = `700 ${BUBBLE_FONT}px "IBM Plex Sans KR", sans-serif`;
    const w = ctx.measureText(text).width + 36;
    const h = 54;
    const tipY = spot.y - spot.r - 10;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(spot.x, tipY);
    ctx.scale(scale, scale);
    // Keep the bubble in view: near an edge it slides inward while the tail stays put.
    const x = Math.min(Math.max(-w / 2, lo - spot.x + 8), hi - spot.x - w - 8);
    ctx.shadowColor = 'rgba(28, 29, 38, 0.18)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(x, -h - 10, w, h, 18);
    ctx.moveTo(-10, -11);
    ctx.lineTo(0, 0);
    ctx.lineTo(10, -11);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, -h / 2 - 10);
    ctx.restore();
  }

  // Screen point (CSS pixels on the canvas) to board coordinates.
  function toBoard(sx, sy) {
    return { x: camera.x + (sx - width / 2) / camera.scale, y: camera.y + (sy - height / 2) / camera.scale };
  }

  let board = null;
  function draw({ board: current, world, slotMenus, winners, view, now, dt, bench, memberOf, faces, liftOf }) {
    board = current;
    const balls = world?.balls ?? [];
    const span = bench
      ? { ...bench.bounds, wallTop: board.dropY + Math.max(...bench.spots.map((p) => p.r)) + NAME_ROOM }
      : { lo: 0, hi: board.width, wallTop: 0 };
    followCamera(camera, cameraTarget(board, { ...view, span: span.hi - span.lo }, balls, width, height), dt);
    const s = camera.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    meadow.draw(ctx, { width, height, dpr, now, cam: camera, board });
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (width / 2 - camera.x * s), dpr * (height / 2 - camera.y * s));
    drawBoard(board, slotMenus, winners, world, now, span);
    drawBench(bench, now, faces);
    // A member who jumped in from the ledge is drawn easing over from where they stood.
    const lifted = (b, fn) => {
      const lift = liftOf?.(b, now);
      if (!lift) return fn();
      ctx.save();
      ctx.translate(lift.x, lift.y);
      fn();
      ctx.restore();
    };
    for (const b of balls) lifted(b, () => drawBall(b, now, memberOf?.(b), faces));
    // Falling members' lines go over every ball, so no ball hides another one's bubble.
    const all = { lo: Math.min(0, bench?.bounds.lo ?? 0), hi: Math.max(board.width, bench?.bounds.hi ?? 0) };
    for (const b of balls) {
      const said = bench?.shoutOf(memberOf?.(b), now);
      if (said) lifted(b, () => drawBubble(said.line, { x: b.cx, y: b.cy, r: b.R }, now - said.at, said.life, all));
    }
    drawParticles(dt);
  }

  return { resize, draw, onEvent, celebrate, toBoard, visible: (ball) => onScreen(camera, ball, width, height) };
}
