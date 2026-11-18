// Boot and the one loop for SOLERA HEAT 2: input is read every frame,
// the world advances in fixed 1/60 s steps, the renderer paints the 3D
// scene and the DOM HUD updates. The game moves between five screens:
// title, play, paused, busted and wasted.
//
// ?seed=N fixes the world. ?shot=chase|street|escalation|mission (with
// &seed=N) stages that scene instead of running the loop, paints it a
// few times and sets window.__shotReady for a screenshot.
import { STEP, createGame, stepGame } from './state.js';
import { ACTION_CONFIRM } from './input.js';
import { stageShot } from './shots.js';
import { updateHelicopter } from './helicopter.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const S = createGame(canvas, seed, { screen: 'play', skipSave: true });
  S.audio = null; // screenshots need no sound
  S.shotMode = true; // hide the controls help in staged shots
  S.shotName = name;
  window.__debugState = S; // test hook: Playwright diagnostics read the state
  const step = (state) => stepGame(state, STEP, state.input);
  stageShot(name, S, step);
  // Settle the camera and the helicopter without rendering: the follow
  // is a lerp that never ran while the scene was staged, and a rendered
  // frame in software WebGL is slow — so advance them in a tight loop
  // instead of waiting for ninety painted frames.
  for (let i = 0; i < 120; i += 1) {
    updateHelicopter(S, 1 / 60);
    S.renderer.stepCamera(S, 1 / 60);
  }
  let painted = 0;
  function paint() {
    updateHelicopter(S, 1 / 60);
    S.renderer.render(S, 1 / 60);
    S.hud.update(S);
    S.minimap.draw(S);
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const S = createGame(canvas, seed, { screen: 'title' });
  window.__debugState = S; // test hook: Playwright diagnostics read the state
  const input = S.input;
  let accumulator = 0;
  let last = performance.now();

  function startGame() {
    S.screen = 'play';
    S.audio.start();
    announce('Playing. Follow the mission objective on the HUD.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (S.screen === 'title') {
      // Title: Space or click starts; otherwise the city lives behind
      // the menu — the world steps with the screen flipped to play, then
      // back to title, so the backdrop drives, walks and glows.
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) {
        startGame();
      } else {
        S.screen = 'play';
        while (accumulator >= STEP) {
          stepGame(S, STEP, input);
          accumulator -= STEP;
        }
        S.screen = 'title';
      }
    } else if (S.screen === 'play' || S.screen === 'paused') {
      while (accumulator >= STEP && (S.screen === 'play' || S.screen === 'paused')) {
        stepGame(S, STEP, input);
        accumulator -= STEP;
      }
    } else {
      // Busted / wasted: only a confirm press matters, and stepGame
      // handles it (respawn). Called once per frame, not stepped.
      accumulator = 0;
      stepGame(S, STEP, input);
    }
    S.renderer.render(S, 1 / 60);
    S.hud.update(S);
    S.minimap.draw(S);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.screen === 'play') S.screen = 'paused';
  });

  announce('Solera Heat 2. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
