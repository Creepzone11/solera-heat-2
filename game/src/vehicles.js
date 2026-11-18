// Cars: how they look and how they drive. One mesh factory builds every
// car in the game (player, traffic, police, parked) from boxes, wheels and
// lights; one physics step drives them all — arcade handling, no drift
// simulation, with building collision and NOS boost.
import { PALETTE, ROAD_SPACING, ROAD_WIDTH, TUNING, angleDiff, clamp } from './config.js';

const THREE = window.THREE;

const CAR_COLORS = [0xd94f3d, 0x3d7bd9, 0x37b24d, 0xe8e8e8, 0x2b2f36, 0xd9a441, 0x8a5fc0, 0x4fc3f7];

function pickColor(rng) { return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]; }

/** A low-poly car: body, cabin, four wheels, headlights and taillights. */
export function createCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.25, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelPositions = [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const lx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightMat);
    head.position.set(lx, 0.65, 2.22);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
  for (const lx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tailMat);
    tail.position.set(lx, 0.65, -2.22);
    group.add(tail);
  }

  if (kind === 'police') {
    group.children[0].material = new THREE.MeshLambertMaterial({ color: PALETTE.policeWhite });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: PALETTE.policeBlue }));
    stripe.position.y = 0.62;
    group.add(stripe);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
    bar.position.set(0, 1.68, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    sign.position.set(0, 1.75, -0.2);
    group.add(sign);
  }
  return group;
}

/** A car in the world: mesh plus the numbers the physics step moves. */
export function makeCar(scene, x, z, angle, color, kind) {
  const mesh = createCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  return {
    mesh, kind: kind || 'civilian', x, z, angle, speed: 0,
    health: TUNING.carHealth, maxHealth: TUNING.carHealth,
    steering: 0, smokeTimer: 0, dead: false, lightPhase: Math.random() * 10,
  };
}

export function removeCar(scene, car) {
  scene.remove(car.mesh);
}

/**
 * Arcade driving: forward/back with acceleration and braking, steering
 * that scales down at speed, NOS multiplying the top speed. `drive` is
 * { throttle: -1..1, steer: -1..1, nos: bool }. Collisions with buildings
 * stop the car; the caller handles car-to-car bumps.
 */
export function driveCar(car, drive, dt, city, upgrades) {
  if (car.dead) return;
  const maxSpeed = TUNING.carMaxSpeed * (upgrades && upgrades.engine ? 1.2 : 1) * (drive.nos ? TUNING.nosMultiplier : 1);
  const maxReverse = TUNING.carReverseSpeed;
  if (drive.throttle > 0) {
    car.speed += TUNING.carAccel * drive.throttle * dt;
    if (drive.nos) car.speed += TUNING.carAccel * 0.8 * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 0.5) car.speed -= TUNING.carBrake * dt;
    else car.speed += TUNING.carAccel * 0.6 * drive.throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
  }
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);

  const steerAuthority = clamp(1 - Math.abs(car.speed) / (maxSpeed * 1.4), 0.35, 1);
  car.steering = drive.steer * steerAuthority;
  car.angle += car.steering * TUNING.carTurnRate * dt * Math.sign(car.speed || 1) * clamp(Math.abs(car.speed) / 8, 0, 1);
  // At a standstill the wheel still turns the car, slowly — so a car
  // boxed in against a wall (or an autopilot facing the wrong way) can
  // always turn around instead of sitting stuck.
  if (Math.abs(car.speed) < 0.5 && drive.steer !== 0) {
    car.angle += drive.steer * 1.6 * dt;
  }

  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  // Buildings stop the car dead; a scrape costs a little health and speed.
  if (city.collides(nx, nz, 1.6)) {
    if (Math.abs(car.speed) > 14) {
      car.health -= Math.abs(car.speed) * 0.35;
      car.speed *= -0.25;
    } else {
      car.speed = 0;
    }
  } else {
    car.x = nx;
    car.z = nz;
  }
  // Keep the angle wrapped: it grows without bound otherwise, which
  // makes the camera math and every diagnostic harder to read.
  while (car.angle > Math.PI) car.angle -= Math.PI * 2;
  while (car.angle < -Math.PI) car.angle += Math.PI * 2;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
}

