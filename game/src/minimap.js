// The minimap: a 2D canvas in the corner of the HUD. Roads, the seven
// district names, the places (clinic, auto shop, gun shop, safehouse,
// garage), the mission marker, police blips, the helicopter, and the
// player arrow — everything a driver needs to read the city at a glance.
import { DISTRICTS, PLACES, ROAD_SPACING, WORLD_HALF } from './config.js';

const SIZE = 220;

export function createMinimap(canvas) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  function toMap(x, z) {
    return {
      x: ((x + WORLD_HALF) / (WORLD_HALF * 2)) * SIZE,
      y: ((z + WORLD_HALF) / (WORLD_HALF * 2)) * SIZE,
    };
  }

  function draw(S) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(12, 18, 28, 0.82)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // District tint blocks.
    for (const d of DISTRICTS) {
      const a = toMap(d.x0, d.z0);
      const b = toMap(d.x1, d.z1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    // Roads.
    ctx.strokeStyle = 'rgba(200, 205, 215, 0.55)';
    ctx.lineWidth = 2;
    for (let i = -5; i <= 5; i += 1) {
      const p = toMap(i * ROAD_SPACING, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, SIZE);
      ctx.stroke();
      const q = toMap(0, i * ROAD_SPACING);
      ctx.beginPath();
      ctx.moveTo(0, q.y);
      ctx.lineTo(SIZE, q.y);
      ctx.stroke();
    }
    // District names, small and faint — first word only, so neighbours
    // never collide on the small map.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const c = toMap((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2);
      ctx.fillText(d.name.split(' ')[0].toUpperCase(), c.x, c.y);
    }
    // Places.
    for (const place of PLACES) {
      const p = toMap(place.x, place.z);
      ctx.fillStyle = place.kind === 'safehouse' ? '#2ecc71' : place.kind === 'garage' ? '#f39c12' : '#e74c3c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.fillText(place.kind === 'safehouse' ? 'H' : place.kind === 'garage' ? 'G' : '$', p.x, p.y + 3);
    }
    // Mission marker: a pulsing yellow diamond.
    const obj = S.job && S.job.objectives[S.objectiveIndex];
    if (obj && typeof obj.x === 'number') {
      const p = toMap(obj.x, obj.z);
      const pulse = 5 + Math.sin(S.time * 5) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - pulse);
      ctx.lineTo(p.x + pulse, p.y);
      ctx.lineTo(p.x, p.y + pulse);
      ctx.lineTo(p.x - pulse, p.y);
      ctx.closePath();
      ctx.fill();
    }
    // Police blips.
    for (const entry of S.police) {
      const p = toMap(entry.car.x, entry.car.z);
      ctx.fillStyle = '#3d7bff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Helicopter blip.
    if (S.heli && S.heli.active) {
      const p = toMap(S.heli.mesh.position.x, S.heli.mesh.position.z);
      ctx.fillStyle = '#ff5d5d';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('H', p.x, p.y + 4);
    }
    // Player arrow, pointing where the player faces.
    const pp = toMap(S.player.x, S.player.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-S.player.angle + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('N', 6, 14);
  }

  return { draw };
}
