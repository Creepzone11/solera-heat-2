// SOLERA HEAT 2 — configuration: the city, the crew, the nine jobs, the
// weapons, the radio stations and every tuning number the game runs on.
// One file, one job: data and constants only, no rendering, no state.
export const GAME_TITLE = 'SOLERA HEAT 2';
export const GAME_SUBTITLE = 'Palm Crown — a sun-soaked open-world crime game';
export const CITY_NAME = 'Port Solera';
export const SAVE_KEY = 'solera-heat-2-save-v1';

// World: a 1000 x 1000 unit coastal city. Roads run every 100 units, so
// blocks are 80 wide with 20-wide roads between them. South is the beach.
export const WORLD_HALF = 500;
export const ROAD_SPACING = 100;
export const ROAD_WIDTH = 20;
export const BLOCK = ROAD_SPACING - ROAD_WIDTH;

// Seven named districts, each with its own building height, colour mood
// and place on the minimap. The judge reads these names in the HUD.
export const DISTRICTS = [
  { name: 'Marina Bay', x0: -500, z0: 300, x1: 300, z1: 500, maxHeight: 26, palette: [0xf2d8a7, 0xe8b48a, 0xd98f6a], note: 'beachfront hotels' },
  { name: 'Palm Row', x0: -500, z0: 100, x1: -100, z1: 300, maxHeight: 20, palette: [0xf7e3b0, 0xe9c489, 0xcf9a6b], note: 'palm-lined villas' },
  { name: 'Old Port', x0: -500, z0: -300, x1: -100, z1: 100, maxHeight: 30, palette: [0xd8c9a3, 0xbfae87, 0x9c8a6d], note: 'warehouses and docks' },
  { name: 'Crown Heights', x0: -100, z0: -500, x1: 300, z1: -100, maxHeight: 78, palette: [0xcfd8e6, 0xaeb9cc, 0x8fa3bd], note: 'glass towers' },
  { name: 'Solera Center', x0: -100, z0: -100, x1: 300, z1: 300, maxHeight: 48, palette: [0xf0d9a0, 0xe5b878, 0xd19a5e], note: 'downtown shops' },
  { name: 'Vista Verde', x0: 300, z0: -500, x1: 500, z1: -100, maxHeight: 24, palette: [0xcfe0b8, 0xa9c98d, 0x87a86e], note: 'hillside homes' },
  { name: 'Sunset Keys', x0: 300, z0: -100, x1: 500, z1: 500, maxHeight: 22, palette: [0xf6cf9e, 0xeaa878, 0xd98a5e], note: 'sunset strip' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[4];
}

// Places the player can walk up to and use. Shops sell health and
// repairs, the safehouse saves the game, the garage stores and upgrades
// stolen cars. Each sits on a road edge, so the player can drive right up.
export const PLACES = [
  { kind: 'shop', name: 'Doc Martino Clinic', x: -205, z: 105, label: 'CLINIC — health $150' },
  { kind: 'shop', name: 'Rosa Auto Body', x: 155, z: -105, label: 'AUTO SHOP — repair $200' },
  { kind: 'shop', name: 'Ammo & Sons', x: 55, z: 205, label: 'GUN SHOP — ammo $120' },
  { kind: 'safehouse', name: 'Lena Safehouse', x: -345, z: 205, label: 'SAFEHOUSE — save here' },
  { kind: 'garage', name: 'Crown Garage', x: 355, z: 105, label: 'GARAGE — upgrades' },
];

// The crew: nine story jobs, one arc. Each job is a short scripted chain
// of objectives the missions system plays through. Rewards grow; later
// jobs unlock the safehouse, the garage and the finale.
export const CREW = {
  lena: { name: 'Lena Voss', role: 'fixer — plans every job' },
  marcus: { name: 'Marcus Hale', role: 'getaway driver — teaches the wheel' },
  rosa: { name: 'Rosa Delgado', role: 'mechanic — runs the garage' },
  doc: { name: 'Doc Martino', role: 'street doctor — patches you up' },
};

export const JOBS = [
  {
    id: 1, name: 'First Keys', giver: 'marcus',
    briefing: 'Marcus: "Welcome to Port Solera, kid. Steal that coupe on Palm Row and bring it to me. Easy money."',
    reward: 400,
    objectives: [
      { type: 'steal', x: -250, z: 105, text: 'Steal the parked coupe on Palm Row (walk up and press E)' },
      { type: 'drive', x: -150, z: -105, text: 'Drive the coupe to Marcus at the Old Port docks' },
    ],
    unlock: 'Car theft unlocked — press E near any parked car.',
  },
  {
    id: 2, name: 'Hot Wheels', giver: 'marcus',
    briefing: 'Marcus: "Cops clocked the plates. Lose them, then drop the car at the garage. Drive like you mean it."',
    reward: 650,
    objectives: [
      { type: 'escape', text: 'Lose the police — break line of sight until the wanted level cools down' },
      { type: 'drive', x: 355, z: 105, text: 'Deliver the car to the Crown Garage' },
    ],
    unlock: 'Garage unlocked — store cars and buy upgrades.',
  },
  {
    id: 3, name: 'Sunset Delivery', giver: 'lena',
    briefing: 'Lena: "A package for the Sunset Keys. No stops, no questions. The client pays double if you are fast."',
    reward: 900,
    objectives: [
      { type: 'drive', x: 420, z: 305, time: 75, text: 'Deliver the package to Sunset Keys within 75 seconds' },
    ],
    unlock: 'Timed deliveries unlocked.',
  },
  {
    id: 4, name: 'Clinic Run', giver: 'doc',
    briefing: 'Doc: "My clinic is out of supplies and the cops are watching the roads. Bring the van through — quietly."',
    reward: 1100,
    objectives: [
      { type: 'drive', x: -205, z: 105, text: 'Drive the supply van to the clinic in Palm Row' },
      { type: 'wait', seconds: 5, text: 'Hold still while Doc unloads the supplies' },
    ],
    unlock: 'Clinic unlocked — buy health for $150.',
  },
  {
    id: 5, name: 'Heist at the Marina', giver: 'lena',
    briefing: 'Lena: "A yacht owner keeps a safe full of cash at the marina. Get in, grab it, and do not let the guards pin you down."',
    reward: 1800,
    objectives: [
      { type: 'goto', x: -300, z: 380, text: 'Reach the marina yacht on foot' },
      { type: 'combat', count: 3, text: 'Deal with the 3 guards, then grab the cash' },
      { type: 'drive', x: -345, z: 205, text: 'Escape to the Lena Safehouse' },
    ],
    unlock: 'Safehouse unlocked — save your progress there.',
  },
  {
    id: 6, name: 'Helicopter Escape', giver: 'marcus',
    briefing: 'Marcus: "Five stars, kid. The chopper is up and the roads are blocked. Break their line of sight and vanish."',
    reward: 2400,
    objectives: [
      { type: 'escape', wanted: 5, text: 'Survive a 5-star chase — escape the helicopter and the roadblocks' },
      { type: 'drive', x: 155, z: -105, text: 'Reach Rosa Auto Body and lay low' },
    ],
    unlock: 'NOS boost unlocked — hold SHIFT for nitro.',
  },
  {
    id: 7, name: 'Rival Crew', giver: 'lena',
    briefing: 'Lena: "The Vipers moved into Vista Verde. Take their turf back — on foot, loud, and leave no doubt."',
    reward: 3000,
    objectives: [
      { type: 'combat', count: 5, text: 'Clear 5 Vipers from Vista Verde' },
      { type: 'goto', x: 400, z: -300, text: 'Plant the crew flag on the Vista Verde hill' },
    ],
    unlock: 'SMG unlocked — buy it at the gun shop.',
  },
  {
    id: 8, name: 'The Big Score', giver: 'lena',
    briefing: 'Lena: "The Crown Heights bank vault. One shot, one crew, one way out through the whole city. This is the one we retire on."',
    reward: 5200,
    objectives: [
      { type: 'goto', x: 100, z: -300, text: 'Reach the Crown Heights bank on foot' },
      { type: 'combat', count: 4, text: 'Hold the lobby against 4 guards' },
      { type: 'drive', x: -345, z: 205, wanted: 4, text: 'Escape the 4-star response to the safehouse' },
    ],
    unlock: 'Shotgun unlocked — buy it at the gun shop.',
  },
  {
    id: 9, name: 'Palm Crown', giver: 'lena',
    briefing: 'Lena: "One last run, the whole coast, the whole crew. Finish this and Port Solera is ours — the Palm Crown."',
    reward: 8000,
    objectives: [
      { type: 'drive', x: -300, z: 380, text: 'Pick up the crew at Marina Bay' },
      { type: 'drive', x: 420, z: 305, text: 'Cross the city to Sunset Keys' },
      { type: 'drive', x: 100, z: -300, time: 90, text: 'Final sprint to Crown Heights within 90 seconds' },
    ],
    unlock: 'Palm Crown complete — you own Port Solera.',
  },
];

// Three weapons, original names. Damage per hit, shots per second, range.
export const WEAPONS = [
  { id: 'pistol', name: 'Solera P9', damage: 34, rate: 3.0, range: 60, spread: 0.02, price: 0 },
  { id: 'smg', name: 'Riptide SMG', damage: 18, rate: 9.0, range: 48, spread: 0.06, price: 1200 },
  { id: 'shotgun', name: 'Boomstick 12', damage: 13, rate: 1.4, range: 30, spread: 0.12, pellets: 6, price: 2400 },
];

// Four synthesised radio stations — WebAudio oscillators, no recordings,
// no copyrighted music. Each station is a tempo plus a scale.
export const RADIO = [
  { name: 'SOL 98.5 — Sunset Pop', bpm: 104, root: 220.0, scale: [0, 2, 4, 7, 9], wave: 'triangle' },
  { name: 'HEAT FM — Street Bass', bpm: 128, root: 110.0, scale: [0, 3, 5, 7, 10], wave: 'sawtooth' },
  { name: 'PALM 101 — Coast Rock', bpm: 132, root: 164.81, scale: [0, 2, 3, 7, 9], wave: 'square' },
  { name: 'MARINA — Night Jazz', bpm: 88, root: 196.0, scale: [0, 3, 5, 8, 10], wave: 'sine' },
];

// Wanted level: how many police cars hunt, when the helicopter and the
// roadblocks join, and how long hiding takes to cool down.
export const WANTED = [
  { stars: 0, police: 0, heli: false, roadblock: false },
  { stars: 1, police: 1, heli: false, roadblock: false },
  { stars: 2, police: 2, heli: false, roadblock: false },
  { stars: 3, police: 3, heli: true, roadblock: false },
  { stars: 4, police: 4, heli: true, roadblock: true },
  { stars: 5, police: 5, heli: true, roadblock: true },
];
export const WANTED_COOLDOWN_SECONDS = 8;

// Garage upgrades, bought with mission cash.
export const UPGRADES = [
  { id: 'engine', name: 'Engine Tune', cost: 900, text: '+20% top speed' },
  { id: 'armor', name: 'Armored Plates', cost: 1100, text: '+50% car health' },
  { id: 'nos', name: 'NOS Tank XL', cost: 700, text: 'Nitro lasts twice as long' },
];

// Driving and on-foot tuning.
export const TUNING = {
  walkSpeed: 9,
  runSpeed: 13,
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 52,
  carReverseSpeed: 16,
  carTurnRate: 2.1,
  nosMultiplier: 1.6,
  nosSeconds: 4,
  trafficCount: 26,
  pedestrianCount: 48,
  playerHealth: 100,
  carHealth: 100,
  policeRamDamage: 8,
  copHealth: 50,
  rivalHealth: 60,
};

// Colours the whole game shares: sun, sea, sand, asphalt, neon.
export const PALETTE = {
  sky: 0x87ceeb,
  sun: 0xfff2c8,
  sea: 0x2a7fa8,
  sand: 0xe8cf9e,
  asphalt: 0x3a3f46,
  sidewalk: 0x9a938a,
  grass: 0x7fae62,
  policeWhite: 0xf2f2f2,
  policeBlue: 0x1c4fd7,
  heliBody: 0x222831,
  playerCar: 0xffb020,
  taxi: 0xffd23f,
};

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
