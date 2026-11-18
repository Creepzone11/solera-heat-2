// The HUD: everything drawn in the DOM over the 3D view — wanted stars,
// cash, job counter, objective banner, dialogue, speed, radio, health,
// the interaction prompt, the district name, and the screens (title,
// pause, busted, wasted, win). Updated from the game state each frame;
// text is only rewritten when it changes.
import { CREW, RADIO, districtAt } from './config.js';

const STAR_ON = '★';
const STAR_OFF = '☆';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = {
    stars: el('hud-stars'), cash: el('hud-cash'), job: el('hud-job'),
    objective: el('hud-objective'), district: el('hud-district'),
    speed: el('hud-speed'), radio: el('hud-radio'), health: el('hud-health'),
    healthFill: el('hud-health-fill'), carHealth: el('hud-carhealth'),
    carHealthLabel: el('hud-carhealth-label'),
    carHealthFill: el('hud-carhealth-fill'), prompt: el('hud-prompt'),
    dialogue: el('hud-dialogue'), dialogueName: el('hud-dialogue-name'),
    dialogueText: el('hud-dialogue-text'), banner: el('hud-banner'),
    damage: el('hud-damage'), title: el('screen-title'), pause: el('screen-pause'),
    busted: el('screen-busted'), bustedText: el('screen-busted-text'),
    wasted: el('screen-wasted'), win: el('screen-win'),
    help: el('hud-help'),
  };
  const cache = {};
  function set(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }
  function show(node, visible) { node.style.display = visible ? '' : 'none'; }

  function update(S) {
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < S.wanted ? STAR_ON : STAR_OFF;
    set(hud.stars, 'stars', stars);
    hud.stars.classList.toggle('hot', S.wanted >= 3);
    set(hud.cash, 'cash', `$${S.cash.toLocaleString('en-US')}`);
    set(hud.job, 'job', S.job ? `JOB ${S.job.id}/9 — ${S.job.name}` : 'FREE ROAM');
    set(hud.objective, 'objective', S.objectiveText || '');
    set(hud.district, 'district', districtAt(S.player.x, S.player.z).name);
    const speed = S.player.car ? Math.abs(S.player.car.speed) * 2.4 : 0;
    set(hud.speed, 'speed', S.player.car ? `${Math.round(speed)} mph${S.nosActive ? '  NOS!' : ''}` : 'ON FOOT');
    set(hud.radio, 'radio', S.audio ? S.audio.stationName() : RADIO[0].name);
    set(hud.health, 'health', `HEALTH ${Math.max(0, Math.round(S.player.health))}`);
    hud.healthFill.style.width = `${Math.max(0, S.player.health)}%`;
    if (S.player.car) {
      show(hud.carHealth, true);
      set(hud.carHealthLabel, 'carhealth', `CAR ${Math.max(0, Math.round(S.player.car.health))}`);
      hud.carHealthFill.style.width = `${Math.max(0, S.player.car.health)}%`;
    } else {
      show(hud.carHealth, false);
    }
    // Interaction prompt: steal a car, use a place, enter a car.
    set(hud.prompt, 'prompt', S.prompt || '');
    show(hud.prompt, !!S.prompt);
    // Dialogue box from the crew.
    if (S.dialogue && S.dialogueTimer > 0) {
      show(hud.dialogue, true);
      const name = S.dialogueName || 'CREW';
      set(hud.dialogueName, 'dname', name);
      set(hud.dialogueText, 'dtext', S.dialogue);
    } else {
      show(hud.dialogue, false);
    }
    // Centre banner for job starts, completions and unlocks.
    if (S.banner && S.bannerTimer > 0) {
      show(hud.banner, true);
      set(hud.banner, 'banner', S.banner);
    } else {
      show(hud.banner, false);
    }
    hud.damage.style.opacity = String(Math.min(0.85, S.damageFlash));
    // Screens.
    show(hud.title, S.screen === 'title');
    show(hud.pause, S.screen === 'paused');
    show(hud.busted, S.screen === 'busted');
    show(hud.wasted, S.screen === 'wasted');
    show(hud.win, S.gameWon && S.screen === 'play');
    if (S.screen === 'busted') set(hud.bustedText, 'busted', S.bustedReason || 'Busted.');
    hud.help.style.opacity = S.shotMode ? '0' : S.screen === 'play' && S.time < 12 ? '0.85' : '0';
  }

  return { update, elements: hud };
}

export function dialogueFrom(S, giverKey, text) {
  S.dialogue = text;
  S.dialogueName = CREW[giverKey] ? CREW[giverKey].name.toUpperCase() : 'CREW';
  S.dialogueTimer = 7;
}
