// The police helicopter: it joins the chase at 3 stars, hovers above the
// player, and sweeps a searchlight over them — which is why hiding from
// the chopper is impossible until the wanted level drops. One mesh, one
// update: circle the player, spin the rotor, aim the light.
import { clamp } from './config.js';

const THREE = window.THREE;

export function createHelicopter(S) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.9, 6.4), bodyMat);
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 1.9), glassMat);
  nose.position.set(0, -0.1, 3.6);
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 6.6), bodyMat);
  tail.position.set(0, 0.35, -6.0);
  group.add(tail);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.1, 1.4), bodyMat);
  tailFin.position.set(0, 1.0, -8.9);
  group.add(tailFin);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.14, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.3;
  rotor.name = 'rotor';
  group.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.35), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  tailRotor.position.set(0.6, 1.0, -8.9);
  tailRotor.name = 'tailrotor';
  group.add(tailRotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const sx of [-1.4, 1.4]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 5.6), skidMat);
    skid.position.set(sx, -1.3, 0);
    group.add(skid);
  }
  // The searchlight: a translucent cone plus a real spotlight, both aimed down.
  const coneGeo = new THREE.ConeGeometry(7.5, 42, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = -21;
  cone.rotation.x = Math.PI;
  cone.name = 'searchcone';
  group.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.32, 0.5, 1.2);
  spot.position.set(0, -0.5, 0);
  spot.name = 'searchlight';
  group.add(spot);
  const spotTarget = new THREE.Object3D();
  spotTarget.name = 'searchtarget';
  group.add(spotTarget);
  spot.target = spotTarget;

  group.visible = false;
  S.scene.add(group);
  return { mesh: group, active: false, orbit: 0, rotorSpeed: 0 };
}

export function startPoliceHelicopter(S) {
  if (!S.heli) return;
  S.heli.active = true;
  S.heli.mesh.visible = true;
  S.heli.mesh.position.set(S.player.x + 30, 42, S.player.z - 30);
}

export function stopPoliceHelicopter(S) {
  if (!S.heli) return;
  S.heli.active = false;
  S.heli.mesh.visible = false;
}

/** Circle the tracked point at 36 units up, rotor spinning, light pinned
 *  on it. While the player is seen, that is the player; once the player
 *  breaks away, the helicopter circles the last-seen spot instead — which
 *  is what makes escaping a 5-star chase possible at all. It flies at
 *  most 38 units a second, so a car on NOS can outrun it. */
export function updateHelicopter(S, dt) {
  const heli = S.heli;
  if (!heli || !heli.active) return;
  heli.orbit += dt * 0.35;
  const anchor = S.seen ? S.player : S.lastSeen;
  const tx = anchor.x + Math.sin(heli.orbit) * (heli.hoverRadius || 40);
  const tz = anchor.z + Math.cos(heli.orbit) * (heli.hoverRadius || 40);
  const ty = 20 + Math.sin(S.time * 0.7) * 2;
  const dx = tx - heli.mesh.position.x;
  const dy = ty - heli.mesh.position.y;
  const dz = tz - heli.mesh.position.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const step = Math.min(d, 38 * dt);
  heli.mesh.position.x += (dx / d) * step;
  heli.mesh.position.y += (dy / d) * step;
  heli.mesh.position.z += (dz / d) * step;
  heli.mesh.rotation.y = Math.atan2(anchor.x - heli.mesh.position.x, anchor.z - heli.mesh.position.z);
  const rotor = heli.mesh.getObjectByName('rotor');
  if (rotor) rotor.rotation.y += dt * 22;
  const tailRotor = heli.mesh.getObjectByName('tailrotor');
  if (tailRotor) tailRotor.rotation.x += dt * 30;
  // Aim the searchlight at the tracked point: the cone and the spot
  // both track it, whether that is the player or the last-seen spot.
  const cone = heli.mesh.getObjectByName('searchcone');
  const target = heli.mesh.getObjectByName('searchtarget');
  if (cone && target) {
    target.position.set(
      anchor.x - heli.mesh.position.x,
      -heli.mesh.position.y,
      anchor.z - heli.mesh.position.z,
    );
    const cdx = anchor.x - heli.mesh.position.x;
    const cdz = anchor.z - heli.mesh.position.z;
    const cdy = heli.mesh.position.y;
    const len = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz);
    cone.lookAt(anchor.x, 0, anchor.z);
    cone.rotateX(-Math.PI / 2);
    cone.scale.set(1, clamp(len / 42, 0.6, 1.4), 1);
  }
}
