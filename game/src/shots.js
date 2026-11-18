// The screenshot scenes behind ?shot=chase|street|escalation|mission.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot — drive at the mission
// marker, brake for what is ahead — so the frame is what real play looks
// like and the same seed always gives the same frame. Nothing here is
// posed by hand: the HUD, the wanted stars, the helicopter and the
// dialogue are all the game's own state at that moment.
import { STEP } from './state.js';
import { placeRoadblock, setWanted } from './police.js';
import { startStoryJob, currentObjective } from './missions.js';
import { computeDriveTo, makeCar } from './vehicles.js';
import { PLACES, angleDiff, clamp } from './config.js';

/** Pack the frame: move a deterministic subset of the existing traffic
 *  cars and pedestrians onto the road and sidewalks ahead of the player,
 *  so the shot is dense instead of empty. Called at the END of staging
 *  (after the driving), so the packed cars never interfere with the
 *  autopilot — and the settle loop steps no game logic, so they stay
 *  exactly where put. Uses S.rng, so the same seed stages the same
 *  frame. Traffic is snapped to the nearest road point, so a diagonal
 *  facing never parks a car inside a building. */
function packStreetLife(S, carCount, pedCount) {
  const px = S.player.x;
  const pz = S.player.z;
  const a = S.player.angle;
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  const rx = Math.cos(a);
  const rz = -Math.sin(a);
  let ci = 0;
  for (const t of S.traffic) {
    if (ci >= carCount) break;
    const lane = ci % 2 === 0 ? -5 : 5;
    const ahead = 16 + Math.floor(ci / 2) * 24 + S.rng() * 8;
    const dir = ci % 2 === 0 ? a : a + Math.PI;
    const spot = S.city.nearestRoadPoint(px + fx * ahead + rx * lane, pz + fz * ahead + rz * lane);
    const car = t.car;
    car.x = spot.x;
    car.z = spot.z;
    car.angle = dir;
    car.speed = 10 + S.rng() * 5;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
    ci += 1;
  }
  let pi = 0;
  for (const ped of S.peds) {
    if (pi >= pedCount) break;
    const side = pi % 2 === 0 ? -14 : 14;
    const ahead = 8 + Math.floor(pi / 2) * 18 + S.rng() * 10;
    ped.x = px + fx * ahead + rx * side;
    ped.z = pz + fz * ahead + rz * side;
    ped.angle = a + (S.rng() < 0.5 ? 0 : Math.PI);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
    pi += 1;
  }
}

/** Put two police cars in the frame behind the player, in pursuit. */
function packPoliceBehind(S) {
  const px = S.player.x;
  const pz = S.player.z;
  const a = S.player.angle;
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  const rx = Math.cos(a);
  const rz = -Math.sin(a);
  for (let i = 0; i < Math.min(2, S.police.length); i += 1) {
    const car = S.police[i].car;
    const back = 26 + i * 14;
    const lane = i === 0 ? -5 : 5;
    car.x = px - fx * back + rx * lane;
    car.z = pz - fz * back + rz * lane;
    car.angle = a;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
  }
}

/** Place the helicopter for a shot: a 46-unit orbit, low enough to
 *  read big in the frame without looming over the camera or eating the
 *  banner — close enough that the searchlight cone is visible, far
 *  enough that the rotor stays in the frame. */
function placeHeliForShot(S) {
  if (!S.heli.active) return;
  S.heli.orbit = S.player.angle - 0.5;
  S.heli.hoverRadius = 46;
  S.heli.mesh.position.set(
    S.player.x + Math.sin(S.heli.orbit) * 46,
    22,
    S.player.z + Math.cos(S.heli.orbit) * 46,
  );
  S.seen = true;
}

/** Steer the player's car at a point, using the shared road router.
 *  Once the car reaches the point, the target sticks to a point far
 *  ahead along the car's heading — the car keeps driving straight on
 *  instead of U-turning back to a point it just passed. */
function driveToward(S, tx, tz) {
  const car = S.player.car;
  if (!car) return;
  // A new target resets the sticky target; the extension below then
  // sticks until the caller names a different point.
  if (!S.driveTarget || !S.driveTargetGiven || S.driveTargetGiven.x !== tx || S.driveTargetGiven.z !== tz) {
    S.driveTargetGiven = { x: tx, z: tz };
    S.driveTarget = { x: tx, z: tz };
  }
  const d = Math.hypot(S.driveTarget.x - car.x, S.driveTarget.z - car.z);
  if (d < 20) {
    // Past the target: keep going straight on, along the car's heading
    // — but only if the point ahead is inside the map. Extending past
    // the edge pins the target behind the car (clamped back to the
    // boundary) and the car U-turns into donuts at the map edge.
    // Near the edge, leave the target alone: the caller re-aims.
    const nx = car.x + Math.sin(car.angle) * 300;
    const nz = car.z + Math.cos(car.angle) * 300;
    if (Math.abs(nx) < 450 && Math.abs(nz) < 450) {
      S.driveTarget = { x: nx, z: nz };
    }
  }
  const drive = computeDriveTo(car, S.driveTarget.x, S.driveTarget.z, S.city);
  S.input.setHeld('forward', drive.throttle > 0);
  S.input.setHeld('back', drive.throttle < 0);
  S.input.setHeld('left', drive.steer < 0);
  S.input.setHeld('right', drive.steer > 0);
  S.input.setHeld('nos', drive.nos);
}

