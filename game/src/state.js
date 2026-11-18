// The game itself: state creation and the one simulation step. Every
// system lives in its own file; this file builds the state they share and
// runs them in order — input, player, traffic, pedestrians, police,
// helicopter, missions, combat — then the timers. main.js owns the loop
// and the screens; shots.js owns the staged scenes; both call this.
import { JOBS, PLACES, TUNING, WEAPONS, clamp, dist2 } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createRenderer } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, ACTION_WEAPON_1, ACTION_WEAPON_2, ACTION_WEAPON_3 } from './input.js';
import { createTraffic, createPedestrians, updateTraffic, updatePedestrians } from './traffic.js';
import { driveCar, makeCar, makeParkedCar } from './vehicles.js';
import { addWanted, setWanted, updatePolice } from './police.js';
import { createHelicopter, startPoliceHelicopter, stopPoliceHelicopter, updateHelicopter } from './helicopter.js';
import { startStoryJob, updateMissions } from './missions.js';
import { shoot, switchWeapon, updateCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { loadGame, saveGame } from './save.js';

export const STEP = 1 / 60;

export function createGame(canvas, seed, opts) {
  const options = opts || {};
  const rng = createRandom(seed);
  const renderer = createRenderer(canvas);
  const scene = renderer.scene;
  const city = buildCity(scene, rng);

  const S = {
    seed, rng, scene, city, renderer,
    time: 0, screen: options.screen || 'title',
    player: {
      // Start on Palm Row, a short walk west of the Job 1 coupe
      // (-250,105): the first job begins at once, walking east along
      // the road, instead of a long hike across town.
      x: -300, z: 105, angle: Math.PI / 2, health: TUNING.playerHealth,
      car: null, mode: 'foot',
    },
    traffic: [], peds: [], police: [], roadblock: [], roadblockTimer: 0,
    rivals: [], parkedCars: [], targetCar: null,
    wanted: 0, hiddenTimer: 0, bustTimer: 0, lastSeen: { x: -300, z: 105 }, seen: false,
    cash: 0, jobsCompleted: 0, job: null, jobIndex: 0, objectiveIndex: 0,
    objectiveTimer: 0, objectiveDone: 0, objectiveText: '', waitTimer: 0,
    weaponIndex: 0, ownedWeapons: ['pistol'], upgrades: {},
    shootCooldown: 0, shootHeatTimer: 0, muzzleTimer: 0,
    shake: 0, damageFlash: 0, savedFlash: 0,
    dialogue: '', dialogueName: '', dialogueTimer: 0,
    banner: '', bannerTimer: 0, prompt: '', bustedReason: '',
    gameWon: false, jobFailed: false,
    nosMeter: TUNING.nosSeconds, nosActive: false,
    heli: null, audio: null, hud: null, minimap: null, input: null,
  };

  S.spawnSmoke = (x, z, count) => renderer.spawnSmoke(x, z, count);
  S.spawnTracer = (x1, z1, x2, z2) => renderer.spawnTracer(x1, z1, x2, z2);

  // The player on foot: a low-poly walker with a yellow jacket.
  const THREE = window.THREE;
  const walker = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xffb020 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3a55 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.45), jacket);
  torso.position.y = 1.1;
  torso.castShadow = true;
  walker.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.9;
  walker.add(head);
  for (const lx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), pants);
    leg.position.set(lx, 0.32, 0);
    walker.add(leg);
  }
  walker.position.set(S.player.x, 0, S.player.z);
  scene.add(walker);
  S.player.mesh = walker;

  // A few stealable parked cars around the city, besides Job 1's coupe.
  // Each sits on a road edge (x or z 5 units off a road centre line).
  const parkedSpots = [
    { x: 105, z: -60, angle: 0, color: 0xffb020 },
    { x: -160, z: 105, angle: Math.PI / 2, color: 0x37b24d },
    { x: 240, z: -105, angle: Math.PI, color: 0xe8e8e8 },
    { x: 105, z: -260, angle: -Math.PI / 2, color: 0xd9a441 },
    { x: -360, z: 105, angle: 0, color: 0x8a5fc0 },
  ];
  for (const spot of parkedSpots) {
    S.parkedCars.push(makeParkedCar(scene, spot.x, spot.z, spot.angle, spot.color));
  }

  S.traffic = createTraffic(S);
  S.peds = createPedestrians(S);
  S.heli = createHelicopter(S);
  S.audio = createAudio();
  S.hud = createHud();
  S.minimap = createMinimap(document.getElementById('minimap'));
  S.input = createInput(canvas);

  // Continue a saved game when there is one; otherwise start Job 1.
  const save = options.skipSave ? null : loadGame();
  if (save) {
    S.cash = save.cash;
    S.jobsCompleted = save.jobsCompleted;
    S.ownedWeapons = save.ownedWeapons;
    S.upgrades = save.upgrades;
    startStoryJob(S, Math.min(save.jobId, JOBS.length));
  } else {
    startStoryJob(S, 1);
  }
  return S;
}

