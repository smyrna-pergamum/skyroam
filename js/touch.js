// Two-thumb touch controls for phones and tablets.
//   left thumb : virtual stick (push up = nose down, pull down = nose up, sideways = bank)
//   right thumb: throttle lever (the on-screen one) + rudder, brake, gear and camera buttons
// Writes into input.touch; Input.poll() merges it with keyboard and gamepad.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class TouchControls {
  constructor(input, hud) {
    this.input = input;
    input.touch = { pitch: 0, roll: 0, yaw: 0, brake: false, active: false };
    this.enabled = false;

    const root = document.createElement('div');
    root.className = 'touch-ui';
    root.innerHTML = `
      <div class="t-stick" id="tStick" aria-label="stick">
        <div class="t-base"><div class="t-knob" id="tKnob"></div></div>
      </div>
      <div class="t-right">
        <div class="t-row">
          <button type="button" class="t-btn" data-hold="yawL" aria-label="rudder left">◀</button>
          <button type="button" class="t-btn" data-hold="yawR" aria-label="rudder right">▶</button>
        </div>
        <div class="t-row">
          <button type="button" class="t-btn" data-hold="brake" aria-label="brake">⛔</button>
          <button type="button" class="t-btn" data-edge="gear" aria-label="gear">⚙</button>
          <button type="button" class="t-btn" data-edge="camera" aria-label="camera">🎥</button>
        </div>
      </div>
      <button type="button" class="t-btn t-pause" data-edge="pause" aria-label="pause">❚❚</button>`;
    hud.append(root);
    this.root = root;

    // ---- stick: any touch that starts in the left half's lower area grabs it; base recentres there
    const zone = root.querySelector('#tStick');
    const base = zone.querySelector('.t-base');
    const knob = root.querySelector('#tKnob');
    let id = null, cx = 0, cy = 0;
    const R = () => base.offsetWidth / 2 || 60;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const move = e => {
      const r = R();
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const m = Math.hypot(dx, dy);
      if (m > r) { dx *= r / m; dy *= r / m; }
      setKnob(dx, dy);
      // small deadzone, gentle curve so small thumb movements are precise
      const shape = v => { const a = Math.abs(v); return a < 0.08 ? 0 : Math.sign(v) * Math.pow((a - 0.08) / 0.92, 1.4); };
      input.touch.roll = shape(dx / r);
      input.touch.pitch = shape(dy / r); // pull down = nose up
    };
    zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch { /* capture is a nicety */ }
      const zr = zone.getBoundingClientRect();
      // floating stick: centre the base under the thumb
      const r = R();
      const bx = clamp(e.clientX - zr.left, r, zr.width - r), by = clamp(e.clientY - zr.top, r, zr.height - r);
      base.style.left = `${bx - r}px`; base.style.top = `${by - r}px`;
      cx = zr.left + bx; cy = zr.top + by;
      zone.classList.add('on');
      move(e);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      zone.classList.remove('on');
      setKnob(0, 0);
      input.touch.roll = 0; input.touch.pitch = 0;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // ---- buttons
    const holds = { yawL: false, yawR: false, brake: false };
    const sync = () => {
      input.touch.yaw = (holds.yawR ? 1 : 0) - (holds.yawL ? 1 : 0);
      input.touch.brake = holds.brake;
    };
    root.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      const on = e => { holds[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ } sync(); e.preventDefault(); };
      const off = () => { holds[k] = false; b.classList.remove('on'); sync(); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
    });
    root.querySelectorAll('[data-edge]').forEach(b => {
      b.addEventListener('pointerdown', e => { input.edges.add(b.dataset.edge); e.preventDefault(); });
    });
    root.addEventListener('contextmenu', e => e.preventDefault());

    // Enable on touch devices, or the first time someone touches the screen.
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (coarse || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches) this.enable();
    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.input.touch.active = true;
    document.body.classList.add('touch');
  }
}
