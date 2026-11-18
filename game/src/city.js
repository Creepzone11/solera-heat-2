// The 3D city of Port Solera: a 1000 x 1000 coastal grid, seven named
// districts, roads, buildings, palms, beach and marina. Builds every mesh
// once from a seeded random, and answers the questions the other systems
// ask: is this point on a road, does it hit a building, where is a random
// road point. No game rules live here — only the world.
import { BLOCK, DISTRICTS, PALETTE, PLACES, ROAD_SPACING, ROAD_WIDTH, WORLD_HALF, districtAt } from './config.js';

const THREE = window.THREE;

/** Canvas texture of lit windows: small dark windows on a pale wall.
 *  `lit` mixes in warm sunset-lit windows, so some buildings glow. */
function makeWindowTexture(lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4ede0';
  g.fillRect(0, 0, 128, 256);
  // A fixed pseudo-random pattern (seeded by hand, same every load), so
  // the lit windows never flicker between runs or seeds.
  let s = lit ? 1234567 : 987654;
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 10; y < 246; y += 22) {
    for (let x = 8; x < 120; x += 24) {
      g.fillStyle = lit && next() < 0.35 ? '#ffb347' : '#41546e';
      g.fillRect(x, y, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Road textures: asphalt with a dashed centre line. One has the dash
 *  along U (for roads running east-west), one along V (north-south). */
function makeRoadTexture(horizontal) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3238';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d8d8d8';
  if (horizontal) g.fillRect(4, 30, 28, 4);
  else g.fillRect(30, 4, 4, 28);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Dashes repeat along the road's length: 16 tiles over 1000 units.
  if (horizontal) tex.repeat.set(16, 1);
  else tex.repeat.set(1, 16);
  return tex;
}

/** A floating sign above a place: coloured board, white text, readable from the street. */
function makeSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  return new THREE.CanvasTexture(c);
}

function roadCentre(v) { return Math.round(v / ROAD_SPACING) * ROAD_SPACING; }

export function buildCity(scene, rng) {
  const windowTexPlain = makeWindowTexture(false);
  const windowTexLit = makeWindowTexture(true);
  const roadTexH = makeRoadTexture(true);
  const roadTexV = makeRoadTexture(false);
  const buildings = []; // {x, z, hw, hd} collision boxes, y-up, ground level
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  function materialFor(color, w, h, lit) {
    // Each building gets its own texture repeat, so windows stay the
    // same size on a villa and on a tower (the texture image is shared).
    // Half the buildings use the sunset-lit window texture.
    const key = `${color}|${Math.round(w / 16)}|${Math.round(h / 16)}|${lit ? 1 : 0}`;
    if (!materials.has(key)) {
      const tex = (lit ? windowTexLit : windowTexPlain).clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / 16)));
      materials.set(key, new THREE.MeshLambertMaterial({ color, map: tex }));
    }
    return materials.get(key);
  }

  // Ground: one big concrete slab, then the road strips on top of it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a4 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV });
  for (let i = -5; i <= 5; i += 1) {
    const at = i * ROAD_SPACING;
    const along = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, ROAD_WIDTH), roadMatH);
    along.rotation.x = -Math.PI / 2;
    along.position.set(0, 0.03, at);
    along.receiveShadow = true;
    group.add(along);
    const across = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_HALF * 2), roadMatV);
    across.rotation.x = -Math.PI / 2;
    across.position.set(at, 0.04, 0);
    across.receiveShadow = true;
    group.add(across);
  }

  // Beach sand on the south edge, and the sea beyond the world edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, 440);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 400, 160),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, 580);
  group.add(sea);

  // Buildings: one to three per block, sized and coloured by district.
  for (let bx = -5; bx < 5; bx += 1) {
    for (let bz = -5; bz < 5; bz += 1) {
      const blockX0 = bx * ROAD_SPACING + ROAD_WIDTH / 2 + 4;
      const blockZ0 = bz * ROAD_SPACING + ROAD_WIDTH / 2 + 4;
      const cx = blockX0 + BLOCK / 2;
      const cz = blockZ0 + BLOCK / 2;
      if (cz > 360) continue; // the beach row stays open
      const district = districtAt(cx, cz);
      const count = 1 + Math.floor(rng() * 2.4);
      for (let n = 0; n < count; n += 1) {
        const w = 18 + rng() * 26;
        const d = 18 + rng() * 26;
        const h = 6 + rng() * rng() * district.maxHeight;
        const x = blockX0 + 8 + rng() * Math.max(1, BLOCK - 16 - w);
        const z = blockZ0 + 8 + rng() * Math.max(1, BLOCK - 16 - d);
        const color = district.palette[Math.floor(rng() * district.palette.length)];
        const mesh = new THREE.Mesh(boxGeo, materialFor(color, w, h, rng() < 0.5));
        mesh.scale.set(w, h, d);
        mesh.position.set(x + w / 2, h / 2, z + d / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        buildings.push({ x: x + w / 2, z: z + d / 2, hw: w / 2, hd: d / 2, h });
      }
    }
  }

  // Palm trees along the beach and scattered through the villa districts.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondGeo = new THREE.BoxGeometry(0.5, 0.12, 5.5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  function plantPalm(x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 4.5;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let i = 0; i < 5; i += 1) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.6, 9.2, Math.sin(a) * 1.6);
      frond.rotation.y = -a;
      frond.rotation.x = 0.5;
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    group.add(palm);
  }
  for (let x = -460; x <= 460; x += 40) plantPalm(x + (rng() - 0.5) * 12, 415 + rng() * 30);
  for (let i = 0; i < 18; i += 1) {
    plantPalm(-480 + rng() * 380, 120 + rng() * 160);
  }

  // Marina boats in the sea, south of the beach.
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const boatCabinMat = new THREE.MeshLambertMaterial({ color: 0x2a6fa8 });
  for (let i = 0; i < 4; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo, boatMat);
    hull.scale.set(6, 2.2, 16);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(boxGeo, boatCabinMat);
    cabin.scale.set(4, 2, 6);
    cabin.position.set(0, 2.2, -1);
    boat.add(cabin);
    boat.position.set(-360 + i * 220, -0.2, 530 + (i % 2) * 18);
    boat.rotation.y = (rng() - 0.5) * 0.4;
    group.add(boat);
  }

  // Beach umbrellas along the sand: bright cones on poles, two rows,
  // so the beach reads as a beach instead of an empty strip.
  const umbrellaColors = [0xff6b6b, 0x2ec4b6, 0xffd23f, 0xff8fab, 0x4fc3f7, 0xff9f1c];
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const canopyGeo = new THREE.ConeGeometry(3.4, 1.7, 8);
  for (let x = -460; x <= 460; x += 38) {
    for (const rz of [418, 448]) {
      const jx = x + (rng() - 0.5) * 14;
      const jz = rz + (rng() - 0.5) * 10;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(jx, 1.6, jz);
      group.add(pole);
      const canopy = new THREE.Mesh(
        canopyGeo,
        new THREE.MeshLambertMaterial({ color: umbrellaColors[Math.floor(rng() * umbrellaColors.length)] }),
      );
      canopy.position.set(jx, 3.8, jz);
      canopy.castShadow = true;
      group.add(canopy);
    }
  }

  // The Marina Bay ferris wheel: a landmark on the beachfront, visible
  // from the chase route driving south. Ring, legs, hub, eight cabins.
  const wheel = new THREE.Group();
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const wheelAccent = new THREE.MeshLambertMaterial({ color: 0xff6b6b });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 0.9, 8, 36), wheelMat);
  ring.position.y = 30;
  wheel.add(ring);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    // Spoke from hub to rim: long axis along the radial direction.
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.7, 47, 0.7), wheelMat);
    spoke.position.set(Math.sin(a) * 12, 30 + Math.cos(a) * 12, 0);
    spoke.rotation.z = -a;
    wheel.add(spoke);
    const cabin = new THREE.Mesh(boxGeo, i % 2 === 0 ? wheelAccent : wheelMat);
    cabin.scale.set(3.4, 2.6, 2.6);
    cabin.position.set(Math.sin(a) * 24, 30 + Math.cos(a) * 24, 0);
    wheel.add(cabin);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.5, 10), wheelAccent);
  hub.rotation.x = Math.PI / 2;
  hub.position.y = 30;
  wheel.add(hub);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 34, 1.6), wheelMat);
    leg.position.set(s * 10, 15, 0);
    leg.rotation.z = -s * 0.32;
    wheel.add(leg);
  }
  wheel.scale.setScalar(0.9);
  wheel.position.set(140, 0, 470);
  group.add(wheel);

  // Palm boulevard: palms flanking the x=100 road through Marina Bay,
  // so the chase approach is lined instead of bare.
  for (let z = 300; z <= 420; z += 30) {
    plantPalm(86 + (rng() - 0.5) * 4, z + (rng() - 0.5) * 6);
    plantPalm(114 + (rng() - 0.5) * 4, z + 15 + (rng() - 0.5) * 6);
  }

  // Place markers: a glowing ring on the ground and a floating sign.
  const placeMarkers = [];
  const ringGeo = new THREE.RingGeometry(4, 5.2, 24);
  for (const place of PLACES) {
    const color = place.kind === 'safehouse' ? '#2ecc71' : place.kind === 'garage' ? '#f39c12' : '#e74c3c';
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(place.x, 0.08, place.z);
    group.add(ring);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(place.name.toUpperCase(), color), transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(place.x, 9, place.z);
    group.add(sign);
    placeMarkers.push({ place, ring, sign });
  }

  function collides(x, z, r) {
    if (Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return true;
    }
    return false;
  }

  function onRoad(x, z) {
    const dx = Math.abs(x - roadCentre(x));
    const dz = Math.abs(z - roadCentre(z));
    return dx < ROAD_WIDTH / 2 || dz < ROAD_WIDTH / 2;
  }

  function nearestRoadPoint(x, z) {
    const cx = roadCentre(x);
    const cz = roadCentre(z);
    // Snap to whichever road line is closer.
    if (Math.abs(x - cx) < Math.abs(z - cz)) return { x: cx, z };
    return { x, z: cz };
  }

  function randomRoadPoint() {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = (Math.floor(rng() * 11) - 5) * ROAD_SPACING;
    const along = -450 + rng() * 900;
    if (axis === 'x') return { x: along, z: line, angle: rng() < 0.5 ? 0 : Math.PI };
    return { x: line, z: along, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  return { group, buildings, placeMarkers, collides, onRoad, nearestRoadPoint, randomRoadPoint, districtAt };
}
