import { menuIcon } from '../../domain/icon.js';
import { FRAME, cameraTarget, createCamera, followCamera, onScreen } from './camera.js';

export const SLOT_COLORS = [
  '#ff6b6b', '#ffb347', '#ffe066', '#7bd389', '#4fd1c5', '#5ab8ff',
  '#8c9eff', '#c38bff', '#ff8ad8', '#ff9f7a', '#b5e655', '#5ee7f0',
];
const BALL_COLORS = ['#ffe066', '#4fd1c5', '#ff6b6b', '#8c9eff', '#ff8ad8'];
const INK = '#1c1d26';
const PEG = '#3b3d50';
const MUTED = '#8a8c9c';
const ACCENT = '#f96262';
const PINK = '#ff4d7d';

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
  const flash = new Map();
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

  function drawBoard(board, slotMenus, winners, now) {
    ctx.fillStyle = '#e9e6dd';
    ctx.beginPath();
    ctx.roundRect(-FRAME / 2, -FRAME / 2, board.width + FRAME, board.height + FRAME, 30);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, 0, 0, board.floorY);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f5f3ee');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, board.width, board.floorY);

    ctx.setLineDash([10, 16]);
    ctx.strokeStyle = 'rgba(28, 29, 38, 0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, board.dropY);
    ctx.lineTo(board.width - 40, board.dropY);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < slotMenus.length; i++) {
      const x0 = board.slotEdges[i];
      const x1 = board.slotEdges[i + 1];
      const color = SLOT_COLORS[i % SLOT_COLORS.length];
      const won = winners?.includes(i);
      ctx.fillStyle = hexToRgba(color, won ? 0.5 + 0.2 * Math.sin(now * 8) : 0.14);
      ctx.fillRect(x0, board.dividerTop, x1 - x0, board.floorY - board.dividerTop);
      ctx.fillStyle = hexToRgba(color, won ? 0.95 : 0.35);
      ctx.fillRect(x0, board.floorY, x1 - x0, board.height - board.floorY);
      const max = x1 - x0 - 16;
      let size = 26;
      ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
      while (ctx.measureText(slotMenus[i].name).width > max && size > 16) {
        size -= 2;
        ctx.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
      }
      let label = slotMenus[i].name;
      while (ctx.measureText(label).width > max && label.length > 1) label = label.slice(0, -1);
      if (label !== slotMenus[i].name) label = label.slice(0, -1) + '…';
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = (x0 + x1) / 2;
      const mid = (board.floorY + board.height) / 2;
      // The placeholder slots shown before enough menus are picked have no id and no icon.
      if (slotMenus[i].id) {
        ctx.fillText(label, cx, mid + 16);
        ctx.font = `${Math.min(38, max * 0.55)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.fillText(menuIcon(slotMenus[i]), cx, mid - 18);
      } else {
        ctx.fillText(label, cx, mid);
      }
    }
    ctx.fillStyle = PEG;
    for (const x of board.dividers) {
      ctx.beginPath();
      ctx.roundRect(x - board.dividerHalfWidth, board.dividerTop - board.dividerHalfWidth, board.dividerHalfWidth * 2, board.floorY - board.dividerTop + board.dividerHalfWidth, board.dividerHalfWidth);
      ctx.fill();
    }
    ctx.fillRect(0, board.floorY - 2, board.width, 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, board.width, board.height);
    ctx.clip();
    for (const peg of board.pegs) {
      const glow = Math.max(0, 1 - (now - (flash.get(peg) ?? -10)) / 0.35);
      if (peg.kind === 'bumper') {
        drawBumper(peg, now - (flash.get(peg) ?? -10), now, glow);
        continue;
      }
      if (glow > 0) {
        ctx.fillStyle = hexToRgba(ACCENT, 0.45 * glow);
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.r + 14 * glow, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = glow > 0.5 ? ACCENT : PEG;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // A hit bumper springs: it pops big, then wobbles back while a ring rolls outward.
  // At rest it breathes a little so it reads as something different from a peg.
  function drawBumper(peg, since, now, glow) {
    const spring = since < 1 ? 0.7 * Math.exp(-5 * since) * Math.cos(24 * since) : 0;
    const scale = 1 + spring + 0.06 * Math.sin(now * 3 + peg.x);
    if (since < 0.45) {
      const t = since / 0.45;
      ctx.strokeStyle = hexToRgba(PINK, 0.6 * (1 - t));
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r * (1.6 + 3.4 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hexToRgba(PINK, 0.2 + 0.4 * glow);
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r * 1.9 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(peg.x - peg.r * 0.3 * scale, peg.y - peg.r * 0.35 * scale, peg.r * 0.28 * scale, 0, Math.PI * 2);
    ctx.fill();
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

  function drawBall(b, now) {
    const color = BALL_COLORS[(b.id - 1) % BALL_COLORS.length];
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

  function draw({ board, balls, slotMenus, winners, view, now, dt }) {
    followCamera(camera, cameraTarget(board, view, balls, width, height), dt);
    const s = camera.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (width / 2 - camera.x * s), dpr * (height / 2 - camera.y * s));
    drawBoard(board, slotMenus, winners, now);
    for (const b of balls) drawBall(b, now);
    drawParticles(dt);
  }

  return { resize, draw, onEvent, celebrate, visible: (ball) => onScreen(camera, ball, width, height) };
}
