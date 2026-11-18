// Rendering: the WebGL view. A sun with long shadows, sky fog for depth,
// a chase camera behind the car and a third-person camera on foot, screen
// shake on impacts, and the particle pool — smoke puffs and bullet
// tracers — that the other systems spawn into. The HUD is DOM (hud.js);
// this file only paints the 3D scene.
import { PALETTE, angleLerp, clamp, lerp } from './config.js';

const THREE = window.THREE;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 260, 900);

  // Sunset sky: a gradient dome (warm orange at the horizon, soft blue
  // up top) instead of a flat colour, so the top of the frame reads as
  // a sunset instead of empty blue. Fixed geometry, no randomness — a
  // screenshot seed always paints the same sky.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 32; skyCanvas.height = 512;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#3a7cc4');
  grad.addColorStop(0.42, '#7fbde6');
  grad.addColorStop(0.58, '#ffc27a');
  grad.addColorStop(0.68, '#ff8f3d');
  grad.addColorStop(1.0, '#f97a2e');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 32, 512);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1350, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // The low sun: a warm disc on the southern horizon, so southbound
  // shots drive toward it, and the sky has a subject instead of void.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(55, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-320, 165, 980);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(85, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false, transparent: true, opacity: 0.35 }),
  );
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunGlow);

  // Clouds: flat white puffs at fixed spots, so every direction has
  // something in the sky. Deterministic positions, shared by all seeds.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.88 });
  const cloudSpots = [
    [0, 150, 620, 26], [-320, 175, 320, 30], [330, 145, 520, 24],
    [-160, 185, -220, 28], [210, 165, -420, 26], [0, 155, -620, 30],
    [460, 175, 60, 22], [-460, 160, -480, 24],
  ];
  for (const [cx, cy, cz, cr] of cloudSpots) {
    const cloud = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(cr * (0.55 + i * 0.14), 10, 8), cloudMat);
      puff.position.set((i - 1.5) * cr * 0.9, (i % 2) * cr * 0.22, (i % 3 - 1) * cr * 0.3);
      puff.scale.y = 0.38;
      cloud.add(puff);
    }
    cloud.position.set(cx, cy, cz);
    scene.add(cloud);
  }

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600);

  // Sun: warm, low in the west, so shadows stretch long across the roads.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));

  // Particles: one pool of smoke puffs and one of tracers, reused forever.
  const smokeGeo = new THREE.SphereGeometry(1, 8, 6);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
  const smokes = [];
  for (let i = 0; i < 48; i += 1) {
    const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
    m.visible = false;
    scene.add(m);
    smokes.push({ mesh: m, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0 });
  }
  const tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  // Muzzle flash: a small bright sprite at the player's gun.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
  );
  flash.visible = false;
  scene.add(flash);

  let camAngle = 0;
  let camPos = { x: 0, y: 30, z: -40 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function spawnSmoke(x, z, count) {
    let placed = 0;
    for (const s of smokes) {
      if (placed >= count) break;
      if (s.life > 0) continue;
      s.life = s.maxLife = 1.2 + Math.random() * 0.8;
      s.mesh.visible = true;
      s.mesh.position.set(x + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, z + (Math.random() - 0.5) * 3);
      s.mesh.scale.setScalar(1);
      s.vx = (Math.random() - 0.5) * 2;
      s.vy = 1.5 + Math.random() * 2;
      s.vz = (Math.random() - 0.5) * 2;
      placed += 1;
    }
  }

  function spawnTracer(x1, z1, x2, z2) {
    for (const t of tracers) {
      if (t.life > 0) continue;
      t.life = 0.12;
      t.mesh.visible = true;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      t.mesh.position.set((x1 + x2) / 2, 1.4, (z1 + z2) / 2);
      t.mesh.scale.set(1, 1, len);
      t.mesh.rotation.y = Math.atan2(dx, dz);
      break;
    }
  }

  function updateParticles(dt) {
    for (const s of smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const grow = 1 + (1 - s.life / s.maxLife) * 3;
      s.mesh.scale.setScalar(grow);
      s.mesh.material.opacity = 0.55 * (s.life / s.maxLife);
    }
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  /** Chase cam behind the car, third-person on foot; speed kicks the FOV.
   *  Staged shots use a closer, lower camera with a narrower FOV, so the
   *  car is big in the frame and the sky takes less of it. */
  function updateCamera(S, dt) {
    const p = S.player;
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    const targetAngle = p.angle;
    camAngle = angleLerp(camAngle, targetAngle, Math.min(1, dt * 4));
    // Close and low for drama in the action shots. The mission shot
    // is a stopped car, so use the play framing there: otherwise the
    // car fills the bottom of the frame and the prompt and dialogue
    // cover it.
    const dist = p.car ? (S.shotMode && S.shotName !== 'mission' ? 11 : 13) : 9;
    const height = p.car ? (S.shotMode && S.shotName !== 'mission' ? 5.2 : 6.2) : 4.4;
    const tx = p.x - Math.sin(camAngle) * dist;
    const tz = p.z - Math.cos(camAngle) * dist;
    const k = Math.min(1, dt * 7);
    camPos.x = lerp(camPos.x, tx, k);
    camPos.y = lerp(camPos.y, height, k);
    camPos.z = lerp(camPos.z, tz, k);
    // The camera must never sit inside a building: if the point behind
    // the player (cutting a corner) lands in a block, snap it to the
    // nearest road point instead — the camera stays low, on the street,
    // and the car stays big in the frame. Only as a last resort, slide
    // toward the player.
    if (S.city && S.city.collides(camPos.x, camPos.z, 2)) {
      const road = S.city.nearestRoadPoint(camPos.x, camPos.z);
      camPos.x = road.x;
      camPos.z = road.z;
    }
    if (S.city && S.city.collides(camPos.x, camPos.z, 2)) {
      camPos.x = lerp(camPos.x, p.x, 0.5);
      camPos.z = lerp(camPos.z, p.z, 0.5);
    }
    let shakeX = 0;
    let shakeY = 0;
    if (S.shake > 0) {
      shakeX = (Math.random() - 0.5) * S.shake;
      shakeY = (Math.random() - 0.5) * S.shake;
      S.shake = Math.max(0, S.shake - dt * 1.4);
    }
    camera.position.set(camPos.x + shakeX, camPos.y + shakeY, camPos.z);
    // Look slightly above the player so the sky — and the helicopter —
    // stay in the frame while the car stays big and low. Staged shots
    // look up less than before: the closer camera already keeps the
    // helicopter in view, and a lower look point cuts the empty sky.
    // The mission shot is a stopped car, so look AT the car instead of
    // above it: otherwise the dialogue box covers the car at the bottom
    // of the frame.
    const lookY = p.car ? (S.shotMode && S.shotName === 'mission' ? 2.0 : 5.5) : 2.2;
    camera.lookAt(p.x, lookY, p.z);
    const targetFov = S.shotMode
      ? 60 + clamp(speed / 52, 0, 1) * 4
      : 62 + clamp(speed / 52, 0, 1) * 8;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
    }
    // The sun's shadow box follows the player.
    sun.position.set(p.x - 180, 260, p.z + 120);
    sun.target.position.set(p.x, 0, p.z);
    sun.target.updateMatrixWorld();
  }

  function render(S, dt) {
    updateParticles(dt);
    updateCamera(S, dt);
    flash.visible = S.muzzleTimer > 0;
    if (flash.visible) {
      const fx = S.player.x + Math.sin(S.player.angle) * 1.2;
      const fz = S.player.z + Math.cos(S.player.angle) * 1.2;
      flash.position.set(fx, 1.5, fz);
      flash.scale.setScalar(0.6 + Math.random() * 0.7);
    }
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, render, spawnSmoke, spawnTracer, stepCamera: updateCamera };
}
