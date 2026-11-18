// The wanted system: police who respond. Stars rise when the player
// steals, shoots or rams; police cars spawn to match the level and hunt
// the player; at 4 stars they throw roadblocks across the road ahead.
// Lose them by breaking line of sight — the level cools down one star at
// a time — or get busted by standing still next to a cop on foot, or by
// wrecking your car.
import { TUNING, WANTED, WANTED_COOLDOWN_SECONDS, clamp, dist2 } from './config.js';
import { computeDriveTo, driveCar, makeCar, removeCar } from './vehicles.js';

/** Raise the wanted level (capped at 5) and spawn the police it needs. */
export function addWanted(S, stars) {
  setWanted(S, Math.min(5, S.wanted + stars));
}

export function setWanted(S, stars) {
  stars = clamp(Math.round(stars), 0, 5);
  if (stars === S.wanted) return;
  S.wanted = stars;
  S.hiddenTimer = 0;
  const want = WANTED[stars];
  // Spawn or remove police cars to match the level.
  while (S.police.length < want.police) {
    const angle = S.rng() * Math.PI * 2;
    const x = S.player.x + Math.sin(angle) * 90;
    const z = S.player.z + Math.cos(angle) * 90;
    const p = S.city.nearestRoadPoint(x, z);
    const car = makeCar(S.scene, p.x, p.z, Math.atan2(S.player.x - p.x, S.player.z - p.z), 0xf2f2f2, 'police');
    car.health = TUNING.copHealth;
    car.maxHealth = TUNING.copHealth;
    S.police.push({ car, ramCooldown: 0, stuck: 0 });
  }
  while (S.police.length > want.police) {
    const gone = S.police.pop();
    removeCar(S.scene, gone.car);
  }
  // Roadblocks only at 4 stars and up; place them when the level is set.
  if (want.roadblock) placeRoadblock(S);
  else clearRoadblock(S);
  if (stars > 0 && S.audio) S.audio.siren(true);
  if (stars === 0 && S.audio) S.audio.siren(false);
}

export function placeRoadblock(S) {
  clearRoadblock(S);
  // 42 units ahead: close enough to read as a wall of police in the
  // frame, far enough that the player has a moment to react.
  const ahead = { x: S.player.x + Math.sin(S.player.angle) * 42, z: S.player.z + Math.cos(S.player.angle) * 42 };
  const p = S.city.nearestRoadPoint(ahead.x, ahead.z);
  for (let i = 0; i < 2; i += 1) {
    const offset = i === 0 ? -6 : 6;
    const car = makeCar(S.scene, p.x + offset, p.z, S.player.angle + Math.PI / 2, 0xf2f2f2, 'police');
    car.speed = 0;
    S.roadblock.push({ car });
  }
  S.roadblockTimer = 20;
}

function clearRoadblock(S) {
  for (const r of S.roadblock) removeCar(S.scene, r.car);
  S.roadblock.length = 0;
}

/** One police car hunts: steer at the last place the player was seen,
 *  ram on contact, flash lights. When it reaches the last-seen spot and
 *  the player is gone, it wanders to a nearby road point instead. */
