// Input layer: gameplay reads named actions; bindings are data.
// Keyboard uses physical key codes (event.code) so WASD stays in place on AZERTY/Dvorak.

const BINDINGS = {
  pitchDown:    ['KeyW', 'ArrowUp'],
  pitchUp:      ['KeyS', 'ArrowDown'],
  rollLeft:     ['KeyA', 'ArrowLeft'],
  rollRight:    ['KeyD', 'ArrowRight'],
  yawLeft:      ['KeyQ'],
  yawRight:     ['KeyE'],
  throttleUp:   ['KeyR', 'Equal', 'NumpadAdd', 'ShiftLeft'],
  throttleDown: ['KeyF', 'Minus', 'NumpadSubtract'],
  brake:        ['Space', 'KeyB'],
  // edge (one-shot) actions
  camera:       ['KeyC'],
  pause:        ['KeyP', 'Escape'],
  mute:         ['KeyM'],
  minimap:      ['KeyN'],
  gear:         ['KeyG'],
  timeOfDay:    ['KeyT'],
  radar:        ['KeyV'],
  restart:      ['Enter', 'NumpadEnter'],
};
const EDGE = new Set(['camera', 'pause', 'mute', 'restart', 'minimap', 'gear', 'timeOfDay', 'radar']);

export const KEY_HELP = [
  ['kPitch', ['W', 'S', '↑', '↓']],
  ['kRoll', ['A', 'D', '←', '→']],
  ['kYaw', ['Q', 'E']],
  ['kThrottle', ['R', 'F', '+', '−']],
  ['kBrake', ['Space']],
  ['kCamera', ['C']],
  ['kPause', ['P', 'Esc']],
  ['kMute', ['M']],
  ['kGear', ['G']],
  ['kMinimap', ['N']],
  ['kTime', ['T']],
  ['kRadar', ['V']],
  ['kRestart', ['Enter']],
];

const codeToAction = new Map();
for (const [action, codes] of Object.entries(BINDINGS)) for (const c of codes) codeToAction.set(c, action);

function radialDeadzone(x, y, dead = 0.15, curve = 1.6) {
  const mag = Math.hypot(x, y);
  if (mag <= dead) return [0, 0];
  const scaled = Math.min((mag - dead) / (1 - dead), 1);
  const k = Math.pow(scaled, curve) / mag;
  return [x * k, y * k];
}

export class Input {
  constructor() {
    this.held = new Set();
    this.edges = new Set();
    this.axes = { pitch: 0, roll: 0, yaw: 0, throttleRate: 0, throttleAbs: null, brake: false };
    this._kb = { pitch: 0, roll: 0, yaw: 0 };
    this._padPrev = [];
    this.invert = false;
    this.usingPad = false;

    addEventListener('keydown', e => {
      const a = codeToAction.get(e.code);
      if (!a) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      if (EDGE.has(a)) { if (!e.repeat) this.edges.add(a); }
      else this.held.add(a);
      this.usingPad = false;
    });
    addEventListener('keyup', e => {
      const a = codeToAction.get(e.code);
      if (a) this.held.delete(a);
    });
    addEventListener('blur', () => this.held.clear());
  }

  /** True once per press. */
  consume(action) {
    if (this.edges.has(action)) { this.edges.delete(action); return true; }
    return false;
  }

  clearEdges() { this.edges.clear(); }

  /** Sample keyboard + gamepad into this.axes. Call once per rendered frame. */
  poll(dt) {
    const h = a => (this.held.has(a) ? 1 : 0);
    // Keyboard axes ramp toward their target so taps are gentle and holds are full.
    const ramp = (cur, target, rate) => {
      const d = target - cur;
      const step = rate * dt;
      return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
    };
    const kb = this._kb;
    kb.pitch = ramp(kb.pitch, h('pitchUp') - h('pitchDown'), 4);
    kb.roll = ramp(kb.roll, h('rollRight') - h('rollLeft'), 5);
    kb.yaw = ramp(kb.yaw, h('yawRight') - h('yawLeft'), 4);

    let pitch = kb.pitch, roll = kb.roll, yaw = kb.yaw;
    let throttleRate = h('throttleUp') - h('throttleDown');
    let throttleAbs = null;
    let brake = this.held.has('brake');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(p => p && p.connected);
    if (pad) {
      const [sx, sy] = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0);
      const btn = i => pad.buttons[i] ? pad.buttons[i].value : 0;
      const pressed = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      if (sx || sy) { this.usingPad = true; }
      if (this.usingPad) {
        roll = Math.abs(sx) > Math.abs(roll) ? sx : roll;
        // Stick back (+y) = nose up, like a real yoke.
        pitch = Math.abs(sy) > Math.abs(pitch) ? sy : pitch;
      }
      yaw += btn(5) - btn(4);
      const trig = btn(7) - btn(6);
      if (Math.abs(trig) > 0.05) throttleRate = trig;
      brake = brake || pressed(1);
      // Edge-detect pad buttons
      const edgeMap = { 0: 'camera', 9: 'pause', 3: 'mute' };
      for (const [i, a] of Object.entries(edgeMap)) {
        const now = pressed(+i);
        if (now && !this._padPrev[i]) this.edges.add(a);
        this._padPrev[i] = now;
      }
      if (pressed(0) && !this._padPrevRestart) this.edges.add('restart');
      this._padPrevRestart = pressed(0);
    }

    const tc = this.touch;
    if (tc && tc.active) {
      if (Math.abs(tc.pitch) > Math.abs(pitch)) pitch = tc.pitch;
      if (Math.abs(tc.roll) > Math.abs(roll)) roll = tc.roll;
      yaw += tc.yaw;
      brake = brake || tc.brake;
    }
    if (this.invert) pitch = -pitch;
    const ax = this.axes;
    ax.pitch = Math.max(-1, Math.min(1, pitch));
    ax.roll = Math.max(-1, Math.min(1, roll));
    ax.yaw = Math.max(-1, Math.min(1, yaw));
    ax.throttleRate = throttleRate;
    ax.throttleAbs = throttleAbs;
    ax.brake = brake;
  }
}