/** The nearest thing E can do right now: a car, a place, or nothing. */
function nearestInteractable(S) {
  const px = S.player.x;
  const pz = S.player.z;
  // Getting out only makes sense when the car has nearly stopped.
  if (S.player.car) {
    if (Math.abs(S.player.car.speed) < 3) return { kind: 'exit', text: 'E — Get out of the car' };
    return null;
  }
  let best = null;
  let bestD = 6;
  for (const car of S.parkedCars) {
    const d = Math.sqrt(dist2(px, pz, car.x, car.z));
    if (d < bestD) { bestD = d; best = { kind: 'car', car, text: 'E — Steal this car' }; }
  }
  for (const place of PLACES) {
    const d = Math.sqrt(dist2(px, pz, place.x, place.z));
    if (d < 9 && d < bestD + 3) {
      const label = place.kind === 'safehouse' ? 'E — Save game at the safehouse'
        : place.kind === 'garage' ? 'E — Buy garage upgrade'
        : `E — Use ${place.name}`;
      best = { kind: 'place', place, text: label };
      bestD = d;
    }
  }
  return best;
}

function usePlace(S, place) {
  if (place.kind === 'safehouse') {
    saveGame(S);
    S.banner = 'GAME SAVED — progress kept at the safehouse';
    S.bannerTimer = 3;
    if (S.audio) S.audio.sfx('buy');
    return;
  }
  if (place.kind === 'garage') {
    const next = ['engine', 'armor', 'nos'].find((id) => !S.upgrades[id]);
    const upgrade = { engine: { cost: 900, name: 'Engine Tune' }, armor: { cost: 1100, name: 'Armored Plates' }, nos: { cost: 700, name: 'NOS Tank XL' } }[next];
    if (!upgrade) {
      S.banner = 'GARAGE — all upgrades owned';
      S.bannerTimer = 3;
      return;
    }
    if (S.cash < upgrade.cost) {
      S.banner = `GARAGE — ${upgrade.name} costs $${upgrade.cost}, you have $${S.cash}`;
      S.bannerTimer = 3;
      return;
    }
    S.cash -= upgrade.cost;
    S.upgrades[next] = true;
    S.banner = `GARAGE — bought ${upgrade.name} for $${upgrade.cost}`;
    S.bannerTimer = 3;
    if (S.audio) S.audio.sfx('buy');
    saveGame(S);
    return;
  }
  // Shops: clinic heals, auto shop repairs, gun shop sells weapons.
  if (place.name === 'Doc Martino Clinic') {
    if (S.cash < 150) { S.banner = 'CLINIC — healing costs $150'; S.bannerTimer = 3; return; }
    S.cash -= 150;
    S.player.health = TUNING.playerHealth;
    S.banner = 'CLINIC — patched up, health full';
    S.bannerTimer = 3;
  } else if (place.name === 'Rosa Auto Body') {
    if (S.cash < 200) { S.banner = 'AUTO SHOP — repair costs $200'; S.bannerTimer = 3; return; }
    S.cash -= 200;
    if (S.player.car) S.player.car.health = S.player.car.maxHealth;
    S.banner = 'AUTO SHOP — car repaired';
    S.bannerTimer = 3;
  } else if (place.name === 'Ammo & Sons') {
    const next = WEAPONS.find((w) => w.id !== 'pistol' && !S.ownedWeapons.includes(w.id));
    if (!next) { S.banner = 'GUN SHOP — all weapons owned'; S.bannerTimer = 3; return; }
    if (S.cash < next.price) { S.banner = `GUN SHOP — ${next.name} costs $${next.price}`; S.bannerTimer = 3; return; }
    S.cash -= next.price;
    S.ownedWeapons.push(next.id);
    S.banner = `GUN SHOP — bought the ${next.name}`;
    S.bannerTimer = 3;
  }
  if (S.audio) S.audio.sfx('buy');
}

function enterCar(S, car) {
  const i = S.parkedCars.indexOf(car);
  if (i >= 0) S.parkedCars.splice(i, 1);
  S.player.car = car;
  S.player.car.health = S.player.car.health || TUNING.carHealth;
  S.player.mesh.visible = false;
  S.player.angle = car.angle;
  // Stealing a car in the open is a crime — unless nobody is watching.
  let seen = false;
  for (const entry of S.police) {
    if (dist2(entry.car.x, entry.car.z, S.player.x, S.player.z) < 80 * 80) seen = true;
  }
  if (seen || car === S.targetCar) addWanted(S, 1);
  if (S.audio) S.audio.sfx('buy');
}

function exitCar(S) {
  const car = S.player.car;
  if (!car) return;
  const side = { x: S.player.x - Math.cos(car.angle) * 3, z: S.player.z + Math.sin(car.angle) * 3 };
  if (!S.city.collides(side.x, side.z, 1)) {
    S.player.x = side.x;
    S.player.z = side.z;
  }
  S.player.mesh.visible = true;
  S.player.mesh.position.set(S.player.x, 0, S.player.z);
  S.parkedCars.push(car);
  S.player.car = null;
}

