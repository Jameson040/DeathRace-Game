import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ==========================================================================
   01 · CORE — constants, math, seeded RNG/noise, keyboard-only InputManager
   Conventions (authoritative everywhere):
     • Y is up. Ground plane = XZ.
     • heading θ: forward f = (sin θ, 0, cos θ), right r = f × up = (−cos θ, 0, sin θ).
       Models are authored facing +Z, so mesh.rotation.y = θ.
     • Steer: +1 = A/Left = turn LEFT (θ increases), −1 = D/Right = turn RIGHT (θ decreases).
     • Longitudinal speed u = v · f (negative = reversing).
     • Lateral speed s = v · r.
   ========================================================================== */
const PHYS_DT = 1 / 120; // fixed physics step (seconds)
const MAX_PHYS_STEPS = 12; // accumulator cap per rendered frame
const ROAD_HALF = 15; // road width = 30 world units (+25% fighting width for 9 vehicles)
const WALL_E = 0.35; // restitution (spec)
const WALL_TANGENT_RETAIN = 0.9; // tangential retention (spec)
const WALL_APPROACH_MIN = 0.6; // below this approach speed: no bounce / no tangential loss
const LAPS_TO_FINISH = 3;
const GATE_COUNT = 12;
const LAT_LIMIT = 40; // lateral-acceleration cap used to limit yaw rate (u/s²)
const TAU = Math.PI * 2;
const KPH_PER_UNIT = 3.6; // display scale only

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
};
const wrapDelta = (d, L) => {
  const x = ((d % L) + L) % L;
  return x > L * 0.5 ? x - L : x;
};
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 2D value noise (seeded).
function makeNoise(seed) {
  const off = (seed * 131) | 0;
  const hash = (ix, iy) => {
    let n = (Math.imul(ix + off, 374761393) + Math.imul(iy, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  };
  noise.fbm = (x, y, oct = 4) => {
    let a = 0.5;
    let s = 0;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x, y);
      n += a;
      x *= 2.03;
      y *= 2.03;
      a *= 0.5;
    }
    return s / n;
  };
  return noise;
}

/* ---------------------------- Input manager ------------------------------ */
const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  fire: ['Space'],
  secondary: ['ShiftLeft', 'ShiftRight', 'KeyE'],
  nitro: ['KeyF'],
  handbrake: ['KeyC'],
  recover: ['KeyR'],
  pause: ['Escape'],
  debug: ['F3'],
  smoke: ['KeyG'],
  oil: ['KeyQ'],
};
/** Arrow-key layout: driving on the arrow keys, weapons and nitro on the right-hand block. */
const ARROW_PRESET = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  fire: ['ControlRight'],
  secondary: ['ShiftRight'],
  nitro: ['Enter'],
  handbrake: ['KeyC'],
  recover: ['KeyR'],
  pause: ['Escape'],
  debug: ['F3'],
  smoke: ['KeyG'],
  oil: ['KeyQ'],
};
const ACTION_LABELS = {
  up: 'Accelerate',
  down: 'Brake / reverse',
  left: 'Steer left',
  right: 'Steer right',
  fire: 'Machine gun (Space)',
  secondary: 'Rocket',
  nitro: 'Nitro boost',
  handbrake: 'Combat drift (C)',
  recover: 'Reset (50 m back on track)',
  pause: 'Pause',
  smoke: 'Smoke screen (blinds rivals)',
  oil: 'Oil slick (drops traction)',
  debug: 'Diagnostics panel',
};
const ACTION_ORDER = Object.keys(DEFAULT_BINDINGS);
const PRESS_ACTIONS = new Set(['secondary', 'nitro', 'recover', 'pause', 'debug', 'smoke', 'oil']);
const KEY_NAMES = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};
/** Human-readable name for a KeyboardEvent.code. */
function keyLabel(code) {
  if (!code) return '-';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F\d+$/.test(code)) return code;
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

