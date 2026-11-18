// Saving: cash, jobs finished, weapons owned and garage upgrades live in
// localStorage, so a visit ends where the last one did. Autosave runs
// after every completed job and at the safehouse; a manual save happens
// there too. Nothing here touches the network.
import { SAVE_KEY } from './config.js';

export function saveGame(S) {
  try {
    const data = {
      cash: S.cash,
      jobsCompleted: S.jobsCompleted,
      ownedWeapons: S.ownedWeapons,
      upgrades: S.upgrades,
      jobId: S.job ? S.job.id : 1,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    S.savedFlash = 1.5;
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      jobsCompleted: typeof data.jobsCompleted === 'number' ? data.jobsCompleted : 0,
      ownedWeapons: Array.isArray(data.ownedWeapons) ? data.ownedWeapons : ['pistol'],
      upgrades: typeof data.upgrades === 'object' && data.upgrades !== null ? data.upgrades : {},
      jobId: typeof data.jobId === 'number' ? data.jobId : 1,
    };
  } catch {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}
