// Minimap: a small 2D canvas top-right. Walls and site rings always show;
// the player arrow and friendly dots always show; enemy dots show ONLY while
// a bot was recently seen (lastSeen < 4 s ago) — honest fog-of-war, never a
// wallhack. Defensive: with no canvas (node tests) draw() is a no-op.
import { MAP } from './map.js';

const W = 150;
const H = 110;

function project(x, z) {
  return [(x - MAP.bounds.x0) / (MAP.bounds.x1 - MAP.bounds.x0) * W, (z - MAP.bounds.z0) / (MAP.bounds.z1 - MAP.bounds.z0) * H];
}

export function createMinimap(doc, sim) {
  let canvas = null;
  let ctx = null;
  try {
    canvas = doc.getElementById('minimap');
    ctx = canvas ? canvas.getContext('2d') : null;
  } catch (err) {
    ctx = null;
  }

  return {
    draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(14,16,20,0.78)';
      ctx.fillRect(0, 0, W, H);
      // Colliders as wall blocks.
      ctx.fillStyle = '#5a636e';
      for (const box of MAP.colliders) {
        const [x0, z0] = project(box.x0, box.z0);
        const [x1, z1] = project(box.x1, box.z1);
        ctx.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
      }
      // Site rings.
      for (const key of ['A', 'B']) {
        const site = MAP.sites[key];
        const [cx, cy] = project(site.center.x, site.center.z);
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(key, cx, cy + 3);
      }
      // Bomb, when planted.
      if (sim.bomb.state === 'planted' && sim.bomb.pos) {
        const [bx, by] = project(sim.bomb.pos.x, sim.bomb.pos.z);
        ctx.fillStyle = '#e0524d';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bots: friendlies always, enemies only when recently seen.
      for (const entity of sim.entities) {
        if (entity.isPlayer || !entity.alive) continue;
        if (entity.team === 'defend' && (!entity.lastSeen || sim.now - entity.lastSeen.at > 4)) continue;
        const [ex, ey] = project(entity.pos.x, entity.pos.z);
        ctx.fillStyle = entity.team === 'attack' ? '#4da3e0' : '#e0524d';
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player arrow, rotated by yaw.
      const player = sim.player;
      const [px, py] = project(player.pos.x, player.pos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI);
      ctx.fillStyle = '#ece7db';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
