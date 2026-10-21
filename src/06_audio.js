/* ==========================================================================
   06a · AUDIO — every sound is synthesised with the Web Audio API (no sample files).
   Engines (one oscillator voice per car; pitch follows speed, load follows throttle), tyre squeal,
   machine guns, rockets, explosions, metal hits, wall scrapes, crashes, nitro, pickups, smoke, oil,
   shield and countdown beeps. Loudness falls off with distance from the player's car.
   The AudioContext is created on the first user gesture (Start race or a key press), as browsers require.
   ========================================================================== */
const AUDIO = {
  master: 0.6,
  range: { engine: 170, gun: 240, rocket: 320, explosion: 380, hit: 200, scrape: 160, effect: 220 },
  maxVoices: 36, // one-shot voices alive at once; extra sounds are dropped
  gap: { gun: 0.045, impact: 0.07, scrape: 0.12, crash: 0.15 }, // minimum seconds between sounds of one kind
};

class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bus = null;
    this.noiseBuf = null;
    this.enabled = true;
    this.paused = false;
    this.voices = 0;
    this.engines = new Map(); // vehicle id -> { osc, osc2, filter, gain }
    this.skid = null; // { src, filter, gain } looping tyre squeal (player)
    this.listener = { x: 0, z: 0 };
    this.lastAt = {};
    this.counts = {
      engine: 0,
      gun: 0,
      rocket: 0,
      explosion: 0,
      impact: 0,
      scrape: 0,
      crash: 0,
      pickup: 0,
      smoke: 0,
      oil: 0,
      shield: 0,
      nitro: 0,
      beep: 0,
    };
  }

  /** Creates the AudioContext. Call from a user gesture. Returns false when Web Audio is unavailable. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      const comp = ctx.createDynamicsCompressor();
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? AUDIO.master : 0;
      this.bus = ctx.createGain();
      this.bus.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // one second of white noise, shared
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? AUDIO.master : 0, this.ctx.currentTime, 0.05);
  }

  /** Suspends or resumes the audio clock (used by pause, blur and menu). */
  pause(on) {
    this.paused = on;
    if (!this.ctx) return;
    if (on) this.ctx.suspend().catch(() => {});
    else if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setListener(x, z) {
    this.listener.x = x;
    this.listener.z = z;
  }

  /** Loudness factor for a source at distance d: 1 at the listener, quadratic falloff, silent past range. */
  static falloff(d, range) {
    const k = 1 - d / range;
    return k <= 0 ? 0 : k * k;
  }

  level(x, z, base, range) {
    return base * AudioFx.falloff(Math.hypot(x - this.listener.x, z - this.listener.z), range);
  }

  /** True when a sound of this kind may start: audio is live and enabled, voices are free and the gap has passed. */
  can(kind) {
    if (!this.ctx || !this.enabled || this.paused || this.ctx.state === 'closed') return false;
    if (this.voices >= AUDIO.maxVoices) return false;
    const gap = AUDIO.gap[kind] || 0;
    const t = this.ctx.currentTime;
    if (gap && this.lastAt[kind] !== undefined && t - this.lastAt[kind] < gap) return false;
    if (gap) this.lastAt[kind] = t;
    return true;
  }

  /** Starts a one-shot voice and frees its budget slot and nodes when it ends. */
  voice(src, nodes, t, dur, offset = 0) {
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      for (const n of nodes) n.disconnect();
      src.disconnect();
    };
    src.start(t, offset);
    src.stop(t + dur + 0.05);
  }

  /** Oscillator one-shot with an exponential envelope. */
  tone({ type = 'sine', freq, freqTo = null, dur, gain, delay = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.bus);
    this.voice(o, [g], t, dur);
  }

  /** Filtered noise one-shot with an exponential envelope. */
  noise({ dur, gain, filter, freq, freqTo = null, q = 0.7, attack = 0.005, delay = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    this.voice(src, [f, g], t, dur, Math.random() * 0.9);
  }

  /** Machine gun shot: sharp crack plus a low thump. */
  gun(x, z, own) {
    const g = own ? 0.5 : this.level(x, z, 0.5, AUDIO.range.gun);
    if (g < 0.003 || !this.can('gun')) return;
    this.counts.gun++;
    this.noise({ dur: 0.07, gain: g * 0.5, filter: 'bandpass', freq: 2200, freqTo: 900, q: 0.9, attack: 0.002 });
    this.tone({ type: 'sine', freq: 140, freqTo: 45, dur: 0.12, gain: g * 0.45 });
  }

  /** Rocket launch: a rising whoosh with a rumble. */
  rocket(x, z, own) {
    const g = own ? 0.45 : this.level(x, z, 0.45, AUDIO.range.rocket);
    if (g < 0.003 || !this.can('effect')) return;
    this.counts.rocket++;
    this.noise({ dur: 0.9, gain: g * 0.4, filter: 'bandpass', freq: 300, freqTo: 1400, q: 1.2, attack: 0.08 });
    this.tone({ type: 'sawtooth', freq: 70, freqTo: 120, dur: 0.6, gain: g * 0.12 });
  }

  /** Explosion: a low boom that scales with the blast radius R. */
  explosion(x, z, R = 8, own = false) {
    const base = clamp(R / 10, 0.4, 1.4) * 0.9;
    const g = own ? base : this.level(x, z, base, AUDIO.range.explosion);
    if (g < 0.003 || !this.can('explosion')) return;
    this.counts.explosion++;
    this.noise({ dur: 1.5, gain: g * 0.7, filter: 'lowpass', freq: 1400, freqTo: 120, q: 0.5, attack: 0.004 });
    this.tone({ type: 'sine', freq: 90, freqTo: 22, dur: 1.0, gain: g * 0.8 });
  }

  /** Bullet or shell hitting a vehicle: short metallic ping. */
  impact(x, z, strength = 0.6) {
    const g = this.level(x, z, 0.35 * clamp(strength, 0.2, 1.2), AUDIO.range.hit);
    if (g < 0.003 || !this.can('impact')) return;
    this.counts.impact++;
    this.tone({ type: 'triangle', freq: 1250, freqTo: 900, dur: 0.12, gain: g });
    this.noise({ dur: 0.08, gain: g * 0.5, filter: 'highpass', freq: 2500, q: 0.7, attack: 0.001 });
  }

  /** Car grinding along a barrier. */
  scrape(x, z, strength) {
    const g = this.level(x, z, 0.3 * clamp(strength, 0.2, 1.2), AUDIO.range.scrape);
    if (g < 0.003 || !this.can('scrape')) return;
    this.counts.scrape++;
    this.noise({ dur: 0.22, gain: g, filter: 'bandpass', freq: 2600, freqTo: 1800, q: 3, attack: 0.01 });
  }

  /** Car-to-car ram or hard landing: a heavy thud with a metallic tail. */
  crash(x, z, strength) {
    const g = this.level(x, z, 0.8 * clamp(strength, 0.3, 1.2), AUDIO.range.hit * 1.3);
    if (g < 0.003 || !this.can('crash')) return;
    this.counts.crash++;
    this.noise({ dur: 0.4, gain: g * 0.6, filter: 'lowpass', freq: 1600, freqTo: 300, q: 0.7, attack: 0.003 });
    this.tone({ type: 'sine', freq: 130, freqTo: 55, dur: 0.3, gain: g * 0.7 });
  }

  /** Pickup collected (player): rising three-note chime. */
  pickup() {
    if (!this.can('effect')) return;
    this.counts.pickup++;
    [660, 880, 1320].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.22, delay: i * 0.07 }));
  }

  /** Machine gun hit-confirm tick on enemy vehicle. */
  hitTick() {
    if (!this.can('effect')) return;
    this.tone({ type: 'sine', freq: 1900, freqTo: 2500, dur: 0.045, gain: 0.22 });
  }

  /** Shield absorbed a hit (player). */
  shield() {
    if (!this.can('effect')) return;
    this.counts.shield++;
    this.tone({ type: 'sine', freq: 880, freqTo: 1760, dur: 0.25, gain: 0.3 });
  }

  /** Smoke canister released: a hiss that fades. */
  smoke(x, z) {
    const g = this.level(x, z, 0.35, AUDIO.range.effect);
    if (g < 0.003 || !this.can('effect')) return;
    this.counts.smoke++;
    this.noise({ dur: 1.4, gain: g, filter: 'lowpass', freq: 800, q: 0.5, attack: 0.2 });
  }

  /** Oil slick dropped: a wet squelch. */
  oil(x, z) {
    const g = this.level(x, z, 0.2, AUDIO.range.effect);
    if (g < 0.003 || !this.can('effect')) return;
    this.counts.oil++;
    this.tone({ type: 'sawtooth', freq: 150, freqTo: 70, dur: 0.35, gain: g * 0.6 });
    this.noise({ dur: 0.3, gain: g * 0.5, filter: 'bandpass', freq: 400, q: 4, attack: 0.02 });
  }

  /** Nitro ignition (player): a roaring whoosh. */
  nitro() {
    if (!this.can('effect')) return;
    this.counts.nitro++;
    this.noise({ dur: 0.6, gain: 0.28, filter: 'bandpass', freq: 400, freqTo: 2400, q: 1, attack: 0.1 });
    this.tone({ type: 'sawtooth', freq: 110, freqTo: 280, dur: 0.6, gain: 0.08 });
  }

  /** Countdown beep (3, 2, 1) or the high GO tone. */
  beep(go) {
    if (!this.can('effect')) return;
    this.counts.beep++;
    this.tone({ type: 'square', freq: go ? 1320 : 880, dur: go ? 0.45 : 0.12, gain: 0.12 });
  }

  /** Engine voice per car. Pitch follows forward speed; loudness and brightness follow throttle. */
  makeEngine() {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = c.createOscillator();
    osc2.type = 'square';
    osc2.detune.value = 7;
    const mix = c.createGain();
    mix.gain.value = 0.5;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(mix);
    mix.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    osc.start();
    osc2.start();
    this.counts.engine++;
    return { osc, osc2, filter, gain };
  }

  /** Starts or updates one engine per car. Cars that were removed are silenced and released. */
  updateEngines(vehicles) {
    if (!this.ctx || this.paused) return;
    const t = this.ctx.currentTime;
    const live = new Set();
    for (const v of vehicles) {
      live.add(v.id);
      let e = this.engines.get(v.id);
      if (!e) {
        e = this.makeEngine();
        this.engines.set(v.id, e);
      }
      const dist = Math.hypot(v.x - this.listener.x, v.z - this.listener.z);
      const speed = Math.abs(v.u || 0);
      const load = v.frameInput && v.frameInput.throttle ? 1 : 0;
      const alive = v.wrecked ? 0 : 1;
      const f = 38 + speed * 1.9 + load * 22;
      e.osc.frequency.setTargetAtTime(f, t, 0.08);
      e.osc2.frequency.setTargetAtTime(f * 1.01, t, 0.08);
      e.filter.frequency.setTargetAtTime(260 + speed * 16 + load * 500, t, 0.1);
      const vol = alive * (0.045 + 0.075 * load) * AudioFx.falloff(dist, AUDIO.range.engine);
      e.gain.gain.setTargetAtTime(vol, t, 0.1);
    }
    for (const id of [...this.engines.keys()]) if (!live.has(id)) this.dropEngine(id);
  }

  dropEngine(id) {
    const e = this.engines.get(id);
    if (!e) return;
    this.engines.delete(id);
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.osc.stop(t + 0.3);
    e.osc2.stop(t + 0.3);
    setTimeout(() => {
      e.osc.disconnect();
      e.osc2.disconnect();
      e.filter.disconnect();
      e.gain.disconnect();
    }, 400);
  }

  /** Tyre squeal while the player's car slides sideways. Silent on grip. */
  updateSkid(v) {
    if (!this.ctx || this.paused) return;
    const t = this.ctx.currentTime;
    if (!this.skid) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 2.5;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.bus);
      src.start();
      this.skid = { src, filter, gain };
    }
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const lat = Math.abs(v.vx * ch - v.vz * sh);
    const want = v.wrecked ? 0 : clamp((lat - 3.5) * 0.06, 0, 0.3);
    this.skid.gain.gain.setTargetAtTime(want, t, 0.08);
  }

  /** Silences and releases every engine and the squeal (race ended, returned to menu). */
  stopEngines() {
    for (const id of [...this.engines.keys()]) this.dropEngine(id);
    if (this.skid && this.ctx) {
      const s = this.skid;
      this.skid = null;
      s.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      s.src.stop(this.ctx.currentTime + 0.3);
      setTimeout(() => {
        s.src.disconnect();
        s.filter.disconnect();
        s.gain.disconnect();
      }, 400);
    }
  }
}

