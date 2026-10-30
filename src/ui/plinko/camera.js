// Camera in board coordinates: (x, y) is the board point at the screen centre.
export const FRAME = 30;
const FOLLOW_RATE = 7;
const SLOWMO_ZOOM = 1.3;

export function createCamera() {
  return { x: 0, y: 0, scale: 1, ready: false };
}

// idle: the whole board, so everyone sees which menu sits in which slot.
// running: full width, following the balls down, a little closer in slow motion. When balls
// spread apart the camera pulls back to frame all of them.
// result: full width, parked on the slots.
export function cameraTarget(board, view, balls, width, height) {
  const fitWidth = width / (board.width + FRAME * 2);
  const fitAll = Math.min(fitWidth, height / (board.height + FRAME * 2));
  if (view.mode === 'idle' || fitAll >= fitWidth) return { x: board.width / 2, y: board.height / 2, scale: fitAll };
  const clamp = (scale) => {
    const halfW = width / (2 * scale);
    const halfH = height / (2 * scale);
    return {
      x: (x) => (halfW * 2 >= board.width + FRAME * 2 ? board.width / 2 : Math.min(Math.max(x, halfW - FRAME), board.width - halfW + FRAME)),
      y: (y) => (halfH * 2 >= board.height + FRAME * 2 ? board.height / 2 : Math.min(Math.max(y, halfH - FRAME), board.height - halfH + FRAME)),
    };
  };
  if (view.mode === 'result' || balls.length === 0) return { x: board.width / 2, y: clamp(fitWidth).y(board.height), scale: fitWidth };

  const margin = balls[0].R + 70;
  const left = Math.min(...balls.map((b) => b.cx)) - margin;
  const right = Math.max(...balls.map((b) => b.cx)) + margin;
  const top = Math.min(...balls.map((b) => b.cy)) - margin;
  const bottom = Math.max(...balls.map((b) => b.cy)) + margin;
  const wanted = fitWidth * (view.slowmo ? SLOWMO_ZOOM : 1);
  const scale = Math.max(fitAll, Math.min(wanted, width / (right - left), height / (bottom - top)));
  const c = clamp(scale);
  // A lone ball gets a little look-ahead below it; a spread group is centred on its box.
  const lookAhead = Math.max(0, Math.min(80, height / (2 * scale) - (bottom - top) / 2));
  return { x: scale > fitWidth ? c.x((left + right) / 2) : board.width / 2, y: c.y((top + bottom) / 2 + lookAhead), scale };
}

// Eased so the view never jumps; quick enough that a ball is only briefly off screen.
export function followCamera(camera, target, dt) {
  if (!camera.ready) Object.assign(camera, target, { ready: true });
  const k = 1 - Math.exp(-FOLLOW_RATE * dt);
  camera.x += (target.x - camera.x) * k;
  camera.y += (target.y - camera.y) * k;
  camera.scale += (target.scale - camera.scale) * k;
}

export function onScreen(camera, ball, width, height) {
  const sx = width / 2 + (ball.cx - camera.x) * camera.scale;
  const sy = height / 2 + (ball.cy - camera.y) * camera.scale;
  const r = ball.R * camera.scale;
  return sx - r >= 0 && sx + r <= width && sy - r >= 0 && sy + r <= height;
}