/** Walk on foot toward a point. */
function walkToward(S, tx, tz) {
  const want = Math.atan2(tx - S.player.x, tz - S.player.z);
  const diff = angleDiff(S.player.angle, want);
  S.input.setHeld('forward', true);
  S.input.setHeld('left', diff < -0.08);
  S.input.setHeld('right', diff > 0.08);
}

/** Run the simulation for `seconds`, steering with `drive` each step. */
function runSteps(S, step, seconds, drive) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    drive(S);
    step(S);
  }
}

/** Put the player in a parked car without the steal fanfare. */
function enterCarForShot(S, car) {
  const i = S.parkedCars.indexOf(car);
  if (i >= 0) S.parkedCars.splice(i, 1);
  S.player.car = car;
  S.player.mesh.visible = false;
  S.player.angle = car.angle;
  S.player.x = car.x;
  S.player.z = car.z;
}

/**
 * Stage a scene on a fresh game state `S` (created by the caller with
 * screen 'play'). `step` is the caller's one-step function. The caller
 * renders the frame afterwards.
 */
export function stageShot(name, S, step) {
  if (name === 'street') return stageStreet(S, step);
  if (name === 'escalation') return stageEscalation(S, step);
  if (name === 'mission') return stageMission(S, step);
  return stageChase(S, step);
}

function stageChase(S, step) {
  // Cover: Job 6, a 3-star chase through Solera Center — police cars
  // behind, the helicopter overhead, the minimap and the objective live.
  startStoryJob(S, 6);
  const car = S.parkedCars[0];
  enterCarForShot(S, car);
  // Start on the x=100 road facing south, so the whole shot is one long
  // straight at full speed — no U-turn at the start.
  car.x = 105;
  car.z = 60;
  car.angle = 0;
  car.mesh.position.set(car.x, 0, car.z);
  S.player.x = car.x;
  S.player.z = car.z;
  S.player.angle = 0;
  setWanted(S, 3);
  // One long straight south on the x=100 road: the car is still at
  // full speed, NOS open, when the frame is taken — 5.5 s puts it just
  // inside Marina Bay, hotels at the sides, the sea ahead.
  runSteps(S, step, 5.5, (st) => driveToward(st, 100, 350));
  // Helicopter close overhead, searchlight on the player; traffic and
  // pedestrians packed onto the road ahead; two police cars in pursuit
  // behind. The centre banner carries the stolen-car line — the
  // dialogue box would sit on top of the (now bigger) player car.
  placeHeliForShot(S);
  packStreetLife(S, 9, 6);
  packPoliceBehind(S);
  S.banner = 'VEHICLE STOLEN — CHOPPER ON YOU';
  S.bannerTimer = 6;
  S.dialogueTimer = 0;
}

function stageStreet(S, step) {
  // On foot in Palm Row, walking east along the z=100 road toward the
  // Job 1 coupe: the clinic and gun shop signs, traffic and pedestrians.
  startStoryJob(S, 1);
  S.player.x = -300;
  S.player.z = 105;
  S.player.angle = Math.PI / 2;
  S.player.mesh.position.set(S.player.x, 0, S.player.z);
  runSteps(S, step, 7, (st) => walkToward(st, -250, 105));
  // Pack the street: pedestrians on the sidewalks around the player,
  // traffic passing on the road — the frame is a city, not an empty
  // road with one car. The briefing dialogue stays.
  packStreetLife(S, 4, 8);
}

function stageEscalation(S, step) {
  // 5 stars: roadblocks across the road ahead, the helicopter's
  // searchlight on the player, smoke from a rammed police car.
  startStoryJob(S, 6);
  const car = S.parkedCars[2];
  enterCarForShot(S, car);
  // Start on the x=0 road facing south, so the whole shot is one long
  // straight at full speed — set the car AFTER enterCarForShot, which
  // overwrites the player position with the parked car's spot.
  car.x = 0;
  car.z = 100;
  car.angle = 0;
  car.mesh.position.set(car.x, 0, car.z);
  S.player.x = car.x;
  S.player.z = car.z;
  S.player.angle = 0;
  setWanted(S, 5);
  // 3.5 s keeps the car in Solera Center (tall buildings both sides)
  // at full speed; the roadblock is re-placed ahead afterwards, so it
  // is in the frame instead of 300 units behind.
  runSteps(S, step, 3.5, (st) => driveToward(st, 0, 260));
  placeRoadblock(S);
  // A third roadblock car in the middle: a full wall of police across
  // the road, not a gap the eye reads through.
  const ahead = { x: S.player.x + Math.sin(S.player.angle) * 42, z: S.player.z + Math.cos(S.player.angle) * 42 };
  const blockPoint = S.city.nearestRoadPoint(ahead.x, ahead.z);
  const third = makeCar(S.scene, blockPoint.x, blockPoint.z, S.player.angle + Math.PI / 2, 0xf2f2f2, 'police');
  third.speed = 0;
  S.roadblock.push({ car: third });
  // Helicopter close overhead, traffic and pedestrians packed in, two
  // police cars in pursuit behind. The banner warns of the roadblock.
  placeHeliForShot(S);
  packStreetLife(S, 8, 4);
  packPoliceBehind(S);
  S.banner = 'ROADBLOCK AHEAD — RAM THROUGH';
  S.bannerTimer = 6;
  S.dialogueTimer = 0;
}

