// Keyboard and mouse input for SOLERA HEAT 2. Held keys give driving and
// walking; one-shot presses (interact, pause, radio, weapons, confirm)
// are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. Mouse click shoots;
// the aim is always the centre of the screen.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RADIO = 8;
export const ACTION_WEAPON_1 = 16;
export const ACTION_WEAPON_2 = 32;
export const ACTION_WEAPON_3 = 64;
export const ACTION_MUTE = 128;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const NOS = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const RADIO = new Set(['KeyQ']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = { forward: false, back: false, left: false, right: false, nos: false, mouse: false };
  let actions = 0;

  function onKeyDown(event) {
    if (FORWARD.has(event.code)) held.forward = true;
    else if (BACK.has(event.code)) held.back = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (NOS.has(event.code)) held.nos = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (INTERACT.has(event.code)) { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (RADIO.has(event.code)) { if (!event.repeat) actions |= ACTION_RADIO; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (event.code === 'Digit1') { if (!event.repeat) actions |= ACTION_WEAPON_1; }
    else if (event.code === 'Digit2') { if (!event.repeat) actions |= ACTION_WEAPON_2; }
    else if (event.code === 'Digit3') { if (!event.repeat) actions |= ACTION_WEAPON_3; }
    else return;
    event.preventDefault();
  }
  function onKeyUp(event) {
    if (FORWARD.has(event.code)) held.forward = false;
    else if (BACK.has(event.code)) held.back = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (NOS.has(event.code)) held.nos = false;
  }
  function onBlur() {
    held.forward = held.back = held.left = held.right = held.nos = held.mouse = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { held.mouse = true; actions |= ACTION_CONFIRM; }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) held.mouse = false;
  });

  return {
    held,
    /** -1 for left, 1 for right, 0 for neither or both. */
    steer() { return (held.right ? 1 : 0) - (held.left ? 1 : 0); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() { const taken = actions; actions = 0; return taken; },
    /** Test-only hook: pretend a key is held, so screenshot scenes can drive. */
    setHeld(name, value) { held[name] = value; },
    press(action) { actions |= action; },
  };
}
