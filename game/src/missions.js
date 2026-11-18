// Missions and story: nine jobs, one crew, one arc across Port Solera.
// Each job is a chain of objectives — go here, drive there, escape the
// police, clear the guards — with a briefing from the crew member who
// planned it, a cash reward, and an unlock. Completing a job autosaves.
import { CREW, JOBS, TUNING, dist2 } from './config.js';
import { setWanted } from './police.js';
import { makeParkedCar } from './vehicles.js';
import { saveGame } from './save.js';

export function jobById(id) { return JOBS.find((j) => j.id === id); }

/** Start a job: briefing on screen, first objective live, rivals placed. */
export function startStoryJob(S, jobId) {
  const job = jobById(jobId);
  if (!job) return;
  S.job = job;
  S.jobIndex = job.id - 1;
  S.objectiveIndex = 0;
  S.objectiveTimer = 0;
  S.objectiveDone = 0;
  S.dialogue = job.briefing;
  S.dialogueName = CREW[job.giver].name.toUpperCase();
  S.dialogueTimer = 7;
  S.banner = `JOB ${job.id}/9 — ${job.name.toUpperCase()}`;
  S.bannerTimer = 4;
  S.jobFailed = false;
  armObjective(S);
  if (S.audio) S.audio.sfx('job');
}

function armObjective(S) {
  const obj = currentObjective(S);
  if (!obj) return;
  S.objectiveTimer = obj.time || 0;
  S.waitTimer = 0;
  if (obj.type === 'combat') {
    spawnRivals(S, obj.x ?? S.player.x + 20, obj.z ?? S.player.z + 20, obj.count);
  }
  if (obj.wanted) setWanted(S, obj.wanted);
  if (obj.type === 'steal') spawnTargetCar(S, obj.x, obj.z);
  S.objectiveText = obj.text;
}

export function currentObjective(S) {
  if (!S.job) return null;
  return S.job.objectives[S.objectiveIndex] || null;
}

function spawnTargetCar(S) {
  // The coupe Job 1 wants: parked on Palm Row, engine off, doors unlocked.
  if (S.targetCar) return;
  const car = makeParkedCar(S.scene, -250, 105, Math.PI / 2, 0xd94f3d);
  S.targetCar = car;
  S.parkedCars.push(car);
}

function spawnRivals(S, x, z, count) {
  const THREE = window.THREE;
  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: i % 2 ? 0x8a2f2f : 0x333333 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.45), shirt);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
    head.position.y = 1.78;
    group.add(head);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.1, 0.4);
    group.add(gun);
    const rx = x + (S.rng() - 0.5) * 24;
    const rz = z + (S.rng() - 0.5) * 24;
    group.position.set(rx, 0, rz);
    S.scene.add(group);
    S.rivals.push({
      mesh: group, x: rx, z: rz, angle: 0,
      health: TUNING.rivalHealth, shootTimer: 1 + S.rng() * 2, dead: false,
    });
  }
}

function completeObjective(S) {
  S.objectiveIndex += 1;
  if (S.audio) S.audio.sfx('objective');
  if (S.objectiveIndex >= S.job.objectives.length) completeStoryJob(S);
  else armObjective(S);
}

export function completeStoryJob(S) {
  const job = S.job;
  S.cash += job.reward;
  S.jobsCompleted += 1;
  if (S.audio) S.audio.sfx('reward');
  saveGame(S);
  if (job.id >= JOBS.length) {
    S.gameWon = true;
    S.banner = 'PALM CROWN — YOU OWN PORT SOLERA';
    S.bannerTimer = 10;
  } else {
    startStoryJob(S, job.id + 1);
  }
  // The completion banner is set after the next job starts, so it is the
  // message the player actually sees — reward first, new job second.
  S.banner = `JOB ${job.id}/9 COMPLETE — $${job.reward.toLocaleString('en-US')} — ${job.unlock}`;
  S.bannerTimer = 6;
  S.dialogue = `${CREW[job.giver].name}: "${job.unlock}"`;
  S.dialogueName = CREW[job.giver].name.toUpperCase();
  S.dialogueTimer = 6;
}

export function failStoryJob(S, reason) {
  S.banner = `JOB FAILED — ${reason} — try again`;
  S.bannerTimer = 5;
  S.jobFailed = true;
  if (S.audio) S.audio.sfx('fail');
  // Rivals from the failed attempt leave; the job restarts fresh.
  for (const r of S.rivals) S.scene.remove(r.mesh);
  S.rivals.length = 0;
  startStoryJob(S, S.job.id);
}

/** Advance the current objective: distance, timers, escapes, combat. */
export function updateMissions(S, dt) {
  if (!S.job || S.gameWon) return;
  const obj = currentObjective(S);
  if (!obj) return;
  const px = S.player.x;
  const pz = S.player.z;

  if (obj.type === 'goto' || obj.type === 'drive' || obj.type === 'steal') {
    const target = obj.type === 'steal' ? { x: obj.x, z: obj.z } : { x: obj.x, z: obj.z };
    if (dist2(px, pz, target.x, target.z) < 12 * 12) {
      if (obj.type === 'steal' && S.player.car !== S.targetCar) {
        S.objectiveText = 'That is the coupe — get in it (walk up and press E)';
        return;
      }
      completeObjective(S);
      return;
    }
    if (obj.time) {
      S.objectiveTimer -= dt;
      if (S.objectiveTimer <= 0) {
        failStoryJob(S, 'Out of time');
        return;
      }
    }
  } else if (obj.type === 'escape') {
    if (S.wanted === 0) { completeObjective(S); return; }
  } else if (obj.type === 'wait') {
    const speed = S.player.car ? Math.abs(S.player.car.speed) : 0;
    if (speed < 0.5) {
      S.waitTimer += dt;
      if (S.waitTimer >= obj.seconds) { completeObjective(S); return; }
    } else {
      S.waitTimer = 0;
    }
  } else if (obj.type === 'combat') {
    if (S.objectiveDone >= obj.count) { completeObjective(S); return; }
  }
}