/** A parked, stealable car: same mesh, engine off, waiting for the player. */
export function makeParkedCar(scene, x, z, angle, color) {
  const car = makeCar(scene, x, z, angle, color, 'parked');
  car.speed = 0;
  return car;
}

/**
 * Road routing for any driver — the player autopilot and the police use
 * the same brain: drive to the nearest intersection, then along the road
 * with the bigger remaining delta, turning at intersections. Brake for
 * what is ahead, coast through sharp turns, and past the target keep
 * driving straight on — never circle or U-turn back. Returns the drive
 * input { throttle: -1|0|1, steer: -1|0|1, nos: bool }.
 */
export function computeDriveTo(car, tx, tz, city) {
  const roadCentre = (v) => Math.round(v / ROAD_SPACING) * ROAD_SPACING;
  const dTarget = Math.hypot(tx - car.x, tz - car.z);
  if (dTarget < 6) return { throttle: 0, steer: 0, nos: false }; // arrived
  // Off the road (overshot a turn into a block, or wedged against a
  // building): get back on the road first. The Manhattan routing below
  // assumes the car is on the grid; aiming at a far target from inside
  // a block just grinds it against the buildings. The nearest road
  // point is a few units away — the car came from there, so the way
  // back is clear.
  if (city.onRoad && !city.onRoad(car.x, car.z)) {
    const road = city.nearestRoadPoint(car.x, car.z);
    tx = road.x;
    tz = road.z;
  }
  const ix = roadCentre(car.x);
  const iz = roadCentre(car.z);
  const distToIntersection = Math.hypot(ix - car.x, iz - car.z);
  let wx;
  let wz;
  // Start the turn early: once the intersection is close, aim at the
  // next leg instead, so the car arcs through the corner instead of
  // overshooting it onto the sidewalk. But a leg only works from the
  // road it runs on: a car 29 units north of the intersection, told to
  // go west, cuts diagonally across the block and wedges against a
  // building. If the car is not on the leg's road, drive to the
  // intersection first.
  if (distToIntersection > 40) {
    wx = ix;
    wz = iz;
  } else if (Math.abs(tx - car.x) > Math.abs(tz - car.z)) {
    // East-west leg: needs an east-west road under the car.
    if (Math.abs(car.z - iz) < ROAD_WIDTH / 2) {
      wx = tx;
      wz = iz;
    } else {
      wx = ix;
      wz = iz;
    }
  } else if (Math.abs(car.x - ix) < ROAD_WIDTH / 2) {
    // North-south leg: needs a north-south road under the car.
    wx = ix;
    wz = tz;
  } else {
    wx = ix;
    wz = iz;
  }
  const want = Math.atan2(wx - car.x, wz - car.z);
  const diff = angleDiff(car.angle, want);
  const aheadX = car.x + Math.sin(car.angle) * 12;
  const aheadZ = car.z + Math.cos(car.angle) * 12;
  const blocked = city.collides(aheadX, aheadZ, 2);
  // Coast through sharp turns only when fast: at a standstill the
  // coast is a deadlock — the car cannot move, cannot turn, and sits
  // there getting rammed while the steering oscillates. Slow, the car
  // arcs around the corner as it gains speed instead.
  const sharpTurn = Math.abs(diff) > 0.6 && Math.abs(car.speed) > 12;
  return {
    throttle: blocked ? -1 : sharpTurn ? 0 : 1,
    steer: diff < -0.08 ? -1 : diff > 0.08 ? 1 : 0,
    nos: Math.abs(diff) < 0.2 && !blocked && !sharpTurn,
  };
}

export { pickColor };
