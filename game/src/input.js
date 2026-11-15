// Keyboard and mouse input. One place owns the control state; the game reads
// it every fixed step. Mouse look is accumulated in pixels between steps.
export function createInput(canvas, lockCallback) {
  const state = {
    keys: new Set(), // e.code strings currently held
    firing: false, // primary fire held
    interact: false, // E: plant / defuse / use
    nade: false, // G: throw grenade
    buy: false, // B: open buy menu
    lookDX: 0,
    lookDY: 0,
    locked: false,
  };

  const onKey = (down) => (event) => {
    if (event.repeat) return;
    const code = event.code;
    if (code === 'Space') event.preventDefault();
    if (down) state.keys.add(code);
    else state.keys.delete(code);
    if (code === 'KeyE') state.interact = down;
    if (code === 'KeyG') state.nade = down;
    if (code === 'KeyB') state.buy = down;
    if (code === 'KeyR' && down) state.keys.add('_reloadTap');
    if (code === 'Digit1' && down) state.keys.add('_slot1');
    if (code === 'Digit2' && down) state.keys.add('_slot2');
    if (code === 'Digit3' && down) state.keys.add('_slot3');
  };

  const onMouseMove = (event) => {
    if (!state.locked) return;
    state.lookDX += event.movementX;
    state.lookDY += event.movementY;
  };

  const onMouseDown = (event) => {
    if (event.button === 0) {
      state.firing = true;
      if (!state.locked) requestLock();
    }
    if (event.button === 2) state.interact = true;
  };

  const onMouseUp = (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.interact = false;
  };

  const onLockChange = () => {
    state.locked = document.pointerLockElement === canvas;
    state.lookDX = 0;
    state.lookDY = 0;
    if (lockCallback) lockCallback(state.locked);
  };

  function requestLock() {
    if (!state.locked && canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* pointer lock unavailable; still playable */
      }
    }
  }

  function release() {
    if (state.locked && document.exitPointerLock) document.exitPointerLock();
  }

  function takeLook() {
    const dx = state.lookDX;
    const dy = state.lookDY;
    state.lookDX = 0;
    state.lookDY = 0;
    return { x: dx, y: dy };
  }

  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  return { state, requestLock, release, takeLook };
}