function respawn(S) {
  const home = PLACES.find((p) => p.kind === 'safehouse');
  S.player.x = home.x + 6;
  S.player.z = home.z + 6;
  S.player.angle = Math.PI;
  S.player.health = TUNING.playerHealth;
  if (S.player.car) { S.player.car = null; }
  S.player.mesh.visible = true;
  S.player.mesh.position.set(S.player.x, 0, S.player.z);
  S.cash = Math.max(0, S.cash - 200);
  setWanted(S, 0);
  S.bustTimer = 0;
  if (S.job) startStoryJob(S, S.job.id);
  S.screen = 'play';
}

/** One fixed simulation step. `input` is the createInput handle. */
export function stepGame(S, dt, input) {
  S.time += dt;
  S.dialogueTimer = Math.max(0, S.dialogueTimer - dt);
  S.bannerTimer = Math.max(0, S.bannerTimer - dt);
  S.damageFlash = Math.max(0, S.damageFlash - dt * 2);
  S.savedFlash = Math.max(0, S.savedFlash - dt);

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    if (S.screen === 'play') S.screen = 'paused';
    else if (S.screen === 'paused') S.screen = 'play';
  }
  if (actions & ACTION_RADIO) {
    const name = S.audio.nextStation();
    S.banner = `RADIO — ${name}`;
    S.bannerTimer = 2;
  }
  if (actions & ACTION_MUTE) {
    const muted = S.audio.toggleMute();
    S.banner = muted ? 'SOUND OFF' : 'SOUND ON';
    S.bannerTimer = 1.5;
  }
  if (actions & ACTION_WEAPON_1) switchWeapon(S, 0);
  if (actions & ACTION_WEAPON_2) switchWeapon(S, 1);
  if (actions & ACTION_WEAPON_3) switchWeapon(S, 2);
  if (actions & ACTION_CONFIRM && (S.screen === 'busted' || S.screen === 'wasted')) {
    respawn(S);
    return;
  }
  if (S.screen !== 'play') return;

  // Interact: get out, steal a car, or use a place.
  if (actions & ACTION_INTERACT) {
    const target = nearestInteractable(S);
    if (target) {
      if (target.kind === 'exit') exitCar(S);
      else if (target.kind === 'car') enterCar(S, target.car);
      else if (target.kind === 'place') usePlace(S, target.place);
    }
  }

  // The player: driving, or on foot.
  const held = input.held;
  if (S.player.car) {
    const car = S.player.car;
    const wantNos = held.nos && S.nosMeter > 0 && car.speed > 5;
    S.nosActive = wantNos;
    if (wantNos) S.nosMeter = Math.max(0, S.nosMeter - dt);
    else S.nosMeter = Math.min(TUNING.nosSeconds * (S.upgrades.nos ? 2 : 1), S.nosMeter + dt * 0.4);
    driveCar(car, {
      throttle: held.forward ? 1 : held.back ? -1 : 0,
      steer: input.steer(),
      nos: wantNos,
    }, dt, S.city, S.upgrades);
    S.player.x = car.x;
    S.player.z = car.z;
    S.player.angle = car.angle;
    if (held.mouse) shoot(S);
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      S.spawnSmoke(car.x, car.z, 12);
      if (S.audio) S.audio.sfx('explosion');
      S.screen = 'busted';
      S.bustedReason = 'Your car was wrecked.';
    }
  } else {
    const turn = input.steer();
    S.player.angle += turn * 2.6 * dt;
    const speed = held.forward ? (held.nos ? TUNING.runSpeed : TUNING.walkSpeed) : held.back ? -TUNING.walkSpeed * 0.6 : 0;
    if (speed !== 0) {
      const nx = S.player.x + Math.sin(S.player.angle) * speed * dt;
      const nz = S.player.z + Math.cos(S.player.angle) * speed * dt;
      if (!S.city.collides(nx, nz, 0.8)) {
        S.player.x = nx;
        S.player.z = nz;
      }
    }
    S.player.mesh.position.set(S.player.x, 0, S.player.z);
    S.player.mesh.rotation.y = S.player.angle;
    if (held.mouse) shoot(S);
  }

  // The prompt line under the crosshair.
  const near = nearestInteractable(S);
  S.prompt = near ? near.text : '';

  // The city lives on: traffic, pedestrians, police, helicopter.
  updateTraffic(S, dt);
  updatePedestrians(S, dt);
  updatePolice(S, dt);
  if (S.wanted >= 3 && S.heli && !S.heli.active) startPoliceHelicopter(S);
  if (S.wanted < 3 && S.heli && S.heli.active) stopPoliceHelicopter(S);
  updateHelicopter(S, dt);
  updateMissions(S, dt);
  updateCombat(S, dt);

  if (S.audio) S.audio.setEngine(S.player.car ? S.player.car.speed : 0, TUNING.carMaxSpeed);
}
