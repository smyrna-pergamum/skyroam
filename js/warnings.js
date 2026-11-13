// Cockpit warnings, modelled on real systems:
//   tones  : stall horn (light aircraft), stick shaker (jets/airliners), overspeed clacker
//   voice  : GPWS-style callouts spoken with the browser's speech synthesis
//            PULL UP, SINK RATE, TOO LOW GEAR, BANK ANGLE, STALL, OVERSPEED
//            and radio-altitude callouts on approach (100 … 10 ft) for glass-cockpit aircraft.
//   TCAS   : TRAFFIC TRAFFIC for close traffic; CLIMB / DESCEND away from a very close aircraft,
//            then CLEAR OF CONFLICT. Ground warnings come first; quiet near the ground, like the real one.
// If speech synthesis isn't available, a caution chime plays instead of the voice.

const FT = 3.28084;
const CALLOUTS = [[100, 'one hundred'], [50, 'fifty'], [40, 'forty'], [30, 'thirty'], [20, 'twenty'], [10, 'ten']];

export class Warnings {
  constructor(sound) {
    this.sound = sound;
    this.enabled = true;
    this.voice = null;
    this.next = {};          // per-callout earliest repeat time
    this.lastAglFt = null;
    this.active = '';        // most important current warning (for the HUD)
    this.speaking = false;
    const pick = () => {
      const vs = window.speechSynthesis?.getVoices?.() || [];
      this.voice = vs.find(v => /en[-_]US/i.test(v.lang) && /male|david|guy|daniel|alex/i.test(v.name))
        || vs.find(v => /^en/i.test(v.lang)) || null;
    };
    if ('speechSynthesis' in window) { pick(); speechSynthesis.addEventListener?.('voiceschanged', pick); }
  }

  reset() {
    this.next = {}; this.lastAglFt = null; this.active = ''; this.tcas = 0;
    this.sound.setAlarms({});
    try { speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  say(key, text, every, now, fighter) {
    if (now < (this.next[key] || 0)) return;
    this.next[key] = now + every;
    if (this.sound.muted) return;
    if ('speechSynthesis' in window && this.voice !== undefined) {
      try {
        speechSynthesis.cancel(); // newest warning wins, like a real priority system
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = 'en-US';
        u.rate = 1.15;
        u.pitch = fighter ? 1.35 : 0.75;
        u.volume = 0.9;
        speechSynthesis.speak(u);
        return;
      } catch { /* fall through to chime */ }
    }
    this.sound.caution();
  }

  /**
   * TCAS voice. level: 0 none, 1 traffic advisory, 2 resolution advisory; dAlt: intruder height minus ours (m).
   * Call every frame after update().
   */
  traffic(level, dAlt, s, ac) {
    const prev = this.tcas || 0;
    const agl = Number.isFinite(s.agl) ? s.agl : s.h;
    // real TCAS: no voice below ~150 m, no climb/descend commands below ~300 m
    if (!this.enabled || s.onGround || agl < 150) level = 0;
    else if (level === 2 && agl < 300) level = 1;
    this.tcas = level;
    if (this.active) return;                       // stall, PULL UP etc. have priority
    const now = performance.now() / 1000, fighter = ac.cockpit?.style === 'fighter';
    if (level === 2) {
      if (prev < 2) this.next.ta = 0;
      if (dAlt > 0) this.say('ra', 'descend, descend', 4, now, fighter);
      else this.say('ra', 'climb, climb', 4, now, fighter);
    } else if (level === 1) {
      if (prev === 0) this.next.ta = 0;
      this.say('ta', 'traffic, traffic', 12, now, fighter);
    } else if (prev === 2) {
      this.next.ra = 0; this.next.clear = 0;
      this.say('clear', 'clear of conflict', 5, now, fighter);
    }
  }

  /**
   * s: flight state, ac: resolved aircraft, gear: 0..1, top: top speed (m/s), flying: phase === 'flying'.
   * Returns the label of the most important active warning ('' when none).
   */
  update(s, ac, gear, top, flying) {
    if (!flying || !this.enabled || s.crashed) { this.sound.setAlarms({}); this.active = ''; return ''; }
    const now = performance.now() / 1000;
    const ph = ac.phys;
    const style = ac.cockpit?.style || 'ga';
    const fighter = style === 'fighter';
    const bigJet = style === 'glass';
    const agl = Number.isFinite(s.agl) ? s.agl : s.h;
    const air = !s.onGround && agl > 3;
    const levels = {};
    let label = '';

    // --- stall (warn a little before the actual stall, like real stall-warning vanes)
    const nearStall = air && (s.stalled || s.speed < ph.vStall * 1.08);
    if (nearStall) {
      if (style === 'ga' || style === 'glider') levels.horn = 1;
      else { levels.shaker = 1; this.say('stall', 'stall, stall', 2.6, now, fighter); }
      label = 'STALL';
    }

    // --- overspeed: above the top speed (a dive)
    if (top > 0 && s.speed > top * 1.04 && ph.engine !== 'none') {
      levels.clacker = 1;
      if (!label) label = 'OVERSPEED';
      if (fighter) this.say('over', 'over speed', 4, now, fighter);
    }

    // --- GPWS: closure with the ground
    const sink = -s.vs;
    const tti = sink > 0.5 ? agl / sink : Infinity; // seconds to impact
    if (air && agl < 750 && sink > 8 && tti < 9) {
      label = 'PULL UP';
      this.say('pull', 'pull up, pull up', 1.9, now, fighter);
    } else if (air && agl < 750 && sink > 6 && tti < 18) {
      if (!label) label = 'SINK RATE';
      this.say('sink', 'sink rate', 3, now, fighter);
    }

    // --- gear up close to the ground
    if (air && gear < 0.5 && agl < 160 && sink > 1 && s.speed < ph.vStall * 2.2) {
      if (!label) label = 'TOO LOW GEAR';
      this.say('gear', 'too low, gear', 3.5, now, fighter);
    }

    // --- bank angle (transport aircraft)
    if (air && (bigJet || ph.roll < 1.2) && Math.abs(s.roll) > 0.62) {
      if (!label) label = 'BANK ANGLE';
      this.say('bank', 'bank angle, bank angle', 3.5, now, fighter);
    }

    // --- radio altitude callouts on approach (glass cockpits, gear down, descending)
    const aglFt = agl * FT;
    if (bigJet && gear > 0.9 && sink > 0.3 && this.lastAglFt !== null && !s.onGround) {
      for (const [ft, word] of CALLOUTS) {
        if (this.lastAglFt > ft && aglFt <= ft) { this.next.call = 0; this.say('call', word, 0.4, now, false); break; }
      }
    }
    this.lastAglFt = aglFt;

    this.sound.setAlarms(levels);
    this.active = label;
    return label;
  }
}