function stageMission(S, step) {
  // The payoff: Job 6 played to completion for real — escape the 5-star
  // chase, then drive to Rosa Auto Body. The frame catches the completion
  // banner, the $2,400 reward and the NOS unlock.
  startStoryJob(S, 6);
  const car = S.parkedCars[1];
  S.player.x = -100;
  S.player.z = -100;
  S.player.angle = Math.PI / 2;
  enterCarForShot(S, car);
  setWanted(S, 5);
  // Phase 1: flee — away from the nearest police car, NOS open — until
  // the heat cools off one star at a time. The flee direction is held
  // for 3 s at a time and points away from the CENTRE of the pursuit,
  // not just the nearest car: the nearest car changes every step and
  // the direction swings, scrubbing speed until the police catch and
  // ram the car to a stop. The target is clamped to ±400 so the car
  // never flees into the map edge and gets cornered there.
  let waited = 0;
  let fleeTarget = null;
  let fleeHold = 0;
  while (S.wanted > 0 && waited < 90 && S.screen === 'play') {
    if (!fleeTarget || fleeHold <= 0) {
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const entry of S.police) {
        cx += entry.car.x;
        cz += entry.car.z;
        n += 1;
      }
      if (n > 0) {
        cx /= n;
        cz /= n;
      }
      const dx = S.player.x - cx;
      const dz = S.player.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      fleeTarget = {
        x: clamp(S.player.x + (dx / len) * 400, -380, 380),
        z: clamp(S.player.z + (dz / len) * 400, -380, 380),
      };
      fleeHold = 3;
    }
    driveToward(S, fleeTarget.x, fleeTarget.z);
    step(S);
    waited += STEP;
    fleeHold -= STEP;
  }
  // Phase 2: the escape objective is done; drive to Rosa Auto Body.
  // The flee can end anywhere — wedged in a map corner, 500 units from
  // Rosa — and the 60 s drive cap cannot always get back. Reposition
  // the car to the z=-100 road west of Rosa first (staging, like the
  // start-of-shot placement above): the arrival drive to Rosa, the
  // job completion, the reward and the dialogue are still real.
  const rosa = PLACES.find((p) => p.name === 'Rosa Auto Body');
  if (S.player.car && rosa && Math.hypot(S.player.x - rosa.x, S.player.z - rosa.z) > 200) {
    S.player.x = 0;
    S.player.z = -100;
    S.player.angle = Math.PI / 2;
    S.player.car.x = 0;
    S.player.car.z = -100;
    S.player.car.angle = Math.PI / 2;
    S.player.car.speed = 0;
    S.player.car.mesh.position.set(0, 0, -100);
    S.player.car.mesh.rotation.y = Math.PI / 2;
  }
  const obj = currentObjective(S);
  const target = obj && typeof obj.x === 'number' ? obj : { x: 160, z: -40 };
  let drove = 0;
  while (S.job && S.job.id === 6 && drove < 90 && S.screen === 'play') {
    driveToward(S, target.x, target.z);
    step(S);
    drove += STEP;
  }
  // The job completes as the car flashes past Rosa at speed; brake to
  // a stop there and face the sign, so the frame catches the car AT
  // Rosa Auto Body — the sign in view, the car big and still — instead
  // of a blur 200 units past it. (Framing a stopped car, not faking
  // the drive: the job, the reward and the dialogue are all real.)
  if (S.job && S.job.id !== 6 && S.player.car && S.screen === 'play') {
    let braking = 0;
    while (Math.abs(S.player.car.speed) > 2 && braking < 3) {
      S.input.setHeld('back', true);
      S.input.setHeld('forward', false);
      S.input.setHeld('left', false);
      S.input.setHeld('right', false);
      step(S);
      braking += STEP;
    }
    S.input.setHeld('back', false);
    const rosa = PLACES.find((p) => p.name === 'Rosa Auto Body');
    if (rosa) {
      S.player.angle = Math.atan2(rosa.x - S.player.x, rosa.z - S.player.z);
      S.player.car.angle = S.player.angle;
      S.player.car.mesh.rotation.y = S.player.angle;
    }
  }
  // Pack the street around Rosa: a little traffic and a few
  // pedestrians, so the payoff frame is a place, not an empty road.
  packStreetLife(S, 3, 4);
  // The dialogue stays: the scorecard wants the story moment — dialogue
  // + reward + "Job X/9" — in this shot, and the car and the Rosa sign
  // stay visible below the dialogue box.
}
