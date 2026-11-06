import { menuIcon } from '../../domain/icon.js';
import { floorAt } from '../../domain/physics.js';
import { BUBBLE_FONT } from './bench.js';
import { FRAME, cameraTarget, createCamera, followCamera, onScreen } from './camera.js';
import { createGround } from './ground.js';
import { BUTTON, createSpringFx } from './spring-fx.js';
import { hexToRgba } from './themes/art.js';
import { themeById } from './themes/index.js';

export const SLOT_COLORS = [
  '#ff6b6b', '#ffb347', '#ffe066', '#7bd389', '#4fd1c5', '#5ab8ff',
  '#8c9eff', '#c38bff', '#ff8ad8', '#ff9f7a', '#b5e655', '#5ee7f0',
];
const BALL_COLORS = ['#ffe066', '#4fd1c5', '#ff6b6b', '#8c9eff', '#ff8ad8'];
const INK = '#1c1d26';
const MUTED = '#8a8c9c';
const ACCENT = '#f96262';
// Winning slots are gold mats; losing ones plain grey.
const WIN = '#ffc93c';
const LOSE = '#a7a49a';
// There is no board panel: the balls fall over the ground of the chosen map theme (themes/),
// which also draws the pegs, bumpers and side walls, crisper and bigger than anything in the
// ground. The slots are mats: gold ones win and grey ones lose, each with a cream sign under it
// that names the menu a winning slot is holding.
// How far the side walls reach past the board when nothing wider stands above them.
const HEDGE = 90;
// Room under the waiting line for the members' names and the menus they voted for, above where
// thick walls begin.
const NAME_ROOM = 72;

