// Unified input: keyboard + mouse (pointer lock or drag-look fallback) + gamepad + touch controls.
import { clamp } from './util.js';

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    this.locked = false;
    this.dragLook = false;
    this.enabled = true;
    this.touch = { active: false, mx: 0, my: 0, lookDx: 0, lookDy: 0, buttons: new Set(), pressed: new Set() };
    this.gp = null;
    this.gpPrev = [];
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this._dev = null;     // last device used: 'kb' | 'pad' | 'touch' (hints show its buttons)
    this._l3 = 0; this._sirenPad = false;
    this._bind();
    if (touchRoot) this._buildTouch(touchRoot);
  }
  _bind() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this._dev = 'kb';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._dev = 'kb';
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (!this.locked && this.wantLock) this.requestLock();
      if (!this.locked) this.dragLook = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      this.dragLook = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragLook) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
    });
    c.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
  }
  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable: drag-look fallback */ }
  }
  exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} }

  // ---- touch UI
  _buildTouch(root) {
    if (!this.isTouch) return;
    root.classList.add('touch-on');
    const stick = root.querySelector('#tStick'), knob = root.querySelector('#tKnob');
    let sid = null, sx = 0, sy = 0;
    addEventListener('touchstart', () => { this._dev = 'touch'; }, { passive: true, capture: true });
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; sid = t.identifier;
      const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      this.touch.active = true; e.preventDefault();
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          const dx = t.clientX - sx, dy = t.clientY - sy, R = 55;
          const l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R);
          this.touch.mx = (dx / l) * k; this.touch.my = (dy / l) * k;
          knob.style.transform = `translate(${(dx / l) * k * R}px, ${(dy / l) * k * R}px)`;
        } else if (t.identifier === this._lookId) {
          this.touch.lookDx += (t.clientX - this._lx) * 1.6; this.touch.lookDy += (t.clientY - this._ly) * 1.6;
          this._lx = t.clientX; this._ly = t.clientY;
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) { sid = null; this.touch.mx = this.touch.my = 0; knob.style.transform = ''; }
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    const look = root.querySelector('#tLook');
    look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; this._lookId = t.identifier; this._lx = t.clientX; this._ly = t.clientY; e.preventDefault(); }, { passive: false });
    root.querySelectorAll('[data-btn]').forEach((b) => {
      const name = b.dataset.btn;
      let lastTap = 0;
      b.addEventListener('touchstart', (e) => {
        this.touch.buttons.add(name); this.touch.pressed.add(name); b.classList.add('on');
        // double tap on the horn toggles the siren (police cars)
        const now = performance.now();
        if (name === 'horn' && now - lastTap < 380) this.touch.pressed.add('siren');
        lastTap = now;
        e.preventDefault(); e.stopPropagation();
      }, { passive: false });
      const up = (e) => { this.touch.buttons.delete(name); b.classList.remove('on'); e.preventDefault(); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    });
  }

  // ---- per-frame
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gp = null;
    for (const p of pads) if (p && p.connected) { this.gp = p; break; }
    const gp = this.gp;
    if (gp && (gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.35))) this._dev = 'pad';
    // L3 twice in a row: the siren (a single press is the horn in a car, crouch on foot)
    if (this.gpPressed(10)) { const now = performance.now(); if (now - this._l3 < 380) this._sirenPad = true; this._l3 = now; }
  }
  // the device the player is using now, and a button label for it in hints: keyboard key, pad button or touch button
  get device() { return this._dev || (this.isTouch ? 'touch' : this.gp ? 'pad' : 'kb'); }
  padName(i) {
    const ps = this.gp && /054c|dualshock|dualsense|playstation|wireless controller/i.test(this.gp.id);
    return (ps ? ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '▲', '▼', '◀', '▶']
      : ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menú', 'L3', 'R3', '▲', '▼', '◀', '▶'])[i] || '?';
  }
  key(kb, pad, touch) {
    const d = this.device;
    if (d === 'pad' && pad != null) return `<kbd class="pad">${typeof pad === 'number' ? this.padName(pad) : pad}</kbd>`;
    if (d === 'touch' && touch) return `<b>${touch}</b>`;
    return kb.split('/').map((k) => `<kbd>${k}</kbd>`).join('/');
  }
  // the same, as plain text (notifications escape HTML)
  keyText(kb, pad, touch) {
    const d = this.device;
    if (d === 'pad' && pad != null) return typeof pad === 'number' ? this.padName(pad) : pad;
    if (d === 'touch' && touch) return touch;
    return kb;
  }
  get gpAim() { return this.gp ? (this.gp.buttons[6]?.value || 0) > 0.4 : false; }
  gpBtn(i) { return this.gp && this.gp.buttons[i] && this.gp.buttons[i].pressed; }
  gpPressed(i) { return this.gpBtn(i) && !this.gpPrev[i]; }
  gpAxis(i) { if (!this.gp) return 0; const v = this.gp.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  // logical actions
  // with the phone open the arrow keys (and the D-pad) belong to the phone
  get moveX() { const ar = !this.phoneOpen; return clamp((this.down('KeyD') || (ar && this.down('ArrowRight')) ? 1 : 0) - (this.down('KeyA') || (ar && this.down('ArrowLeft')) ? 1 : 0) + this.gpAxis(0) + this.touch.mx, -1, 1); }
  get moveY() { const ar = !this.phoneOpen; return clamp((this.down('KeyW') || (ar && this.down('ArrowUp')) ? 1 : 0) - (this.down('KeyS') || (ar && this.down('ArrowDown')) ? 1 : 0) - this.gpAxis(1) - this.touch.my, -1, 1); }
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight') || this.gpBtn(0) || this.touch.buttons.has('sprint'); }
  get jump() { return this.hit('Space') || (!this.gpAim && this.gpPressed(2)) || this.touch.pressed.has('jump'); }
  get enter() { return this.hit('KeyF') || (!this.phoneOpen && this.hit('Enter')) || this.gpPressed(3) || this.touch.pressed.has('enter'); } // (with the phone open, Intro is the phone's: it tunes the radio)
  get attack() { return this.mouse.leftPressed || (!this.phoneOpen && this.gpPressed(1)) || this.touch.pressed.has('attack'); }
  // combat
  get aim() { return this.mouse.right || (this.gp ? (this.gp.buttons[6]?.value || 0) > 0.4 : false); }
  get fire() { return this.mouse.left || (this.gp ? (this.gp.buttons[7]?.value || 0) > 0.4 || this.gpBtn(1) : false) || this.touch.buttons.has('attack'); }
  get firePressed() { return this.mouse.leftPressed || this.gpPressed(7) || (!this.phoneOpen && this.gpPressed(1)) || this.touch.pressed.has('attack'); }
  get weaponNext() { return this.mouse.wheel > 0 || this.hit('KeyQ') || this.gpPressed(5) || this.touch.pressed.has('weapon'); }
  get weaponPrev() { return this.mouse.wheel < 0 || this.gpPressed(4); }
  get weaponDigit() { for (let i = 1; i <= 6; i++) if (this.hit('Digit' + i)) return i; return 0; }
  get reload() { return this.hit('KeyR') || (this.gpAim && this.gpPressed(2)); } // pad: X while aiming
  get interact() { return this.hit('KeyE') || (!this.phoneOpen && this.gpPressed(15)) || this.touch.pressed.has('talk'); }
  get throttle() { return Math.max(this.down('KeyW') || (!this.phoneOpen && this.down('ArrowUp')) ? 1 : 0, this.gp ? this.gp.buttons[7]?.value || 0 : 0, this.touch.buttons.has('gas') ? 1 : 0, this.touch.my < -0.3 && !this.touch.buttons.size ? -this.touch.my : 0); }
  get brakeIn() { return Math.max(this.down('KeyS') || (!this.phoneOpen && this.down('ArrowDown')) ? 1 : 0, this.gp ? this.gp.buttons[6]?.value || 0 : 0, this.touch.buttons.has('brake') ? 1 : 0, this.touch.my > 0.45 && !this.touch.buttons.size ? this.touch.my : 0); }
  get steer() { const ar = !this.phoneOpen; return clamp((this.down('KeyD') || (ar && this.down('ArrowRight')) ? 1 : 0) - (this.down('KeyA') || (ar && this.down('ArrowLeft')) ? 1 : 0) + this.gpAxis(0) + this.touch.mx * 1.2, -1, 1); }
  get handbrake() { return this.down('Space') || this.gpBtn(5) || this.touch.buttons.has('hand'); }
  get horn() { return this.down('KeyH') || this.gpBtn(10) || this.touch.buttons.has('horn'); }
  get lookBack() { return this.down('KeyC') || this.gpBtn(11); }
  get crouch() { return this.hit('KeyC') || this.hit('ControlLeft') || this.gpPressed(10) || this.touch.pressed.has('crouch'); } // on foot (L3, like GTA)
  get shift() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get radioNext() { return this.hit('KeyR') || (!this.phoneOpen && this.gpPressed(14)) || this.touch.pressed.has('radio'); }
  get map() { return this.hit('KeyM') || this.gpPressed(8) || this.touch.pressed.has('map'); }
  get pause() { return this.hit('Escape') || this.hit('KeyP') || this.gpPressed(9) || this.touch.pressed.has('pause'); }
  get camToggle() { return this.hit('KeyV') || (!this.phoneOpen && this.gpPressed(13)); }
  get phone() { return this.hit('Tab') || (!this.phoneOpen && this.gpPressed(12)) || this.touch.pressed.has('phone'); }
  get lights() { return this.hit('KeyL'); }
  get inventory() { return this.hit('KeyI') || this.touch.pressed.has('inv'); }
  get siren() { return this.hit('KeyG') || this.touch.pressed.has('siren') || this._sirenPad; }
  get skip() { return this.hit('Space') || this.hit('Enter') || this.gpPressed(0) || this.touch.pressed.has('jump') || this.touch.pressed.has('enter'); }
  look() {
    let dx = this.mouse.dx, dy = this.mouse.dy;
    dx += this.gpAxis(2) * 14; dy += this.gpAxis(3) * 10;
    dx += this.touch.lookDx; dy += this.touch.lookDy;
    return [dx, dy];
  }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.touch.lookDx = this.touch.lookDy = 0;
    this.touch.pressed.clear();
    this._sirenPad = false;
    if (this.gp) this.gpPrev = this.gp.buttons.map((b) => b.pressed);
  }
}
