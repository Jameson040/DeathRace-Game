/* ==========================================================================
   03 · TRACK — closed CatmullRom circuit sampled at ~1 sample / world unit.
   Single representation shared by: road mesh, barriers, collision queries,
   AI waypoints, gates (checkpoints), pickups, grid and respawn positions.
   Sample frame: t = tangent (direction of race travel), r = (tz, −tx) = the car's LEFT normal.
  Lateral offset lat > 0 is LEFT of the centre line (the fields rx/rz keep their historical names).
   ========================================================================== */
/** Road pickup types, placed in this order along the lap. */
const PICKUP_CYCLE = ['bullets', 'missiles', 'shield', 'blades', 'gear', 'repair', 'nitro'];

class Track {
  constructor(seed) {
    this.seed = seed;
    this.attempts = 0;
    let ok = false;
    while (!ok && this.attempts < 30) {
      this.build(seed + this.attempts * 977);
      ok = this.validate();
      this.attempts++;
    }
    this.valid = ok;
    this._q = {
      idx: 0,
      s: 0,
      lat: 0,
      along: 0,
      dist: 0,
      cx: 0,
      cy: 0,
      cz: 0,
      tx: 0,
      tz: 0,
      rx: 0,
      rz: 0,
      hd: 0,
      slope: 0,
    };
    this.buildGates();
    this.buildPickupSpots();
  }