// Measured in simulated rounds: knocks run from about 100 (a graze) to 1000+ (a straight drop
// onto a peg), and the fastest tenth of falling is above 750.
const SCARED_SPEED = 750;
const knockStrength = (speed) => Math.min(1, Math.max(0, (speed - 100) / 800));
const winceTime = (strength) => 0.2 + 0.3 * strength;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = createCamera();
  const ground = createGround();
  const fx = createSpringFx(ctx);
  let theme = themeById('meadow');
  const flash = new Map();
  // slot -> when its lid started closing, so the lid can slide shut.
  const lidAt = new Map();
  const ouch = new WeakMap();
  const particles = [];
  // Clicks on the scene, for show only: the physics never feels them. pokes: peg -> { at, s },
  // how hard it was nudged; ripples spread from where the click landed; jiggles: member id ->
  // when a waiting member was clicked.
  const pokes = new Map();
  const ripples = [];
  const jiggles = new Map();
  // Where each waiting member is drawn along the line: member id -> x, easing toward their spot,
  // so the line slides apart when one is dragged through it.
  const shownX = new Map();
  const POKE_REACH = 200;
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
      if (event.kind === 'bumper') burst(event.target.x, event.target.y, theme.glow, 20, 520);
    } else if (event.type === 'redrop') {
      burst(event.ball.cx, event.ball.cy, MUTED, 24, 320);
    } else if (event.type === 'open' && board) {
      fx.open(board, now);
    } else if (event.type === 'trigger' && board) {
      fx.press(board, now);
      const x = (board.slotEdges[board.triggerSlot] + board.slotEdges[board.triggerSlot + 1]) / 2;
      burst(x, board.floorY - 20, BUTTON.cap, 30, 760);
      burst(x, board.floorY - 20, '#ffffff', 16, 520);
    } else if (event.type === 'spring' && board) {
      for (let i = 0; i < board.slotEdges.length - 1; i++) {
        const x = (board.slotEdges[i] + board.slotEdges[i + 1]) / 2;
        burst(x, board.floorY - 10, BUTTON.cap, 14, 700);
        burst(x, board.floorY - 10, BUTTON.glow, 10, 520);
      }
      for (const b of event.balls) hurt(b, 1100, now);
    }
  }

  // Slots sliding from where they stood to where a shuffle put them: fromX[i] is where slot i's
  // centre was before.
  const SLIDE_TIME = 0.45;
  let slide = null;
  function slideSlots(board, fromX, now) {
    slide = { board, fromX, at: now };
  }
  function slideShift(board, i, now) {
    if (!slide || slide.board !== board || now - slide.at > SLIDE_TIME) return 0;
    const k = (now - slide.at) / SLIDE_TIME;
    const ease = 1 - (1 - k) ** 3;
    return (slide.fromX[i] - (board.slotEdges[i] + board.slotEdges[i + 1]) / 2) * (1 - ease);
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

  // How far a poked peg is swung right now: a quick spring that dies away within a second.
  function wobble(peg, now) {
    const p = pokes.get(peg);
    if (!p) return 0;
    const t = now - p.at;
    if (t > 1) {
      pokes.delete(peg);
      return 0;
    }
    return p.s * Math.exp(-5 * t) * Math.sin(26 * t);
  }

  // Draws fn with the peg swung and swelled by its wobble.
  function wobbled(peg, now, fn) {
    const w = wobble(peg, now);
    if (w === 0) return fn();
    ctx.save();
    ctx.translate(peg.x, peg.y);
    ctx.rotate(w * 0.5);
    ctx.scale(1 + 0.3 * w, 1 + 0.3 * w);
    ctx.translate(-peg.x, -peg.y);
    fn();
    ctx.restore();
  }

  function drawRipples(now) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const t = (now - ripples[i].at) / 0.6;
      if (t >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - t)})`;
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ripples[i].x, ripples[i].y, 20 + POKE_REACH * 0.9 * t, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The other slots of a claimed place dim, and a lid slides in from both sides across their
  // tops, where balls bounce off it.
  function drawLids(world, now) {
    if (!world) return;
    const { board, closed } = world;
    for (const slot of lidAt.keys()) if (!closed.has(slot)) lidAt.delete(slot);
    for (const slot of closed) {
      // The trigger slot has a hatch of its own, drawn with the slot.
      if (slot === board.triggerSlot) continue;
      if (!lidAt.has(slot)) lidAt.set(slot, now);
      const shut = Math.min(1, (now - lidAt.get(slot)) / 0.25);
      const ease = 1 - (1 - shut) ** 3;
      const x0 = board.slotEdges[slot];
      const x1 = board.slotEdges[slot + 1];
      ctx.fillStyle = `rgba(250, 248, 238, ${0.55 * ease})`;
      ctx.fillRect(x0, board.dividerTop, x1 - x0, board.height - board.dividerTop);
      const half = ((x1 - x0) / 2) * ease;
      const mid = (x0 + x1) / 2;
      ctx.fillStyle = theme.wood.fill;
      ctx.strokeStyle = theme.wood.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(mid - half, board.lidY - 8, half * 2, 12, 5);
      ctx.fill();
      ctx.stroke();
    }
  }

  // span: how far the scene reaches sideways (wider than the board when the waiting line is),
  // and wallTop: where the side walls start, just under the waiting line's names.
  function drawBoard(board, slots, winners, world, now, span) {
    drawWalls(board, span);

    ctx.setLineDash([10, 16]);
    ctx.strokeStyle = theme.dropLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, board.dropY);
    ctx.lineTo(board.width - 40, board.dropY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Each slot is a mat, gold when it wins and grey when it loses, over a little cream sign.
    for (let i = 0; i < slots.length; i++) {
      const shift = slideShift(board, i, now);
      const x0 = board.slotEdges[i] + shift;
      const x1 = board.slotEdges[i + 1] + shift;
      const slot = slots[i];
      if (slot.kind === 'trigger') {
        fx.drawTriggerSlot(board, now, x0, x1);
        continue;
      }
      const win = slot.kind === 'win';
      const won = winners?.includes(i);
      const color = win ? WIN : slot.kind === 'lose' ? LOSE : SLOT_COLORS[i % SLOT_COLORS.length];
      const glow = win ? (won ? 0.75 + 0.2 * Math.sin(now * 8) : 0.42 + 0.12 * Math.sin(now * 3 + i)) : 0.26;
      ctx.fillStyle = hexToRgba(color, glow);
      ctx.strokeStyle = hexToRgba(color, 0.95);
      ctx.lineWidth = win ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.roundRect(x0 + 5, board.dividerTop - 6, x1 - x0 - 10, board.height - board.dividerTop + 2, 12);
      ctx.fill();
      ctx.stroke();
      const max = x1 - x0 - 26;
      const cx = (x0 + x1) / 2;
      const mid = (board.floorY + board.height) / 2;
      ctx.fillStyle = won ? '#fffdf2' : 'rgba(255, 253, 242, 0.92)';
      ctx.strokeStyle = win ? 'rgba(190, 140, 20, 0.7)' : 'rgba(120, 100, 70, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x0 + 11, board.floorY + 8, x1 - x0 - 22, board.height - board.floorY - 14, 10);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const emoji = (size) => `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      if (slot.menu) {
        // A winning slot taken: the menu of the ball in it.
        let size = 24;
        ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
        while (ctx.measureText(slot.menu.name).width > max && size > 15) {
          size -= 2;
          ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
        }
        ctx.fillStyle = INK;
        ctx.fillText(fitText(slot.menu.name, max), cx, mid + 16);
        ctx.font = emoji(Math.min(34, max * 0.5));
        ctx.fillText(menuIcon(slot.menu), cx, mid - 17);
      } else if (win) {
        ctx.font = emoji(Math.min(30, max * 0.45));
        ctx.fillText('🏆', cx, mid - 15);
        ctx.font = '400 26px "Black Han Sans", sans-serif';
        ctx.fillStyle = '#b07800';
        ctx.fillText('당첨', cx, mid + 18);
      } else {
        ctx.font = '400 28px "Black Han Sans", sans-serif';
        ctx.fillStyle = slot.kind === 'lose' ? MUTED : INK;
        ctx.fillText(slot.kind === 'lose' ? '꽝' : '?', cx, mid);
      }
    }
    // The floor is a rail dipping into a bowl in every slot; the dividers are its posts.
    ctx.beginPath();
    ctx.moveTo(-4, floorAt(board, 0));
    for (let x = 0; x <= board.width; x += 6) ctx.lineTo(x, floorAt(board, Math.min(x, board.width - 0.01)));
    ctx.lineTo(board.width + 4, floorAt(board, board.width - 0.01));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.wood.ink;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = theme.wood.fill;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = theme.wood.fill;
    ctx.strokeStyle = theme.wood.ink;
    ctx.lineWidth = 2;
    for (const x of board.dividers) {
      const w = board.dividerHalfWidth + 2;
      ctx.beginPath();
      ctx.roundRect(x - w, board.dividerTop - w, w * 2, board.floorY - board.dividerTop + w + 3, [w, w, 2, 2]);
      ctx.fill();
      ctx.stroke();
    }
    drawLids(world, now);
    fx.drawSprings(board, theme, now);

    for (const peg of board.pegs) {
      const glow = Math.max(0, 1 - (now - (flash.get(peg) ?? -10)) / 0.35);
      wobbled(peg, now, () => {
        if (peg.kind === 'bumper') theme.bumper(ctx, peg, now - (flash.get(peg) ?? -10), now, glow);
        else if (peg.kind === 'wall') theme.wallBump(ctx, peg, board, glow);
        else theme.peg(ctx, peg, glow);
      });
    }
    drawRipples(now);
  }

  // The side walls line both sides of the board, from just under the waiting line's names down
  // past the slots. They are as thick as the waiting line reaches past the board, or HEDGE at
  // least. The theme fills them in.
  function drawWalls(board, { lo, hi, wallTop }) {
    const bottom = board.height + FRAME;
    const wall = theme.wall;
    for (const side of [-1, 1]) {
      const inner = side < 0 ? 0 : board.width;
      const far = side < 0 ? Math.min(lo, -HEDGE) : Math.max(hi, board.width + HEDGE);
      const x = Math.min(inner, far);
      const w = Math.abs(far - inner);
      const shoulder = Math.min(40, w / 2);
      const radii = side < 0 ? [18, shoulder, 0, 0] : [shoulder, 18, 0, 0];
      ctx.save();
      ctx.shadowColor = wall.shadow;
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = wall.dark;
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.clip();
      theme.wallTexture(ctx, { inner, side, top: wallTop, bottom, far, w });
      ctx.restore();
      ctx.strokeStyle = wall.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, wallTop, w, bottom - wallTop, radii);
      ctx.stroke();
    }
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
    const since = now - (jiggles.get(spot.member.id) ?? -10);
    const jig = since < 1 ? Math.exp(-5 * since) * Math.sin(30 * since) : 0;
    const hop = (picked ? -Math.abs(Math.sin(now * 5 + spot.x)) * spot.r * 0.18 : 0) - Math.max(0, jig) * spot.r * 0.35;
    const sx = 1 + 0.035 * wave + 0.16 * jig;
    const sy = 1 - 0.035 * wave - 0.16 * jig;
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

  // While the team is on its way: three dots bobbing on the empty ledge.
  function drawLoadingDots(x, y, now) {
    for (let i = 0; i < 3; i++) {
      const bob = Math.max(0, Math.sin(now * 6 - i * 0.8));
      ctx.fillStyle = hexToRgba(INK, 0.35 + 0.4 * bob);
      ctx.beginPath();
      ctx.arc(x + (i - 1) * 26, y - bob * 12, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '700 18px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText('팀원 부르는 중', x, y + 26);
    ctx.fillStyle = INK;
    ctx.fillText('팀원 부르는 중', x, y + 26);
  }

  // A face photo still on its way: an arc chasing round the ball in the member's colour.
  function drawPhotoLoading(ball, color, now) {
    const a = now * 5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ball.cx, ball.cy, ball.R + 6, a, a + Math.PI * 0.6);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // The spots as drawn: each slid part way toward where it stands, and one being dragged held up
  // under the pointer, last so it is drawn over the others.
  function shownSpots(bench, dt) {
    const { spots, dragged } = bench;
    const ease = Math.min(1, dt * 14);
    const shown = spots.map((spot) => {
      const id = spot.member.id;
      if (dragged?.member === spot.member) {
        shownX.set(id, dragged.x);
        return { ...spot, x: dragged.x, y: spot.y - spot.r * 0.3 };
      }
      const from = Number.isFinite(shownX.get(id)) ? shownX.get(id) : spot.x;
      const x = from + (spot.x - from) * ease;
      shownX.set(id, x);
      return { ...spot, x };
    });
    return [...shown.filter((s) => s.member !== dragged?.member), ...shown.filter((s) => s.member === dragged?.member)];
  }

  function drawBench(bench, now, dt, faces) {
    if (!bench) return;
    if (bench.loading) drawLoadingDots(board.width / 2, board.dropY, now);
    // The ones who voted dim the rest only while they wait together; once they drop, the rest cheer.
    const anyPicked = bench.spots.some((s) => !bench.away.has(s.member.id) && bench.voteOf(s.member));
    const spots = shownSpots(bench, dt);
    for (const spot of spots) {
      if (bench.away.has(spot.member.id)) continue;
      const vote = bench.voteOf(spot.member);
      const picked = Boolean(vote);
      const ball = benchBall(spot, now, picked);
      ctx.globalAlpha = anyPicked && !picked ? 0.55 : 1;
      drawBall(ball, now, spot.member, faces);
      ctx.globalAlpha = 1;
      if (faces?.loading(spot.member)) drawPhotoLoading(ball, spot.member.color, now);
      if (picked) {
        drawPickMark(ball, now);
        drawMenuBadge(ball, vote.menu, vote.count);
      }
      ctx.font = `700 ${Math.min(18, Math.round(spot.r * 0.5))}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeText(spot.member.name, spot.x, spot.y + spot.r + 16);
      ctx.fillStyle = picked || !anyPicked ? INK : MUTED;
      ctx.fillText(spot.member.name, spot.x, spot.y + spot.r + 16);
      if (picked) drawMenuTag(vote.menu, spot.x, spot.y + spot.r + 40, bench.step);
    }
    for (const said of bench.speeches) {
      const spot = spots.find((s) => s.member === said.member);
      if (spot) drawBubble(said.line, spot, now - said.at, said.life, bench.bounds, said.member.color);
    }
  }

  // Pops in over the speaker's head and fades out at the end of its life.
  // The bubble is edged in the speaker's colour, like their ball.
  function drawBubble(text, spot, age, life, { lo, hi }, color = INK) {
    const pop = Math.min(1, age / 0.18);
    const scale = 0.6 + 0.4 * (1 - (1 - pop) ** 3);
    const fade = Math.max(0, Math.min(1, (life - age) / 0.3));
    if (fade <= 0) return;
    ctx.font = `700 ${BUBBLE_FONT}px "IBM Plex Sans KR", sans-serif`;
    const w = ctx.measureText(text).width + 30;
    const h = 44;
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Paint over the stroke where the tail joins the box, so the edge runs round both as one.
    ctx.fillStyle = '#fff';
    ctx.fillRect(-8.5, -12.5, 17, 4);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, -h / 2 - 10);
    ctx.restore();
  }

  // A member who voted glows on the line in a pale pastel rainbow with no hard edge: soft puffs of
  // light in rainbow order drifting round them, each twinkling on its own, with little stars
  // glinting among them.
  const GLOW_PUFFS = 12;
  function drawPickMark(b, now) {
    const reach = b.R + 40;
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, reach, 0, Math.PI * 2);
    ctx.arc(b.cx, b.cy, b.R, 0, Math.PI * 2, true);
    ctx.clip();
    const turn = now * 0.6;
    for (let i = 0; i < GLOW_PUFFS; i++) {
      const a = turn + (i / GLOW_PUFFS) * Math.PI * 2;
      const x = b.cx + Math.cos(a) * (b.R + 12);
      const y = b.cy + Math.sin(a) * (b.R + 12);
      const twinkle = 0.5 + 0.5 * Math.sin(now * 5 + i * 2.3);
      const hue = (i / GLOW_PUFFS) * 360;
      const size = 26 + 6 * twinkle;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, size);
      puff.addColorStop(0, `hsla(${hue}, 100%, 82%, ${0.45 + 0.4 * twinkle})`);
      puff.addColorStop(1, `hsla(${hue}, 100%, 88%, 0)`);
      ctx.fillStyle = puff;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    ctx.restore();
    // Glints: small white stars winking on and off round the glow.
    for (let i = 0; i < 4; i++) {
      const phase = (now * 1.3 + i * 0.25) % 1;
      const a = Math.floor(now * 1.3 + i * 0.25) * 2.4 + i * 1.57;
      const d = b.R + 10 + 14 * ((i * 0.37) % 1);
      const size = 7 * Math.sin(phase * Math.PI);
      const x = b.cx + Math.cos(a) * d;
      const y = b.cy + Math.sin(a) * d;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * Math.sin(phase * Math.PI)})`;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x, y, x + size, y);
      ctx.quadraticCurveTo(x, y, x, y + size);
      ctx.quadraticCurveTo(x, y, x - size, y);
      ctx.quadraticCurveTo(x, y, x, y - size);
      ctx.fill();
    }
  }

  // The menu a waiting member voted for, on a little cream tag under their name, cut to fit
  // between them and their neighbours.
  function drawMenuTag(menu, x, y, room) {
    ctx.font = '700 17px "IBM Plex Sans KR", sans-serif';
    const label = fitText(`${menuIcon(menu)} ${menu.name}`, Math.max(60, room - 30));
    const w = ctx.measureText(label).width + 20;
    ctx.fillStyle = '#fffdf2';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, 27, 13.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 14);
  }

  // The menu a ball stands for, on a round badge at its shoulder, with how many balls the member
  // put on it when more than one.
  function drawMenuBadge(b, menu, count = 1) {
    if (!menu) return;
    const r = Math.max(15, b.R * 0.36);
    const bx = b.cx + b.R * 0.74;
    const by = b.cy - b.R * 0.74;
    ctx.fillStyle = '#fffdf2';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(r * 1.15)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillStyle = INK;
    ctx.fillText(menuIcon(menu), bx, by + 1);
    if (count < 2) return;
    ctx.font = '700 15px "IBM Plex Sans KR", sans-serif';
    const label = `×${count}`;
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, by + r - 6, w, 19, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx, by + r + 3.5);
  }

  // Screen point (CSS pixels on the canvas) to board coordinates, and back; toScreen also scales
  // a length r.
  function toBoard(sx, sy) {
    return { x: camera.x + (sx - width / 2) / camera.scale, y: camera.y + (sy - height / 2) / camera.scale };
  }
  function toScreen(x, y, r = 0) {
    return { x: (x - camera.x) * camera.scale + width / 2, y: (y - camera.y) * camera.scale + height / 2, r: r * camera.scale };
  }

  let board = null;
  function draw({ board: current, world, slots, winners, view, now, dt, bench, memberOf, menuOf, faces, liftOf }) {
    board = current;
    const balls = world?.balls ?? [];
    const span = bench
      ? { ...bench.bounds, wallTop: board.dropY + Math.max(...bench.spots.map((p) => p.r), bench.spots.length ? 0 : bench.radius) + NAME_ROOM }
      : { lo: 0, hi: board.width, wallTop: 0 };
    followCamera(camera, cameraTarget(board, { ...view, span: span.hi - span.lo }, balls, width, height), dt);
    const s = camera.scale;
    const cam = camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ground.draw(ctx, { theme, width, height, dpr, now, cam, board });
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (width / 2 - cam.x * s), dpr * (height / 2 - cam.y * s));
    drawBoard(board, slots, winners, world, now, span);
    drawBench(bench, now, dt, faces);
    // A member who jumped in from the ledge is drawn easing over from where they stood.
    const lifted = (b, fn) => {
      const lift = liftOf?.(b, now);
      if (!lift) return fn();
      ctx.save();
      ctx.translate(lift.x, lift.y);
      fn();
      ctx.restore();
    };
    for (const b of balls) {
      lifted(b, () => {
        if (b.charged) fx.drawCharge(b, now);
        drawBall(b, now, memberOf?.(b), faces);
        if (b.charged) fx.drawChargeSparkles(b, now);
        drawMenuBadge(b, menuOf?.(b));
      });
    }
    // Falling members' lines go over every ball, so no ball hides another one's bubble.
    const all = { lo: Math.min(0, bench?.bounds.lo ?? 0), hi: Math.max(board.width, bench?.bounds.hi ?? 0) };
    for (const b of balls) {
      const said = bench?.shoutOf(memberOf?.(b), now);
      if (said) lifted(b, () => drawBubble(said.line, { x: b.cx, y: b.cy, r: b.R }, now - said.at, said.life, all, said.member.color));
    }
    drawParticles(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.drawBanner(width, height, now);
  }

  // A click on the scene at screen point (sx, sy): a ripple, a puff of petals, and the flowers,
  // blossoms and bushes nearby swing, the nearer the harder.
  function poke(sx, sy, now) {
    if (!board) return;
    const p = toBoard(sx, sy);
    ripples.push({ ...p, at: now });
    for (const peg of board.pegs) {
      const d = Math.hypot(peg.x - p.x, peg.y - p.y);
      if (d < POKE_REACH) pokes.set(peg, { at: now, s: 1 - d / POKE_REACH });
    }
    burst(p.x, p.y, theme.poke[0], 6, 260);
    burst(p.x, p.y, theme.poke[1], 6, 260);
  }

  // A waiting member clicked gives a springy hop.
  function jiggle(member, now) {
    jiggles.set(member.id, now);
  }

  function setTheme(id) {
    theme = themeById(id);
  }

  return { resize, draw, onEvent, celebrate, slideSlots, toBoard, toScreen, poke, jiggle, setTheme, visible: (ball) => onScreen(camera, ball, width, height) };
}