/**
 * Keyboard input with assignable bindings. Each action has a list of KeyboardEvent.code values.
 * Steering convention (physics-wide): steer +1 = LEFT, −1 = RIGHT (positive yaw rate turns the car left).
 */
class InputManager {
  /** @param {EventTarget} target  window in game; an isolated EventTarget in tests. */
  constructor(target, bindings = null) {
    this.target = target;
    this.keys = new Set(); // currently-held KeyboardEvent.code values
    this.pressQueue = new Set(); // edge-triggered actions awaiting consumption
    this.registeredEvents = []; // introspectable list of listened event types
    this._kd = (e) => this.onKeyDown(e);
    this._ku = (e) => this.onKeyUp(e);
    this._bl = () => this.onBlur();
    this.listen('keydown', this._kd);
    this.listen('keyup', this._ku);
    this.listen('blur', this._bl);
    this.preventDefaults = true;
    this.setBindings(bindings);
  }
  listen(type, fn) {
    this.target.addEventListener(type, fn);
    this.registeredEvents.push(type);
  }
  /** Replaces all bindings (missing or invalid actions fall back to defaults). */
  setBindings(b) {
    this.bindings = {};
    for (const a of ACTION_ORDER) {
      this.bindings[a] = (b && Array.isArray(b[a]) && b[a].length ? b[a] : DEFAULT_BINDINGS[a]).slice();
    }
    this.rebuildMap();
  }
  rebuildMap() {
    this.codeToAction = new Map();
    for (const a of ACTION_ORDER) for (const c of this.bindings[a]) this.codeToAction.set(c, a);
  }
  /**
   * Makes `code` the sole primary key of `action`. If another action used `code`, that action
   * receives the key this action previously had (a swap), so no action is ever left unbound.
   */
  assign(action, code) {
    if (!ACTION_ORDER.includes(action) || !code || code === 'Escape') return false;
    const prev = this.bindings[action][0];
    for (const a of ACTION_ORDER) {
      if (a === action) continue;
      const list = this.bindings[a];
      const i = list.indexOf(code);
      if (i >= 0) {
        if (prev) list[i] = prev;
        else list.splice(i, 1);
      }
    }
    this.bindings[action] = [code];
    this.rebuildMap();
    this.keys.clear();
    this.pressQueue.clear();
    return true;
  }
  onKeyDown(e) {
    const action = this.codeToAction.get(e.code);
    if (action === undefined) return;
    if (this.preventDefaults) e.preventDefault();
    if (!this.keys.has(e.code) && PRESS_ACTIONS.has(action)) this.pressQueue.add(action);
    this.keys.add(e.code);
  }
  onKeyUp(e) {
    if (this.codeToAction.has(e.code)) {
      if (this.preventDefaults) e.preventDefault();
      this.keys.delete(e.code);
    }
  }
  /** Focus loss clears all held keys so nothing stays logically stuck. */
  onBlur() {
    this.keys.clear();
    this.pressQueue.clear();
  }
  static controlsFromKeys(keys, bindings = DEFAULT_BINDINGS) {
    const has = (a) => bindings[a].some((c) => keys.has(c));
    return {
      throttle: has('up'),
      brake: has('down'),
      steer: (has('left') ? 1 : 0) - (has('right') ? 1 : 0), // left = +1 (see convention above)
      fire: has('fire'),
      secondary: has('secondary'),
      nitro: has('nitro'),
      handbrake: has('handbrake'),
      recover: has('recover'),
      pause: has('pause'),
    };
  }
  controls() {
    return InputManager.controlsFromKeys(this.keys, this.bindings);
  }
  consumePress(action) {
    if (this.pressQueue.has(action)) {
      this.pressQueue.delete(action);
      return true;
    }
    return false;
  }
  clearPresses() {
    this.pressQueue.clear();
  }
  destroy() {
    this.target.removeEventListener('keydown', this._kd);
    this.target.removeEventListener('keyup', this._ku);
    this.target.removeEventListener('blur', this._bl);
  }
}