function updatePoliceCar(S, entry, dt) {
  const car = entry.car;
  if (car.dead) return;
  if (!entry.wander) {
    const dx = S.lastSeen.x - car.x;
    const dz = S.lastSeen.z - car.z;
    if (dx * dx + dz * dz < 144) {
      // Reached the last-seen spot and the player is gone: wander to a
      // nearby road point instead of circling the spot.
      const p = S.city.randomRoadPoint();
      entry.wander = { x: p.x, z: p.z };
    }
  }
  const target = entry.wander || S.lastSeen;
  const d = computeDriveTo(car, target.x, target.z, S.city);
  driveCar(car, { throttle: d.throttle, steer: d.steer, nos: false }, dt, S.city, null);
  const tdx = target.x - car.x;
  const tdz = target.z - car.z;
  if (entry.wander && tdx * tdx + tdz * tdz < 144) entry.wander = null;
  // Flash the light bar: red, then blue.
  car.lightPhase += dt * 6;
  const bar = car.mesh.getObjectByName('lightbar');
  if (bar) bar.material.color.setHex(Math.floor(car.lightPhase) % 2 === 0 ? 0xff2222 : 0x2244ff);
  // Ram: touching the player's car damages it and shoves it.
  entry.ramCooldown = Math.max(0, entry.ramCooldown - dt);
  const dPlayer = Math.sqrt(dist2(car.x, car.z, S.player.x, S.player.z));
  if (dPlayer < 4.5 && entry.ramCooldown <= 0) {
    entry.ramCooldown = 1.2;
    if (S.player.car) {
      S.player.car.health -= TUNING.policeRamDamage;
      S.player.car.speed *= 0.6;
      if (S.audio) S.audio.sfx('crash');
      S.shake = Math.max(S.shake, 0.35);
      if (S.player.car.health <= 0) {
        S.player.car.dead = true;
        S.screen = 'busted';
        S.bustedReason = 'Your car was wrecked by the police.';
      }
    } else {
      // A cop reaching the player on foot starts the bust.
      S.bustTimer += dt * 2;
    }
  }
}

export function updatePolice(S, dt) {
  // Seeing the player: a cop within 60 units, or the helicopter within
  // 60. While seen, the police know exactly where the player is; once
  // unseen they hunt the last-seen spot, so escaping is really possible.
  let seen = false;
  for (const entry of S.police) {
    const d2 = dist2(entry.car.x, entry.car.z, S.player.x, S.player.z);
    if (d2 < 60 * 60) seen = true;
  }
  if (S.heli && S.heli.active) {
    const hd2 = dist2(S.heli.mesh.position.x, S.heli.mesh.position.z, S.player.x, S.player.z);
    if (hd2 < 60 * 60) seen = true;
  }
  S.seen = seen;
  if (seen) {
    S.lastSeen = { x: S.player.x, z: S.player.z };
    for (const entry of S.police) entry.wander = null;
  }
  if (S.wanted > 0) {
    if (seen) S.hiddenTimer = 0;
    else {
      S.hiddenTimer += dt;
      if (S.hiddenTimer >= WANTED_COOLDOWN_SECONDS) {
        setWanted(S, S.wanted - 1);
      }
    }
  }
  // Roadblocks move to stay ahead of the player.
  if (S.roadblock.length > 0) {
    S.roadblockTimer -= dt;
    if (S.roadblockTimer <= 0) placeRoadblock(S);
  }
  for (const entry of S.police) updatePoliceCar(S, entry, dt);
  // Remove wrecked police cars (they smoke, then vanish).
  for (let i = S.police.length - 1; i >= 0; i -= 1) {
    if (S.police[i].car.health <= 0 && !S.police[i].car.dead) {
      S.police[i].car.dead = true;
      S.spawnSmoke(S.police[i].car.x, S.police[i].car.z, 10);
      if (S.audio) S.audio.sfx('explosion');
    }
    if (S.police[i].car.dead) {
      S.police[i].deadTimer = (S.police[i].deadTimer || 0) + dt;
      if (S.police[i].deadTimer > 4) {
        removeCar(S.scene, S.police[i].car);
        S.police.splice(i, 1);
      }
    }
  }
  // Busted on foot: a cop standing on the player for long enough.
  if (!S.player.car && S.wanted > 0) {
    let touching = false;
    for (const entry of S.police) {
      if (dist2(entry.car.x, entry.car.z, S.player.x, S.player.z) < 9) touching = true;
    }
    if (touching) {
      S.bustTimer += dt;
      if (S.bustTimer > 2.5) {
        S.screen = 'busted';
        S.bustedReason = 'Busted by the Port Solera police.';
      }
    } else {
      S.bustTimer = Math.max(0, S.bustTimer - dt);
    }
  }
  if (S.player.health <= 0) {
    S.screen = 'wasted';
    S.bustedReason = 'Wasted on the streets of Port Solera.';
  }
}