  build(seed) {
    const rnd = mulberry32(seed);
    const n = 14 + Math.floor(rnd() * 3);
    const ph = rnd() * TAU;
    const ph2 = rnd() * TAU;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rnd() - 0.5) * 0.16;
      const r = 235 + Math.sin(a * 2 + ph) * 36 + Math.sin(a * 3 + ph2) * 20 + (rnd() - 0.5) * 16;
      const y = 4 + Math.sin(a * 2 + ph2) * 4.0 + Math.sin(a + ph) * 1.4;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = Math.round(this.length);
    this.N = N;
    this.ds = this.length / N;
    const sp = this.curve.getSpacedPoints(N);
    const cx = (this.cx = new Float64Array(N));
    const cy = (this.cy = new Float64Array(N));
    const cz = (this.cz = new Float64Array(N));
    const tx = (this.tx = new Float64Array(N));
    const tz = (this.tz = new Float64Array(N));
    const rx = (this.rx = new Float64Array(N));
    const rz = (this.rz = new Float64Array(N));
    const hd = (this.hd = new Float64Array(N));
    for (let i = 0; i < N; i++) {
      cx[i] = sp[i].x;
      cy[i] = sp[i].y;
      cz[i] = sp[i].z;
    }
    this.applyFeatures(cy, N);
    // Vertical profile curvature d²y/ds² per sample (features included). A car following the ground at
    // along-track speed u feels a vertical ground acceleration of u²·curv: negative on crests and lips.
    this.vcurv = new Float64Array(N);
    for (let i = 0; i < N; i++)
      this.vcurv[i] = (cy[(i + 1) % N] - 2 * cy[i] + cy[(i - 1 + N) % N]) / (this.ds * this.ds);
    for (let i = 0; i < N; i++) {
      const pn = (i + 1) % N;
      const pp = (i - 1 + N) % N;
      const dx = cx[pn] - cx[pp];
      const dz = cz[pn] - cz[pp];
      const len = Math.hypot(dx, dz) || 1;
      tx[i] = dx / len;
      tz[i] = dz / len;
      rx[i] = tz[i];
      rz[i] = -tx[i];
      hd[i] = Math.atan2(tx[i], tz[i]);
    }
    // Signed curvature (dθ/ds, + = left turn), smoothed; bank slope for visuals and wheel contacts.
    const kap = (this.kappa = new Float64Array(N));
    const raw = new Float64Array(N);
    for (let i = 0; i < N; i++) raw[i] = wrapAngle(hd[(i + 1) % N] - hd[(i - 1 + N) % N]) / (2 * this.ds);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += raw[(i + k + N) % N];
      kap[i] = s / 9;
    }
    this.slope = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.slope[i] = clamp(kap[i] * 4.0, -0.11, 0.11);
    }
  }

  validate() {
    const N = this.N;
    let maxK = 0;
    for (let i = 0; i < N; i++) maxK = Math.max(maxK, Math.abs(this.kappa[i]));
    if (!(maxK < 1 / 42)) return false; // minimum radius ≈ 42 units
    if (!(this.length > 1300 && this.length < 2800)) return false;
    // Non-self-intersection: samples far apart along the loop must stay apart.
    const st = 3;
    for (let i = 0; i < N; i += st) {
      for (let j = i + 1; j < N; j += st) {
        const sep = Math.min(j - i, N - (j - i));
        if (sep < 90) continue;
        const dx = this.cx[i] - this.cx[j];
        const dz = this.cz[i] - this.cz[j];
        if (dx * dx + dz * dz < 36 * 36) return false;
      }
    }
    return true;
  }

  /**
   * Nearest sample to (x,z). Uses a windowed search around `hint` when available,
   * falling back to a full scan when the point is far from the hint (teleports, spawns).
   * Returns a shared record (copy values out if you need them after another query).
   */
  /**
   * Lap features, all placed by lap fraction (deterministic):
   *  - 2 ramps: 16-sample linear rise (2.2 units high) then a 10-sample drop-off lip (kicker)
   *  - 2 U-shaped dips: 130 samples, 3 units deep, smooth ends (max added grade ≈ 4°)
   *  - 2 rough dirt/broken-road patches: 90 samples with blended edges
   */
  applyFeatures(cy, N) {
    this.features = [];
    this.rough = new Uint8Array(N);
    this.roughBlend = new Float32Array(N);
    const add = (i, off) => {
      cy[((i % N) + N) % N] += off;
    };
    for (const f of [0.42, 0.9]) {
      const i0 = Math.round(f * N);
      const W = 16;
      const F = 10;
      const H = 2.2;
      for (let s = 0; s <= W; s++) add(i0 + s, H * (s / W));
      for (let s = 1; s <= F; s++) add(i0 + W + s, (H * (1 + Math.cos((Math.PI * s) / F))) / 2);
      this.features.push({ type: 'ramp', i0, W, F, H });
    }
    for (const f of [0.08, 0.3]) {
      const i0 = Math.round(f * N);
      const L = 130;
      const D = 3.0;
      for (let s = 0; s <= L; s++) add(i0 + s, (-D / 2) * (1 - Math.cos((2 * Math.PI * s) / L)));
      this.features.push({ type: 'dip', i0, L, D });
    }
    for (const f of [0.2, 0.66]) {
      const i0 = Math.round(f * N);
      const L = 90;
      const B = 8;
      for (let s = -B; s < L + B; s++) {
        const j = (((i0 + s) % N) + N) % N;
        const w = Math.min(1, Math.max(0, Math.min((s + B) / B, (L + B - s) / B)));
        this.roughBlend[j] = Math.max(this.roughBlend[j], w * w * (3 - 2 * w));
      }
      this.features.push({ type: 'rough', i0, L });
    }
    for (let j = 0; j < N; j++) this.rough[j] = this.roughBlend[j] >= 0.5 ? 1 : 0;
  }

  query(x, z, hint) {
    const N = this.N;
    const cx = this.cx;
    const cz = this.cz;
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    if (hint !== undefined && hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = (hint + k + N) % N;
        const dx = x - cx[i];
        const dz = z - cz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      if (bd > 900) best = -1;
    }
    if (best < 0) {
      bd = Number.POSITIVE_INFINITY;
      for (let i = 0; i < N; i++) {
        const dx = x - cx[i];
        const dz = z - cz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
    }
    const q = this._q;
    const i = best;
    const dx = x - cx[i];
    const dz = z - cz[i];
    q.idx = i;
    q.lat = dx * this.rx[i] + dz * this.rz[i];
    // Continuous longitudinal coordinate: project onto the two polyline segments that touch the nearest
    // sample ([i-1,i] and [i,i+1]). Projecting onto a single sample's tangent jumps at sample boundaries
    // when the car is far off-centre on a curve; the polyline projection does not.
    // Closest point on the polyline: each segment's projection is clamped to [0,1] and the nearer wins.
    // This mapping is continuous through vertices (unlike choosing by an unclamped in-range test).
    const pA = this._closest(x, z, (i - 1 + N) % N, i);
    const pB = this._closest(x, z, i, (i + 1) % N);
    let k = 0;
    let f = pB.f;
    if (pA.d2 < pB.d2) {
      k = -1;
      f = pA.f;
    }
    const b0 = (i + k + N) % N;
    const b1 = (b0 + 1) % N;
    const seg = this.cy[b1] - this.cy[b0];
    q.along = (k + f) * this.ds;
    let s = i * this.ds + q.along;
    if (s < 0) s += this.length;
    else if (s >= this.length) s -= this.length;
    q.s = s;
    q.dist = Math.hypot(q.lat, q.along);
    q.cx = cx[i];
    q.cy = this.cy[i];
    q.cz = cz[i];
    q.tx = this.tx[i];
    q.tz = this.tz[i];
    q.rx = this.rx[i];
    q.rz = this.rz[i];
    q.hd = this.hd[i];
    q.slope = this.slope[i];
    q.grade = seg / this.ds;
    q.yLong = this.cy[b0] + f * seg;
    q.y = q.yLong + this.slope[i] * q.lat;
    return q;
  }

  /** Closest point of segment a→b to (x,z): clamped fraction f (0 at a, 1 at b) and squared distance d2. */
  _closest(x, z, a, b) {
    const ex = this.cx[b] - this.cx[a];
    const ez = this.cz[b] - this.cz[a];
    const L2 = ex * ex + ez * ez || 1;
    const f = Math.min(1, Math.max(0, ((x - this.cx[a]) * ex + (z - this.cz[a]) * ez) / L2));
    const px = this.cx[a] + f * ex - x;
    const pz = this.cz[a] + f * ez - z;
    return { f, d2: px * px + pz * pz };
  }

  /** Road-surface height at sample i and lateral offset lat (banked). */
  heightAt(i, lat) {
    return this.cy[i] + this.slope[i] * lat;
  }

  /** World pose of lateral offset `lat` at sample index i. */
  poseAt(i, lat) {
    i = ((i % this.N) + this.N) % this.N;
    return {
      x: this.cx[i] + this.rx[i] * lat,
      z: this.cz[i] + this.rz[i] * lat,
      y: this.heightAt(i, lat),
      hd: this.hd[i],
      idx: i,
    };
  }

  indexOfS(s) {
    let i = Math.round(s / this.ds) % this.N;
    if (i < 0) i += this.N;
    return i;
  }

  buildGates() {
    this.gates = [];
    for (let k = 0; k < GATE_COUNT; k++) {
      const idx = Math.round((k * this.N) / GATE_COUNT) % this.N;
      this.gates.push({
        k,
        idx,
        x: this.cx[idx],
        z: this.cz[idx],
        y: this.cy[idx],
        tx: this.tx[idx],
        tz: this.tz[idx],
        rx: this.rx[idx],
        rz: this.rz[idx],
        s: idx * this.ds,
      });
    }
  }

  buildPickupSpots() {
    const rnd = mulberry32(this.seed ^ 0x5bd1e995);
    this.pickupSpots = [];
    const count = 28;
    for (let k = 0; k < count; k++) {
      const idx = Math.round(((k + 0.5) * this.N) / count) % this.N;
      const lat = k % 3 === 0 ? 0 : (k % 2 ? 1 : -1) * (3 + rnd() * 5);
      this.pickupSpots.push({ idx, lat, type: PICKUP_CYCLE[k % PICKUP_CYCLE.length] });
    }
  }

  /** Grid slot k (0 = pole). Behind the start/finish line, staggered laterally. */
  gridSlot(k) {
    const row = Math.floor(k / 2);
    const col = k % 2 === 0 ? -4.2 : 4.2;
    const idx = (this.N - 8 - row * 15 + this.N * 4) % this.N;
    return this.poseAt(idx, col);
  }

  /** Distance from (x,z) to the centreline using a spatial hash grid (terrain shaping). */
  _ensureSpatialGrid() {
    if (this._grid) return;
    const cellSize = 50;
    const grid = new Map();
    for (let i = 0; i < this.N; i += 3) {
      const gx = Math.floor(this.cx[i] / cellSize);
      const gz = Math.floor(this.cz[i] / cellSize);
      const key = `${gx},${gz}`;
      let list = grid.get(key);
      if (!list) {
        list = [];
        grid.set(key, list);
      }
      list.push(i);
    }
    this._grid = grid;
    this._cellSize = cellSize;
  }

  strideNearest(x, z) {
    this._ensureSpatialGrid();
    const cs = this._cellSize;
    const gx = Math.floor(x / cs);
    const gz = Math.floor(z / cs);
    let best = Number.POSITIVE_INFINITY;
    let bi = 0;

    // Check 3x3 neighborhood cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this._grid.get(`${gx + dx},${gz + dz}`);
        if (!list) continue;
        for (let j = 0; j < list.length; j++) {
          const i = list[j];
          const px = x - this.cx[i];
          const pz = z - this.cz[i];
          const d2 = px * px + pz * pz;
          if (d2 < best) {
            best = d2;
            bi = i;
          }
        }
      }
    }

    // Safety fallback for points outside track bounding area
    if (best === Number.POSITIVE_INFINITY) {
      for (let i = 0; i < this.N; i += 3) {
        const px = x - this.cx[i];
        const pz = z - this.cz[i];
        const d2 = px * px + pz * pz;
        if (d2 < best) {
          best = d2;
          bi = i;
        }
      }
    }
    return { d: Math.sqrt(best), idx: bi };
  }
}
