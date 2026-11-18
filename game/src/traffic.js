// Traffic and pedestrians: the life of the city. Traffic cars drive the
// road grid — straight on, turn at intersections — and slow for the car
// ahead. Pedestrians walk the sidewalks, turn at corners, and step aside
// when the player gets close. Both are seeded, so a screenshot seed
// always stages the same street.
import { ROAD_SPACING, TUNING, clamp } from './config.js';
import { driveCar, makeCar, pickColor, removeCar } from './vehicles.js';

const THREE = window.THREE;

function roadCentre(v) { return Math.round(v / ROAD_SPACING) * ROAD_SPACING; }

/** One traffic car: a route along road lines and a target speed. */
function spawnTrafficCar(S, rng) {
  const p = S.city.randomRoadPoint();
  const kind = rng() < 0.12 ? 'taxi' : 'civilian';
  const color = kind === 'taxi' ? 0xffd23f : pickColor(rng);
  const car = makeCar(S.scene, p.x, p.z, p.angle, color, kind);
  car.speed = 10 + rng() * 6;
  car.cruise = car.speed;
  return { car, axis: Math.abs(Math.sin(p.angle)) < 0.5 ? 'z' : 'x', dir: Math.sign(Math.cos(p.angle)) || 1, stuck: 0 };
}

export function createTraffic(S) {
  const list = [];
  for (let i = 0; i < TUNING.trafficCount; i += 1) list.push(spawnTrafficCar(S, S.rng));
  return list;
}

/** At an intersection, mostly go straight, sometimes turn. */
function chooseTurn(rng) {
  const r = rng();
  if (r < 0.62) return 0;
  return r < 0.81 ? 1 : -1;
}

export function updateTraffic(S, dt) {
  for (const t of S.traffic) {
    const car = t.car;
    // Slow for the car ahead on the same road.
    let ahead = null;
    for (const other of S.traffic) {
      if (other === t) continue;
      const dx = other.car.x - car.x;
      const dz = other.car.z - car.z;
      const forward = Math.sin(car.angle) * dx + Math.cos(car.angle) * dz;
      const side = Math.abs(Math.cos(car.angle) * dx - Math.sin(car.angle) * dz);
      if (forward > 0 && forward < 14 && side < 3) { ahead = other; break; }
    }
    const playerCar = S.player.car;
    if (playerCar && playerCar !== car) {
      const dx = playerCar.x - car.x;
      const dz = playerCar.z - car.z;
      const forward = Math.sin(car.angle) * dx + Math.cos(car.angle) * dz;
      const side = Math.abs(Math.cos(car.angle) * dx - Math.sin(car.angle) * dz);
      if (forward > 0 && forward < 12 && side < 3) ahead = { car: playerCar };
    }
    const targetSpeed = ahead ? 0 : car.cruise;
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 10 * dt);

    // Drive along the current axis; at an intersection, maybe turn.
    const along = t.axis === 'x' ? car.x : car.z;
    const nearCentre = Math.abs(along - roadCentre(along));
    if (nearCentre < 2 && t.stuck <= 0) {
      const turn = chooseTurn(S.rng);
      if (turn !== 0) {
        car.angle += turn * Math.PI / 2;
        t.axis = t.axis === 'x' ? 'z' : 'x';
        t.stuck = 1.2;
      }
    }
    t.stuck = Math.max(0, t.stuck - dt);
    // Keep the car glued to its road line.
    if (t.axis === 'x') car.z += (roadCentre(car.z) - car.z) * Math.min(1, dt * 2);
    else car.x += (roadCentre(car.x) - car.x) * Math.min(1, dt * 2);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // Wrap around the city edge instead of driving into the sea.
    if (car.x > 490) { car.x = -490; }
    if (car.x < -490) { car.x = 490; }
    if (car.z > 490) { car.z = -490; }
    if (car.z < -490) { car.z = 490; }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
  }
}

/** One pedestrian: a simple walker with a coloured shirt, on a sidewalk. */
function makePedestrian(S, rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pickColor(rng) });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const legs = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
  head.position.y = 1.75;
  group.add(head);
  for (const lx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), legs);
    leg.position.set(lx, 0.3, 0);
    group.add(leg);
  }
  const p = S.city.randomRoadPoint();
  // Step off the road onto the sidewalk.
  const side = rng() < 0.5 ? 14 : -14;
  const x = p.x + (Math.abs(Math.sin(p.angle)) < 0.5 ? side : 0);
  const z = p.z + (Math.abs(Math.sin(p.angle)) < 0.5 ? 0 : side);
  group.position.set(x, 0, z);
  S.scene.add(group);
  return {
    mesh: group, x, z, angle: p.angle,
    speed: 1.2 + rng() * 1.4, axis: Math.abs(Math.sin(p.angle)) < 0.5 ? 'z' : 'x',
    dir: rng() < 0.5 ? 1 : -1, pause: 0,
  };
}

export function createPedestrians(S) {
  const list = [];
  for (let i = 0; i < TUNING.pedestrianCount; i += 1) list.push(makePedestrian(S, S.rng));
  return list;
}

export function updatePedestrians(S, dt) {
  const px = S.player.x;
  const pz = S.player.z;
  for (const ped of S.peds) {
    if (ped.pause > 0) { ped.pause -= dt; continue; }
    // Step aside when the player (or their car) rushes at them.
    const dx = px - ped.x;
    const dz = pz - ped.z;
    const d2 = dx * dx + dz * dz;
    let speed = ped.speed;
    if (d2 < 36) {
      speed = ped.speed * 2.4;
      ped.angle = Math.atan2(-dx, -dz);
    }
    ped.x += Math.sin(ped.angle) * speed * dt;
    ped.z += Math.cos(ped.angle) * speed * dt;
    // Turn around at the city edge or a random corner.
    if (Math.abs(ped.x) > 480 || Math.abs(ped.z) > 480 || S.rng() < dt * 0.02) {
      ped.angle += Math.PI / 2 * (S.rng() < 0.5 ? 1 : -1);
      ped.pause = 0.4 + S.rng() * 0.8;
    }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
    // Simple walk bob.
    ped.mesh.position.y = Math.abs(Math.sin(S.time * 8 + ped.x)) * 0.06;
  }
}

export function removeTrafficCar(S, entry) {
  removeCar(S.scene, entry.car);
  const i = S.traffic.indexOf(entry);
  if (i >= 0) S.traffic.splice(i, 1);
}
