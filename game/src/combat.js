// Combat: three weapons, hitscan shooting from the centre of the screen,
// muzzle flash and tracers, rivals who shoot back, police cars that smoke
// and die. Shooting a cop raises the heat; clearing the guards clears a
// combat objective.
import { TUNING, WEAPONS, dist2 } from './config.js';
import { addWanted } from './police.js';

const THREE = window.THREE;

export function currentWeapon(S) { return WEAPONS[S.weaponIndex]; }

export function switchWeapon(S, index) {
  if (index < 0 || index >= WEAPONS.length) return;
  const weapon = WEAPONS[index];
  if (weapon.id !== 'pistol' && !S.ownedWeapons.includes(weapon.id)) {
    S.banner = `${weapon.name} is not owned yet — buy it at Ammo & Sons`;
    S.bannerTimer = 3;
    return;
  }
  S.weaponIndex = index;
  S.banner = weapon.name;
  S.bannerTimer = 1.5;
}

/** Fire the current weapon at whatever the crosshair covers. */
export function shoot(S) {
  if (S.shootCooldown > 0 || S.screen !== 'play') return;
  const weapon = currentWeapon(S);
  S.shootCooldown = 1 / weapon.rate;
  if (S.audio) S.audio.sfx('shot');
  S.muzzleTimer = 0.07;
  S.shake = Math.max(S.shake, 0.12);
  const pellets = weapon.pellets || 1;
  for (let p = 0; p < pellets; p += 1) {
    firePellet(S, weapon);
  }
}

function firePellet(S, weapon) {
  const origin = { x: S.player.x, z: S.player.z };
  // Aim from the camera: forward on foot, the car's heading while driving.
  const aim = S.player.car ? S.player.car.angle : S.player.angle;
  const spread = (S.rng() - 0.5) * weapon.spread * 4;
  const dirX = Math.sin(aim + spread);
  const dirZ = Math.cos(aim + spread);
  let best = null;
  let bestD = weapon.range;
  // Rivals first.
  for (const r of S.rivals) {
    if (r.dead) continue;
    const dx = r.x - origin.x;
    const dz = r.z - origin.z;
    const along = dx * dirX + dz * dirZ;
    if (along < 0 || along > bestD) continue;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (side < 2.2) { best = { kind: 'rival', target: r }; bestD = along; }
  }
  // Then police cars.
  for (const entry of S.police) {
    const car = entry.car;
    if (car.dead) continue;
    const dx = car.x - origin.x;
    const dz = car.z - origin.z;
    const along = dx * dirX + dz * dirZ;
    if (along < 0 || along > bestD) continue;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (side < 3) { best = { kind: 'police', target: entry }; bestD = along; }
  }
  const endX = origin.x + dirX * bestD;
  const endZ = origin.z + dirZ * bestD;
  S.spawnTracer(origin.x, origin.z, endX, endZ);
  if (!best) return;
  if (best.kind === 'rival') {
    const r = best.target;
    r.health -= weapon.damage;
    S.spawnSmoke(r.x, r.z, 2);
    if (r.health <= 0 && !r.dead) {
      r.dead = true;
      r.mesh.visible = false;
      S.objectiveDone += 1;
      S.cash += 50;
      if (S.audio) S.audio.sfx('down');
    }
  } else {
    const car = best.target.car;
    car.health -= weapon.damage;
    S.spawnSmoke(car.x, car.z, 3);
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      S.spawnSmoke(car.x, car.z, 10);
      if (S.audio) S.audio.sfx('explosion');
    }
    // Shooting at the police is a crime: the heat rises.
    if (S.shootHeatTimer <= 0) {
      S.shootHeatTimer = 3;
      addWanted(S, 1);
    }
  }
}

/** Rivals walk at the player and shoot back when close enough. */
export function updateCombat(S, dt) {
  S.shootCooldown = Math.max(0, S.shootCooldown - dt);
  S.shootHeatTimer = Math.max(0, S.shootHeatTimer - dt);
  S.muzzleTimer = Math.max(0, S.muzzleTimer - dt);
  for (const r of S.rivals) {
    if (r.dead) continue;
    const dx = S.player.x - r.x;
    const dz = S.player.z - r.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    r.angle = Math.atan2(dx, dz);
    r.mesh.rotation.y = r.angle;
    if (d > 26) {
      r.x += Math.sin(r.angle) * 3.2 * dt;
      r.z += Math.cos(r.angle) * 3.2 * dt;
      r.mesh.position.set(r.x, 0, r.z);
    }
    r.shootTimer -= dt;
    if (r.shootTimer <= 0 && d < 42) {
      r.shootTimer = 1.6 + S.rng();
      S.player.health -= 6;
      S.spawnTracer(r.x, r.z, S.player.x, S.player.z);
      if (S.audio) S.audio.sfx('enemyShot');
      S.damageFlash = Math.max(S.damageFlash, 0.3);
    }
  }
  // Smoking wrecks: a dying police car puffs until it is towed away.
  for (const entry of S.police) {
    const car = entry.car;
    if (!car.dead && car.health < car.maxHealth * 0.4) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.25;
        S.spawnSmoke(car.x, car.z, 1);
      }
    }
  }
}
