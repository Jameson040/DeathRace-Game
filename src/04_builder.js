/* ==========================================================================
   04 · PROCEDURAL DEATH CAR BUILDER — armored Death Race vehicles built from
   extruded side profiles, lathe tyres, tube roll cages, instanced bolts and
   canvas-weathered materials. Models are authored facing +Z (forward).
   Hierarchy:  root (yaw) → tilt (pitch/roll) → chassis parts, wheels, turret,
               rocket pods, exhaust anchors, lights, detachable armor.
   ========================================================================== */
const Assets = {
  _tex: {},
  _mat: {},
  _geo: {},
  canvas(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    fn(c.getContext('2d'), w, h);
    return c;
  },
  tex(key, w, h, fn, srgb = false) {
    if (!this._tex[key]) {
      const t = new THREE.CanvasTexture(this.canvas(w, h, fn));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this._tex[key] = t;
    }
    return this._tex[key];
  },
  mat(key, make) {
    if (!this._mat[key]) this._mat[key] = make();
    return this._mat[key];
  },
  geo(key, make) {
    if (!this._geo[key]) this._geo[key] = make();
    return this._geo[key];
  },

  /** Procedural weathering: rust blooms, scratches, worn paint, grime gradient. */
  weather() {
    return this.tex(
      'weather',
      256,
      256,
      (g, w, h) => {
        const rnd = mulberry32(7);
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(120,110,100,0)');
        gr.addColorStop(1, 'rgba(70,58,46,0.55)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 150; i++) {
          const x = rnd() * w;
          const y = rnd() * h;
          const r = 4 + rnd() * 24;
          g.fillStyle = `rgba(${(150 + rnd() * 50) | 0},${(70 + rnd() * 35) | 0},${28},${0.08 + rnd() * 0.25})`;
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
        }
        g.strokeStyle = 'rgba(55,55,55,0.45)';
        for (let i = 0; i < 140; i++) {
          const x = rnd() * w;
          const y = rnd() * h;
          const a = rnd() * TAU;
          const L = 6 + rnd() * 26;
          g.lineWidth = 0.5 + rnd() * 0.9;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
          g.stroke();
        }
        for (let i = 0; i < 320; i++) {
          g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
          g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 1 + rnd() * 2);
        }
      },
      true,
    );
  },
  /** Hazard-stripe texture for plows, boards and bumpers. */
  hazard() {
    return this.tex(
      'hazard',
      128,
      128,
      (g, w, h) => {
        g.fillStyle = '#141414';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffc400';
        for (let k = -h; k < w + h; k += 32) {
          g.beginPath();
          g.moveTo(k, 0);
          g.lineTo(k + 16, 0);
          g.lineTo(k + 16 + h, h);
          g.lineTo(k + h, h);
          g.closePath();
          g.fill();
        }
      },
      true,
    );
  },
  checker() {
    return this.tex(
      'checker',
      128,
      128,
      (g, w, h) => {
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2';
            g.fillRect(x * 16, y * 16, 16, 16);
          }
      },
      true,
    );
  },
  paint(color) {
    return this.mat(
      `paint${color}`,
      () => new THREE.MeshStandardMaterial({ color, map: this.weather(), metalness: 0.55, roughness: 0.36 }),
    );
  },
  gunmetal() {
    return this.mat(
      'gunmetal',
      () => new THREE.MeshStandardMaterial({ color: 0x2b2f34, metalness: 0.85, roughness: 0.42, map: this.weather() }),
    );
  },
  chrome() {
    return this.mat(
      'chrome',
      () => new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 1.0, roughness: 0.18 }),
    );
  },
  rubber() {
    return this.mat(
      'rubber',
      () => new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.0, roughness: 0.93 }),
    );
  },
  rust() {
    return this.mat('rust', () => new THREE.MeshStandardMaterial({ color: 0x6b3b1d, metalness: 0.3, roughness: 0.85 }));
  },
  glass() {
    return this.mat(
      'glass',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x8fb8d8,
          metalness: 0.2,
          roughness: 0.05,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
        }),
    );
  },
  hazardMat() {
    return this.mat(
      'hazardMat',
      () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.hazard(), metalness: 0.25, roughness: 0.6 }),
    );
  },
  lampWhite() {
    return this.mat(
      'lampW',
      () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.6 }),
    );
  },
  lampAmber() {
    return this.mat('lampA', () => new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xffaa00, emissiveIntensity: 1.4 }));
  },
  lampCyan() {
    return this.mat('lampC', () => new THREE.MeshStandardMaterial({ color: 0x004455, emissive: 0x00e5ff, emissiveIntensity: 1.5 }));
  },
  lampRed() {
    return this.mat(
      'lampR',
      () => new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff1a10, emissiveIntensity: 1.3 }),
    );
  },
  flashMat() {
    return this.mat(
      'flash',
      () => new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
  },
};

/** Side profile [z,y] → extrusion along X (width), centred on x = 0. */
function profileGeo(points, width, bevel = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)); // (a,b,e) → (x=−e, y=b, z=a)
  g.translate(width / 2, 0, 0);
  g.computeBoundingBox();
  return g;
}
/** Highest profile height at forward coordinate z (used to seat parts on surfaces). */
function yAt(points, z) {
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    const [z1, y1] = points[i];
    const [z2, y2] = points[i + 1];
    if (z >= Math.min(z1, z2) && z <= Math.max(z1, z2) && z1 !== z2) {
      const t = (z - z1) / (z2 - z1);
      best = Math.max(best, y1 + (y2 - y1) * t);
    }
  }
  return best === Number.NEGATIVE_INFINITY ? 1.5 : best;
}

const CAR_PROFILES = {
  // 1. BLOODHAMMER (Classic Supercharged Muscle)
  muscle: {
    lower: [[-2.95,0.42],[-2.95,1.2],[-2.55,1.42],[-1.2,1.48],[1.7,1.5],[2.55,1.36],[2.95,1.05],[2.95,0.42]],
    lowerW: 2.5,
    hood: [[0.7,1.46],[0.9,1.94],[2.8,1.4],[2.92,1.22],[2.5,1.44]],
    hoodW: 2.36,
    cabin: [[0.7,1.47],[0.35,2.42],[-0.9,2.6],[-1.55,2.35],[-2.3,1.6],[-2.3,1.47]],
    cabinW: 2.0,
    fast: [[-1.95,2.25],[-2.6,1.72],[-2.85,1.52],[-2.2,1.44],[-1.6,1.45]],
    fastW: 2.2,
    wind: [[0.72,1.5],[0.37,2.4],[0.31,2.41],[0.66,1.5]],
    windW: 1.84,
    plow: [[2.85,0.18],[3.55,0.42],[3.62,0.98],[2.95,1.02]],
    plowW: 2.6,
    diff: [[-2.95,0.4],[-3.22,0.2],[-3.22,0.5],[-2.95,0.56]],
    diffW: 2.3,
    track: 1.22, wheelScale: 1.0,
    axles: [{ z: 1.9, front: true }, { z: -1.9, front: false }],
    rollY: 2.62, turretZ: -0.1,
  },

  // 2. RAZORBACK (Pursuit Interceptor)
  interceptor: {
    lower: [[-2.9,0.38],[-2.98,1.15],[-2.2,1.36],[-0.9,1.42],[1.9,1.38],[2.85,1.08],[3.02,0.75],[2.9,0.38]],
    lowerW: 2.44,
    hood: [[0.5,1.4],[0.7,1.78],[2.75,1.28],[2.92,1.10],[2.4,1.38]],
    hoodW: 2.3,
    cabin: [[0.5,1.4],[0.12,2.24],[-1.0,2.42],[-2.1,1.9],[-2.5,1.4]],
    cabinW: 1.92,
    fast: [[-1.8,2.1],[-2.6,1.55],[-2.85,1.42],[-1.8,1.4]],
    fastW: 2.1,
    wind: [[0.52,1.42],[0.14,2.22],[0.08,2.23],[0.44,1.42]],
    windW: 1.78,
    plow: [[2.85,0.2],[3.4,0.38],[3.44,0.8],[2.9,0.84]],
    plowW: 2.45,
    diff: [[-2.9,0.38],[-3.2,0.22],[-3.2,0.48],[-2.9,0.52]],
    diffW: 2.25,
    track: 1.24, wheelScale: 0.98,
    axles: [{ z: 1.85, front: true }, { z: -1.85, front: false }],
    rollY: 2.44, turretZ: -0.2,
  },

  // 3. GUTSHOT (Heavy Combat Hauler)
  hauler: {
    lower: [[-3.0,0.5],[-3.0,1.35],[-2.8,1.5],[-1.0,1.55],[2.2,1.55],[2.85,1.42],[3.0,1.1],[3.0,0.5]],
    lowerW: 2.62,
    hood: [[1.0,1.53],[1.1,1.86],[2.85,1.5],[2.95,1.32],[2.5,1.52]],
    hoodW: 2.5,
    cabin: [[0.9,1.52],[0.7,2.7],[-1.2,2.85],[-2.0,2.4],[-2.0,1.52]],
    cabinW: 2.15,
    fast: [[-1.9,2.55],[-2.9,2.5],[-3.0,1.6],[-1.9,1.5]],
    fastW: 2.35,
    wind: [[0.92,1.54],[0.72,2.66],[0.66,2.67],[0.86,1.54]],
    windW: 1.94,
    plow: [[2.95,0.25],[3.65,0.5],[3.7,1.05],[3.0,1.08]],
    plowW: 2.75,
    diff: [[-3.0,0.45],[-3.25,0.25],[-3.25,0.55],[-3.0,0.6]],
    diffW: 2.4,
    track: 1.30, wheelScale: 1.08,
    axles: [{ z: 2.0, front: true }, { z: -2.0, front: false }],
    rollY: 2.86, turretZ: -0.25,
  },

  // 4. SANDVIPER (Open-Wheel Desert Raider Buggy)
  buggy: {
    lower: [[-2.4,0.65],[-2.2,1.32],[-0.8,1.38],[1.4,1.32],[2.45,1.02],[2.3,0.62]],
    lowerW: 1.75,
    hood: [[0.5,1.32],[0.7,1.58],[2.35,1.08],[2.2,1.0]],
    hoodW: 1.55,
    cabin: [[0.55,1.32],[0.15,2.22],[-0.95,2.32],[-1.75,1.82],[-1.85,1.32]],
    cabinW: 1.62,
    fast: [[-1.4,2.0],[-2.35,1.55],[-2.3,1.3],[-1.4,1.3]],
    fastW: 1.68,
    wind: [[0.56,1.35],[0.17,2.2],[0.11,2.21],[0.50,1.35]],
    windW: 1.48,
    plow: [[2.35,0.38],[2.95,0.55],[2.9,0.95],[2.35,0.98]],
    plowW: 2.1,
    diff: [[-2.4,0.6],[-2.65,0.45],[-2.65,0.75],[-2.4,0.8]],
    diffW: 1.6,
    track: 1.42, wheelScale: 1.18,
    axles: [{ z: 1.85, front: true }, { z: -1.75, front: false }],
    rollY: 2.35, turretZ: -0.35,
  },

  // 5. GOLIATH (6x6 Dreadnought War Rig Semi)
  warrig: {
    lower: [[-3.85,0.48],[-3.85,1.38],[-0.5,1.45],[1.2,1.62],[3.35,1.62],[3.5,1.1],[3.5,0.48]],
    lowerW: 2.68,
    hood: [[0.9,1.6],[1.05,2.38],[3.25,2.22],[3.4,1.6],[2.8,1.6]],
    hoodW: 2.15,
    cabin: [[0.92,1.6],[0.85,3.15],[-0.75,3.22],[-0.95,1.6]],
    cabinW: 2.48,
    fast: [[-0.95,2.6],[-3.7,2.45],[-3.75,1.4],[-0.95,1.4]],
    fastW: 2.52,
    wind: [[0.94,2.25],[0.87,3.1],[0.81,3.1],[0.88,2.25]],
    windW: 2.22,
    plow: [[3.4,0.22],[4.25,0.48],[4.15,1.45],[3.45,1.5]],
    plowW: 2.9,
    diff: [[-3.85,0.48],[-4.1,0.3],[-4.1,0.65],[-3.85,0.7]],
    diffW: 2.5,
    track: 1.34, wheelScale: 1.14,
    axles: [{ z: 2.5, front: true }, { z: -1.7, front: false }, { z: -3.05, front: false }],
    rollY: 3.25, turretZ: 0.05,
  },

  // 6. IRONCLAD (8x8 Armored Personnel Carrier)
  apc: {
    lower: [[-3.5,0.55],[-3.75,1.35],[-3.3,2.05],[2.6,2.05],[3.55,1.45],[3.2,0.55]],
    lowerW: 2.78,
    hood: [[1.2,2.02],[1.6,2.32],[3.15,1.62],[2.6,2.02]],
    hoodW: 2.55,
    cabin: [[-2.9,2.02],[-2.4,2.68],[1.25,2.68],[1.65,2.02]],
    cabinW: 2.42,
    fast: [[-3.3,2.02],[-2.85,2.62],[-2.4,2.62],[-2.9,2.02]],
    fastW: 2.4,
    wind: [[1.62,2.05],[1.27,2.62],[1.21,2.62],[1.56,2.05]],
    windW: 2.05,
    plow: [[3.25,0.35],[3.95,0.65],[3.85,1.38],[3.4,1.42]],
    plowW: 2.82,
    diff: [[-3.5,0.55],[-3.75,0.45],[-3.75,0.85],[-3.5,0.9]],
    diffW: 2.5,
    track: 1.38, wheelScale: 1.06,
    axles: [
      { z: 2.35, front: true },
      { z: 0.8, front: true },
      { z: -0.8, front: false },
      { z: -2.35, front: false }
    ],
    rollY: 2.72, turretZ: -0.4,
  },

  // 7. MEATGRINDER (Vintage Chopped Rat-Rod)
  hotrod: {
    lower: [[-2.75,0.35],[-2.75,1.15],[-2.1,1.32],[0.6,1.25],[2.75,1.12],[2.85,0.35]],
    lowerW: 1.82,
    hood: [[0.4,1.22],[0.5,1.58],[2.65,1.45],[2.75,1.12]],
    hoodW: 1.38,
    cabin: [[0.42,1.22],[0.25,2.18],[-1.35,2.22],[-1.65,1.22]],
    cabinW: 1.68,
    fast: [[-1.6,2.15],[-2.65,1.28],[-2.7,1.12],[-1.6,1.2]],
    fastW: 1.62,
    wind: [[0.44,1.25],[0.27,2.15],[0.21,2.15],[0.38,1.25]],
    windW: 1.52,
    plow: [[2.75,0.18],[3.35,0.32],[3.38,0.82],[2.8,0.88]],
    plowW: 2.25,
    diff: [[-2.75,0.35],[-3.05,0.2],[-3.05,0.5],[-2.75,0.55]],
    diffW: 1.8,
    track: 1.32, wheelScale: 1.05,
    axles: [{ z: 2.15, front: true }, { z: -1.85, front: false }],
    rollY: 2.25, turretZ: -0.5,
  },

  // 8. WIDOWMAKER (Cyber Stealth Hyper-Wedge)
  cyber: {
    lower: [[-3.1,0.32],[-3.2,1.08],[-1.8,1.28],[1.6,1.22],[3.15,0.72],[3.05,0.32]],
    lowerW: 2.58,
    hood: [[0.6,1.2],[1.1,1.48],[3.05,0.78],[2.5,1.15]],
    hoodW: 2.42,
    cabin: [[1.1,1.2],[0.1,2.02],[-1.35,2.08],[-2.65,1.38],[-2.65,1.2]],
    cabinW: 1.96,
    fast: [[-1.35,2.06],[-2.95,1.32],[-3.1,1.12],[-1.35,1.2]],
    fastW: 2.25,
    wind: [[1.12,1.22],[0.12,2.0],[0.06,2.0],[1.06,1.22]],
    windW: 1.82,
    plow: [[3.05,0.15],[3.75,0.28],[3.65,0.68],[3.1,0.72]],
    plowW: 2.62,
    diff: [[-3.1,0.32],[-3.45,0.18],[-3.45,0.52],[-3.1,0.58]],
    diffW: 2.48,
    track: 1.28, wheelScale: 0.96,
    axles: [{ z: 1.92, front: true }, { z: -1.95, front: false }],
    rollY: 2.12, turretZ: -0.55,
  },

  // 9. COLOSSUS (Monster Crusher 4x4)
  monster: {
    lower: [[-2.9,1.05],[-2.9,1.85],[-1.2,1.95],[1.8,1.95],[2.9,1.72],[2.9,1.05]],
    lowerW: 2.48,
    hood: [[0.7,1.92],[0.9,2.38],[2.8,2.05],[2.88,1.75]],
    hoodW: 2.34,
    cabin: [[0.75,1.92],[0.45,2.92],[-0.95,2.98],[-1.25,1.92]],
    cabinW: 2.12,
    fast: [[-1.2,2.35],[-2.85,2.15],[-2.88,1.85],[-1.2,1.9]],
    fastW: 2.38,
    wind: [[0.77,1.95],[0.47,2.88],[0.41,2.88],[0.71,1.95]],
    windW: 1.96,
    plow: [[2.85,0.75],[3.55,0.95],[3.58,1.55],[2.9,1.6]],
    plowW: 2.65,
    diff: [[-2.9,1.0],[-3.15,0.85],[-3.15,1.15],[-2.9,1.2]],
    diffW: 2.2,
    track: 1.58, wheelScale: 1.62,
    axles: [{ z: 1.95, front: true }, { z: -1.95, front: false }],
    rollY: 3.02, turretZ: -0.25,
  },

  // 10. TOMBSTONE (Gothic Armored Siege Hearse)
  hearse: {
    lower: [[-3.45,0.38],[-3.45,1.22],[-1.5,1.38],[1.8,1.42],[3.1,1.15],[3.1,0.38]],
    lowerW: 2.38,
    hood: [[0.8,1.38],[0.95,1.78],[2.98,1.52],[3.08,1.18]],
    hoodW: 2.22,
    cabin: [[0.82,1.38],[0.48,2.45],[-3.15,2.52],[-3.38,1.42]],
    cabinW: 2.08,
    fast: [[-3.1,2.48],[-3.42,1.42],[-3.1,1.38]],
    fastW: 2.06,
    wind: [[0.84,1.4],[0.50,2.42],[0.44,2.42],[0.78,1.4]],
    windW: 1.9,
    plow: [[3.05,0.18],[3.72,0.38],[3.75,0.95],[3.1,1.0]],
    plowW: 2.52,
    diff: [[-3.45,0.38],[-3.7,0.22],[-3.7,0.52],[-3.45,0.58]],
    diffW: 2.25,
    track: 1.2, wheelScale: 1.0,
    axles: [{ z: 2.05, front: true }, { z: -2.25, front: false }],
    rollY: 2.56, turretZ: -0.4,
  },

  // 11. MUDSHARK (Baja Widebody Trophy Truck)
  trophy: {
    lower: [[-2.95,0.62],[-2.85,1.48],[-1.0,1.58],[1.9,1.55],[2.95,1.28],[2.8,0.62]],
    lowerW: 2.68,
    hood: [[0.7,1.52],[0.95,1.98],[2.85,1.58],[2.92,1.32]],
    hoodW: 2.48,
    cabin: [[0.75,1.52],[0.35,2.52],[-1.05,2.58],[-1.55,1.52]],
    cabinW: 2.15,
    fast: [[-1.35,2.45],[-2.8,1.68],[-2.88,1.48],[-1.35,1.5]],
    fastW: 2.42,
    wind: [[0.77,1.55],[0.37,2.48],[0.31,2.48],[0.71,1.55]],
    windW: 1.98,
    plow: [[2.85,0.42],[3.45,0.65],[3.48,1.18],[2.9,1.22]],
    plowW: 2.55,
    diff: [[-2.95,0.6],[-3.2,0.42],[-3.2,0.75],[-2.95,0.8]],
    diffW: 2.35,
    track: 1.38, wheelScale: 1.22,
    axles: [{ z: 1.95, front: true }, { z: -1.9, front: false }],
    rollY: 2.62, turretZ: -0.25,
  },

  // 12. HELLHOUND (Tracked Rear Half-Track)
  halftrack: {
    lower: [[-3.25,0.52],[-3.25,1.48],[-0.8,1.55],[1.9,1.55],[3.05,1.28],[3.05,0.52]],
    lowerW: 2.52,
    hood: [[0.85,1.52],[1.0,1.96],[2.95,1.65],[3.02,1.32]],
    hoodW: 2.25,
    cabin: [[0.88,1.52],[0.6,2.62],[-2.95,2.65],[-3.15,1.52]],
    cabinW: 2.32,
    fast: [[-2.9,2.6],[-3.2,1.52],[-2.9,1.5]],
    fastW: 2.3,
    wind: [[0.9,1.55],[0.62,2.58],[0.56,2.58],[0.84,1.55]],
    windW: 2.08,
    plow: [[3.0,0.25],[3.68,0.48],[3.72,1.08],[3.05,1.12]],
    plowW: 2.68,
    diff: [[-3.25,0.5],[-3.5,0.32],[-3.5,0.65],[-3.25,0.7]],
    diffW: 2.35,
    track: 1.26, wheelScale: 1.02,
    axles: [{ z: 2.15, front: true }], // Rear uses custom Tank Track Assembly!
    hasRearTracks: true,
    rollY: 2.68, turretZ: -0.3,
  },

  // 13. DOOMBRINGER (Armored Siege Bulldozer)
  dozer: {
    lower: [[-2.85,0.48],[-2.85,1.55],[2.55,1.58],[2.75,1.15],[2.75,0.48]],
    lowerW: 2.75,
    hood: [[0.4,1.55],[0.6,2.25],[2.55,2.08],[2.68,1.55]],
    hoodW: 2.35,
    cabin: [[0.45,1.55],[0.25,3.08],[-1.65,3.12],[-1.95,1.55]],
    cabinW: 2.28,
    fast: [[-1.65,2.95],[-2.75,2.15],[-2.8,1.55],[-1.65,1.55]],
    fastW: 2.45,
    wind: [[0.47,1.85],[0.27,3.02],[0.21,3.02],[0.41,1.85]],
    windW: 2.02,
    plow: [[2.7,0.15],[3.85,0.35],[3.95,1.65],[2.75,1.68]],
    plowW: 3.1,
    diff: [[-2.85,0.48],[-3.25,0.28],[-3.25,0.78],[-2.85,0.85]],
    diffW: 2.55,
    track: 1.38, wheelScale: 1.24,
    axles: [{ z: 1.75, front: true }, { z: -1.75, front: false }],
    rollY: 3.16, turretZ: -0.5,
  }
};

function buildWheel(corner, x, z, front, scale = 1.0) {
  const side = x > 0 ? 1 : -1;
  const root = new THREE.Group();
  root.name = `wheel_${corner}`;
  root.position.set(x, 0.62 * scale, z);
  const suspension = new THREE.Group();
  suspension.name = `suspension_${corner}`;
  root.add(suspension);
  const steer = new THREE.Group();
  steer.name = front ? `steer_pivot_${corner}` : `hub_pivot_${corner}`;
  suspension.add(steer);
  const spin = new THREE.Group();
  spin.name = `wheel_spin_${corner}`;
  if (scale !== 1.0) spin.scale.setScalar(scale);
  steer.add(spin);

  const tireGeo = Assets.geo('tireGeo', () => {
    const pts = [new THREE.Vector2(0.4, -0.3)];
    for (let k = 0; k <= 6; k++) {
      const y = -0.3 + k * 0.1;
      pts.push(new THREE.Vector2(0.62, y));
      pts.push(new THREE.Vector2(0.55, y + 0.05));
    }
    pts.push(new THREE.Vector2(0.62, 0.3));
    pts.push(new THREE.Vector2(0.4, 0.3));
    const g = new THREE.LatheGeometry(pts, 26);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const rimGeo = Assets.geo('rimGeo', () => {
    const pts = [
      new THREE.Vector2(0.08, -0.22),
      new THREE.Vector2(0.38, -0.2),
      new THREE.Vector2(0.44, -0.12),
      new THREE.Vector2(0.44, 0.2),
      new THREE.Vector2(0.3, 0.22),
      new THREE.Vector2(0.1, 0.1),
    ];
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const disc = Assets.geo('discGeo', () => {
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const caliperGeo = Assets.geo('caliperGeo', () => new THREE.BoxGeometry(0.14, 0.22, 0.2));
  const lugGeo = Assets.geo('lugGeo', () => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  });

  const tire = new THREE.Mesh(tireGeo, Assets.rubber());
  tire.name = `tire_${corner}`;
  tire.userData.component = tire.name;
  tire.castShadow = true;
  spin.add(tire);
  const rim = new THREE.Mesh(rimGeo, Assets.chrome());
  rim.name = `rim_${corner}`;
  rim.userData.component = rim.name;
  spin.add(rim);
  const brake = new THREE.Mesh(disc, Assets.gunmetal());
  brake.name = `brake_disc_${corner}`;
  brake.position.x = side * 0.05;
  brake.userData.component = brake.name;
  spin.add(brake);
  const lugs = new THREE.InstancedMesh(lugGeo, Assets.chrome(), 5);
  lugs.name = `lug_nuts_${corner}`;
  lugs.userData.component = lugs.name;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    p.set(side * 0.24, Math.cos(a) * 0.2, Math.sin(a) * 0.2);
    m4.compose(p, q, s);
    lugs.setMatrixAt(k, m4);
  }
  lugs.instanceMatrix.needsUpdate = true;
  spin.add(lugs);
  const caliper = new THREE.Mesh(
    caliperGeo,
    Assets.mat('caliper', () => new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.5, roughness: 0.4 })),
  );
  caliper.name = `brake_caliper_${corner}`;
  caliper.position.set(-side * 0.1, 0.22, 0);
  caliper.userData.component = caliper.name;
  steer.add(caliper);
  return { name: corner, front, root, suspension, steer, spin, x, z };
}

/** Builds articulated tank track assembly for the Half-Track */
function buildTankTrack(side, x, zCenter) {
  const sName = side < 0 ? 'L' : 'R';
  const group = new THREE.Group();
  group.name = `tank_track_${sName}`;
  group.position.set(x, 0.58, zCenter);

  const beltGeo = Assets.geo('trackBelt', () => new THREE.BoxGeometry(0.52, 0.92, 2.55));
  const belt = new THREE.Mesh(beltGeo, Assets.rubber());
  belt.name = `tank_belt_${sName}`;
  belt.userData.component = belt.name;
  belt.castShadow = true;
  group.add(belt);

  const armorGeo = Assets.geo('trackArmor', () => new THREE.BoxGeometry(0.58, 0.42, 2.35));
  const armor = new THREE.Mesh(armorGeo, Assets.gunmetal());
  armor.name = `tank_armor_${sName}`;
  armor.userData.component = armor.name;
  armor.position.y = 0.12;
  group.add(armor);

  const wheelGeo = Assets.geo('bogieWheel', () => {
    const g = new THREE.CylinderGeometry(0.36, 0.36, 0.56, 16);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(wheelGeo, Assets.chrome());
    w.name = `bogie_${sName}_${i}`;
    w.userData.component = w.name;
    w.position.set(0, -0.08, -0.9 + i * 0.6);
    group.add(w);
  }
  return { group };
}

class ProceduralDeathCarBuilder {
  static build(styleKey) {
    const cfg = CAR_STYLES[styleKey] || CAR_STYLES.bloodhammer;
    const P = CAR_PROFILES[cfg.style] || CAR_PROFILES.muscle;
    const root = new THREE.Group();
    root.name = `car_${styleKey}`;
    root.rotation.order = 'YXZ';
    const tilt = new THREE.Group();
    tilt.name = 'tilt';
    root.add(tilt);
    const parts = [];
    const detachables = [];
    const paintMat = Assets.paint(cfg.paint).clone();
    paintMat.name = `paint_${styleKey}`;
    const accentMat = Assets.mat(
      `accent${cfg.accent}`,
      () =>
        new THREE.MeshStandardMaterial({ color: cfg.accent, metalness: 0.4, roughness: 0.45, map: Assets.weather() }),
    );
    const gun = Assets.gunmetal();
    const chrome = Assets.chrome();
    const glass = Assets.glass();
    const haz = Assets.hazardMat();

    const add = (parent, geo, mat, name, pos = [0, 0, 0], rot = [0, 0, 0], opt = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true;
      m.userData.component = name;
      if (opt.detachable) {
        m.userData.detachable = true;
        detachables.push(m);
      }
      parent.add(m);
      parts.push(m);
      return m;
    };
    const box = (w, h, d) => Assets.geo(`box_${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
    const cyl = (r, l, seg = 14) => Assets.geo(`cyl_${r}_${l}_${seg}`, () => new THREE.CylinderGeometry(r, r, l, seg));
    const tubeGeo = (pts, r, key) =>
      Assets.geo(`tube_${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 6, false));
    const X90 = [Math.PI / 2, 0, 0];

    // ---- Hull ----
    add(tilt, Assets.geo(`${styleKey}_lower`, () => profileGeo(P.lower, P.lowerW)), paintMat, 'chassis_lower');
    add(tilt, Assets.geo(`${styleKey}_hood`, () => profileGeo(P.hood, P.hoodW)), paintMat, 'hood');
    add(tilt, Assets.geo(`${styleKey}_cabin`, () => profileGeo(P.cabin, P.cabinW)), paintMat, 'cabin');
    add(tilt, Assets.geo(`${styleKey}_fast`, () => profileGeo(P.fast, P.fastW)), paintMat, 'fastback');
    add(tilt, Assets.geo(`${styleKey}_wind`, () => profileGeo(P.wind, P.windW, 0.01)), glass, 'windshield');

    const hoodTop = yAt(P.hood, 1.5);
    const roofY = yAt(P.cabin, P.turretZ ?? -0.3);

    // Supercharger Blower or Hood Scoop
    if (['muscle', 'hotrod', 'monster', 'trophy'].includes(cfg.style)) {
      const blower = new THREE.Group();
      blower.name = 'supercharger_assembly';
      blower.position.set(0, hoodTop + 0.15, 1.55);
      tilt.add(blower);
      add(blower, box(0.72, 0.28, 0.85), chrome, 'blower_manifold');
      add(blower, box(0.62, 0.18, 0.72), gun, 'blower_ribs', [0, 0.2, 0]);
      add(blower, cyl(0.16, 0.35, 12), Assets.lampRed(), 'butterfly_intake_L', [-0.15, 0.32, 0.35], X90);
      add(blower, cyl(0.16, 0.35, 12), Assets.lampRed(), 'butterfly_intake_R', [0.15, 0.32, 0.35], X90);
    } else {
      add(tilt, box(0.85, 0.24, 0.9), gun, 'hood_scoop', [0, hoodTop + 0.1, 1.5]);
    }

    // Hood vents
    for (let k = 0; k < 4; k++) {
      const zz = 1.0 + (k % 2) * 0.65;
      const xx = k < 2 ? -0.45 : 0.45;
      add(tilt, box(0.42, 0.05, 0.16), gun, `hood_vent_${k}`, [xx, yAt(P.hood, zz) + 0.03, zz]);
    }

    // Roof panel
    add(tilt, box(P.cabinW * 0.9, 0.1, 1.4), gun, 'roof_panel', [0, roofY + 0.05, P.turretZ ?? -0.2]);

    // ---- Architecture Signatures ----
    if (cfg.style === 'warrig') {
      for (let side = -1; side <= 1; side += 2) {
        const s = side < 0 ? 'L' : 'R';
        add(tilt, cyl(0.14, 2.5, 14), chrome, `rig_smokestack_${s}`, [side * 1.35, 2.35, -0.95]);
        add(tilt, cyl(0.17, 1.4, 12), gun, `rig_heatshield_${s}`, [side * 1.35, 2.15, -0.95]);
      }
      add(tilt, cyl(0.85, 0.18, 20), gun, 'fifth_wheel_coupler', [0, 1.5, -2.55]);
    }
    if (cfg.style === 'buggy' || cfg.style === 'trophy') {
      add(tilt, box(1.4, 0.12, 0.12), gun, 'roof_lightbar_frame', [0, roofY + 0.15, 0.2]);
      for (let i = -2; i <= 2; i++) {
        add(tilt, box(0.2, 0.08, 0.06), Assets.lampWhite(), `led_pod_${i}`, [i * 0.25, roofY + 0.15, 0.25]);
      }
      for (let side = -1; side <= 1; side += 2) {
        add(tilt, Assets.geo('spareTire', () => new THREE.TorusGeometry(0.42, 0.14, 10, 22)), Assets.rubber(), `baja_spare_${side < 0 ? 'L' : 'R'}`, [side * 0.5, 1.65, -2.15], [0.55, 0, 0]);
      }
    }
    if (cfg.style === 'apc') {
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 6; k++) {
          add(tilt, box(0.12, 0.4, 0.65), accentMat, `era_tile_${side < 0 ? 'L' : 'R'}_${k}`, [side * 1.42, 1.5, -2.1 + k * 0.8], [0, 0, side * 0.18], { detachable: true });
        }
      }
    }
    if (cfg.style === 'hotrod') {
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 4; k++) {
          add(tilt, cyl(0.055, 0.75, 10), chrome, `zoomie_pipe_${side < 0 ? 'L' : 'R'}_${k}`, [side * 0.85, 1.15, 1.15 + k * 0.34], [0, 0, side * -0.85]);
        }
      }
    }
    if (cfg.style === 'cyber') {
      for (let side = -1; side <= 1; side += 2) {
        add(tilt, box(0.06, 0.06, 5.4), Assets.lampCyan(), `cyber_trim_${side < 0 ? 'L' : 'R'}`, [side * 1.3, 1.15, 0]);
      }
    }
    if (cfg.style === 'monster') {
      for (let side = -1; side <= 1; side += 2) {
        for (let z of [1.95, -1.95]) {
          add(tilt, cyl(0.11, 1.05, 12), Assets.lampAmber(), `monster_shock_${side < 0 ? 'L' : 'R'}_${z > 0 ? 'F' : 'R'}`, [side * 0.95, 1.15, z], [0, 0, side * -0.22]);
        }
      }
    }
    if (cfg.style === 'hearse') {
      for (let side = -1; side <= 1; side += 2) {
        add(tilt, box(0.05, 0.12, 1.45), chrome, `landau_bar_${side < 0 ? 'L' : 'R'}`, [side * 1.07, 1.95, -2.1], [0.22, 0, 0]);
      }
    }
    if (cfg.style === 'dozer') {
      add(tilt, cyl(0.14, 0.22, 12), Assets.lampAmber(), 'dozer_beacon', [0, roofY + 0.2, -1.1]);
      for (let i = -1; i <= 1; i++) {
        add(tilt, box(0.12, 0.65, 0.55), haz, `ripper_claw_${i + 1}`, [i * 0.75, 0.55, -3.15], [0.4, 0, 0]);
      }
    }

    // ---- Plow / Front Ram ----
    if (P.plow) {
      if (cfg.style === 'dozer') {
        const dzZ = P.plow[1][0] + 0.1;
        add(tilt, box(P.plowW * 1.1, 1.25, 0.28), haz, 'front_plow', [0, 0.82, dzZ], [-0.15, 0, 0]);
      } else {
        add(tilt, Assets.geo(`${styleKey}_plow`, () => profileGeo(P.plow, P.plowW)), cfg.style === 'hauler' ? haz : gun, 'front_plow');
        const spikeZ = P.plow[1][0];
        for (let k = 0; k < 5; k++) {
          add(tilt, Assets.geo('spikeCone', () => new THREE.ConeGeometry(0.11, 0.48, 8)), chrome, `plow_spike_${k}`, [-0.9 + k * 0.45, 0.58, spikeZ], X90);
        }
      }
    }

    // Rear diffuser
    if (P.diff) {
      add(tilt, Assets.geo(`${styleKey}_diff`, () => profileGeo(P.diff, P.diffW)), gun, 'rear_diffuser');
    }

    // Detachable armor plates
    add(tilt, box(1.4, 0.06, 1.2), paintMat, 'armor_plate_hood', [0, hoodTop + 0.05, 1.1], [0, 0, 0], { detachable: true });
    add(tilt, box(P.lowerW * 0.88, 0.68, 0.06), accentMat, 'armor_plate_tail', [0, 1.02, P.lower[0][0] - 0.02], [0, 0, 0], { detachable: true });
    add(tilt, box(0.8, 0.5, 0.6), chrome, 'fuel_can', [0.92, 1.95, -2.5], [0, 0, 0], { detachable: true });

    // Exhaust pipes & Nitro anchors
    for (let side = -1; side <= 1; side += 2) {
      const sName = side < 0 ? 'L' : 'R';
      const exX = side * 0.75;
      const exZ = P.lower[0][0] - 0.2;
      add(tilt, cyl(0.09, 0.75, 12), chrome, `exhaust_pipe_${sName}`, [exX, 0.58, exZ], X90);
      const anchor = new THREE.Object3D();
      anchor.name = `exhaust_anchor_${sName}`;
      anchor.position.set(exX, 0.58, exZ - 0.4);
      tilt.add(anchor);

      // Rocket pods
      const pod = new THREE.Group();
      pod.name = `rocket_pod_${sName}`;
      pod.position.set(side * (P.lowerW * 0.5 + 0.32), 1.15, 0.1);
      tilt.add(pod);
      add(pod, cyl(0.26, 1.8, 14), gun, `rocket_pod_body_${sName}`, [0, 0, 0], X90);
      for (let k = 0; k < 4; k++) {
        add(pod, cyl(0.08, 0.12, 8), chrome, `rocket_tube_${sName}_${k}`, [k % 2 ? 0.1 : -0.1, k < 2 ? 0.1 : -0.1, 0.92], X90);
      }
    }

    // ---- Roof Autocannon Turret ----
    const turretZ = P.turretZ ?? 0.2;
    add(tilt, cyl(0.44, 0.2, 18), gun, 'turret_base', [0, roofY + 0.12, turretZ]);
    const turretNode = new THREE.Group();
    turretNode.name = 'turret_node';
    turretNode.position.set(0, roofY + 0.24, turretZ);
    tilt.add(turretNode);
    add(turretNode, box(0.95, 0.22, 0.6), gun, 'turret_yoke', [0, 0.06, 0]);
    const turretPitch = new THREE.Group();
    turretPitch.name = 'turret_pitch';
    turretPitch.position.set(0, 0.22, 0.05);
    turretNode.add(turretPitch);
    add(turretPitch, box(0.64, 0.26, 0.72), accentMat, 'autocannon_housing');
    const muzzles = [];
    const flashes = [];
    for (let side = -1; side <= 1; side += 2) {
      const L = side < 0 ? 'L' : 'R';
      add(turretPitch, cyl(0.075, 1.5, 12), chrome, `autocannon_barrel_${L}`, [side * 0.22, 0, 0.95], X90);
      add(turretPitch, cyl(0.11, 0.5, 12), gun, `autocannon_shroud_${L}`, [side * 0.22, 0, 0.62], X90);
      const mz = new THREE.Object3D();
      mz.name = `muzzle_${L}`;
      mz.position.set(side * 0.22, 0, 1.75);
      turretPitch.add(mz);
      muzzles.push(mz);
      const flash = add(
        turretPitch,
        Assets.geo('flashGeo', () => new THREE.SphereGeometry(0.22, 8, 6)),
        Assets.flashMat(),
        `muzzle_flash_${L}`,
        [side * 0.22, 0, 1.85],
      );
      flash.visible = false;
      flash.castShadow = false;
      flashes.push(flash);
    }

    // ---- Multi-Axle Wheel Assembly ----
    const wheels = [];
    const axles = P.axles || [
      { z: P.wheelZ || 1.9, front: true },
      { z: P.rearZ || -1.9, front: false },
    ];
    axles.forEach((axle, aIdx) => {
      const aName = axles.length === 2 ? (axle.front ? 'F' : 'R') : `A${aIdx + 1}`;
      for (const sideSign of [-1, 1]) {
        const sideLetter = sideSign < 0 ? 'L' : 'R';
        const corner = `${aName}${sideLetter}`;
        const x = sideSign * P.track;
        const w = buildWheel(corner, x, axle.z, axle.front, P.wheelScale || 1.0);
        tilt.add(w.root);
        wheels.push(w);
        const flare = add(
          tilt,
          box(0.22, 0.14, 0.95 * (P.wheelScale || 1.0)),
          paintMat,
          `fender_flare_${corner}`,
          [x > 0 ? (P.lowerW * 0.5 + 0.05) : -(P.lowerW * 0.5 + 0.05), 1.38, axle.z],
        );
        flare.castShadow = false;
      }
    });

    if (P.hasRearTracks) {
      for (const side of [-1, 1]) {
        const trk = buildTankTrack(side, side * P.track, -1.75);
        tilt.add(trk.group);
      }
    }

    // Index all wheel and turret meshes
    const wheelMeshes = [];
    for (const w of wheels) {
      w.root.traverse((o) => {
        if (o.isMesh) {
          if (!o.userData.component) o.userData.component = o.name;
          wheelMeshes.push(o);
        }
      });
    }

    root.traverse((o) => {
      if (o.isMesh) o.castShadow = o.name !== 'windshield';
    });

    return {
      root,
      tilt,
      wheels,
      parts: parts.concat(wheelMeshes),
      detachables,
      turretNode,
      turretPitch,
      muzzles,
      paintMat,
      baseColor: new THREE.Color(cfg.paint),
      anchors: [tilt.getObjectByName('exhaust_anchor_L'), tilt.getObjectByName('exhaust_anchor_R')],
      rocketPods: [tilt.getObjectByName('rocket_pod_L'), tilt.getObjectByName('rocket_pod_R')],
      flashes,
      lastFrac: 1,
      styleKey,
    };
  }

  /** Visual damage states: darkening/scorching and heat glow under 30% hull. */
  static updateDamage(model, frac) {
    if (Math.abs(frac - model.lastFrac) < 0.01) return;
    model.lastFrac = frac;
    const burn = clamp((1 - frac) * 1.2, 0, 1);
    model.paintMat.color.copy(model.baseColor).lerp(new THREE.Color(0x141414), burn * 0.65);
    model.paintMat.roughness = 0.36 + burn * 0.45;
    const hot = frac < 0.3 ? (0.3 - frac) / 0.3 : 0;
    model.paintMat.emissive.setRGB(0.35 * hot, 0.1 * hot, 0);
  }

  /** Detaches a random armor plate: hides it on the car and returns it for debris. */
  static detachPlate(model, rnd) {
    const list = model.detachables.filter((m) => m.visible);
    if (!list.length) return null;
    const m = list[Math.floor(rnd() * list.length) % list.length];
    m.visible = false;
    return m;
  }
}

/* ==========================================================================
   TRELLIS CAR LOADER — Loads, scales, and rigs high-fidelity 3D vehicles:
     • razorback   → assets/DeathRaceCar1.glb (Sleek Armored Interceptor)
     • gutshot     → assets/DeathRaceTruck.glb (Heavy Armored Hauler / 6-Wheeler)
     • bloodhammer → assets/DeathRaceJeep.glb (Lifted 4x4 Muscle Brawler)

   Adheres fully to the vehicle model contract:
     - root (yaw), tilt (roll/pitch)
     - wheel assemblies with independent .steer and .spin pivots
     - roof-mounted turretNode with real-time yaw aiming
     - twin muzzle anchors and muzzle flash visual effects
     - nitro exhaust particle anchors and rocket pod mounts
     - paintMat supporting damage scorching and critical heat glow
   ========================================================================== */
class TrellisCarLoader {
  static ASSETS = {
    razorback: {
      file: 'assets/DeathRaceCar1.glb',
      scale: 6.2,
      yOffset: 1.468,
      turretNode: 'Turret_Roof_Rocket',
      turretOffset: [0, 0.08, 0.55],
      exhaustAnchors: [
        [-0.75, 0.62, -3.1],
        [0.75, 0.62, -3.1],
      ],
      rocketPods: [
        [-1.6, 1.05, 0.1],
        [1.6, 1.05, 0.1],
      ],
      muzzleOffsets: [
        [-0.18, 0.06, 0.65],
        [0.18, 0.06, 0.65],
      ],
    },
    gutshot: {
      file: 'assets/DeathRaceTruck.glb',
      scale: 6.2,
      yOffset: 1.333,
      turretNode: 'Turret_Flak_Dual',
      turretOffset: [0, 0.12, 0.7],
      exhaustAnchors: [
        [-0.7, 0.6, -3.2],
        [0.7, 0.6, -3.2],
      ],
      rocketPods: [
        [-1.4, 1.1, 0.1],
        [1.4, 1.1, 0.1],
      ],
      muzzleOffsets: [
        [-0.22, 0.12, 0.85],
        [0.22, 0.12, 0.85],
      ],
    },
    bloodhammer: {
      file: 'assets/DeathRaceJeep.glb',
      scale: 6.19,
      yOffset: 1.593,
      turretNode: 'Turret_Roof_Gun',
      turretOffset: [0, 0.1, 0.65],
      exhaustAnchors: [
        [-0.72, 0.65, -3.0],
        [0.72, 0.65, -3.0],
      ],
      rocketPods: [
        [-1.5, 1.15, 0.1],
        [1.5, 1.15, 0.1],
      ],
      muzzleOffsets: [
        [-0.2, 0.08, 0.75],
        [0.2, 0.08, 0.75],
      ],
    },
  };

  static cache = {};
  static loading = false;
  static loaded = false;
  static callbacks = [];

  /** Asynchronously preloads all 3D vehicle assets into memory. */
  static init() {
    if (this.loading || this.loaded) return;
    this.loading = true;
    const loader = new GLTFLoader();
    const keys = Object.keys(this.ASSETS);
    let remaining = keys.length;

    for (const key of keys) {
      const cfg = this.ASSETS[key];
      loader.load(
        cfg.file,
        (gltf) => {
          this.cache[key] = gltf;
          remaining--;
          if (remaining === 0) {
            this.loaded = true;
            this.loading = false;
            for (const cb of this.callbacks) {
              try {
                cb();
              } catch (e) {
                console.error(e);
              }
            }
            this.callbacks = [];
          }
        },
        undefined,
        (err) => {
          console.info(`[TrellisCarLoader] 3D asset ${cfg.file} unavailable, using procedural model:`, err.message || err);
          remaining--;
          if (remaining === 0) {
            this.loaded = true;
            this.loading = false;
            for (const cb of this.callbacks) {
              try {
                cb();
              } catch (e) {
                console.error(e);
              }
            }
            this.callbacks = [];
          }
        },
      );
    }
  }

  static has(styleKey) {
    const meta = typeof CAR_STYLES !== 'undefined' ? CAR_STYLES[styleKey] : null;
    if (meta) {
      if (meta.modelType !== 'trellis') return false;
      const assetKey = meta.trellisAsset || styleKey;
      return !!this.cache[assetKey];
    }
    return !!this.cache[styleKey];
  }

  static onLoaded(cb) {
    if (this.loaded) {
      cb();
    } else {
      this.callbacks.push(cb);
    }
  }

  /**
   * Instantiates and rigs a 3D vehicle for the specified car style.
   * Falls back seamlessly to ProceduralDeathCarBuilder if the 3D asset is not loaded.
   */
  static build(styleKey) {
    const meta = typeof CAR_STYLES !== 'undefined' ? CAR_STYLES[styleKey] : null;
    const assetKey = meta?.trellisAsset || styleKey;
    const gltf = this.cache[assetKey];
    if (!gltf) {
      return ProceduralDeathCarBuilder.build(styleKey);
    }
    const cfg = this.ASSETS[assetKey];
    const carStyleCfg = meta || CAR_STYLES[styleKey] || { paint: 0x9d1b1b, accent: 0xf2b705 };

    const root = new THREE.Group();
    root.name = `car_${styleKey}`;
    root.rotation.order = 'YXZ';

    const tilt = new THREE.Group();
    tilt.name = 'tilt';
    root.add(tilt);

    // Deep-clone the GLTF scene hierarchy
    const scene = gltf.scene.clone(true);
    scene.scale.setScalar(cfg.scale);
    scene.position.set(0, cfg.yOffset, 0);
    tilt.add(scene);

    let chassisMesh = null;
    let turretMesh = null;
    const wheelMeshes = [];

    // Traverse and clone materials so damage and colors are per-car
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.userData.component = obj.name;
        if (obj.material) {
          obj.material = obj.material.clone();
        }
      }
      if (obj.name === 'Chassis_Main') {
        chassisMesh = obj;
      } else if (obj.name === cfg.turretNode) {
        turretMesh = obj;
      } else if (obj.name.startsWith('Wheel_')) {
        wheelMeshes.push(obj);
      }
    });

    // Material setup for procedural damage states
    let paintMat;
    let baseColor;
    if (chassisMesh && chassisMesh.material) {
      paintMat = chassisMesh.material;
      baseColor = paintMat.color ? paintMat.color.clone() : new THREE.Color(carStyleCfg.paint);
    } else {
      paintMat = Assets.paint(carStyleCfg.paint).clone();
      baseColor = new THREE.Color(carStyleCfg.paint);
    }

    // Rig Wheels with steer and spin pivots
    const wheels = [];
    for (const wMesh of wheelMeshes) {
      const origPos = wMesh.position.clone();
      const parent = wMesh.parent;
      parent.remove(wMesh);

      const isFront = wMesh.name.includes('_F');
      const corner = wMesh.name.replace('Wheel_', '');

      const steerGroup = new THREE.Group();
      steerGroup.name = isFront ? `steer_pivot_${corner}` : `hub_pivot_${corner}`;
      steerGroup.position.copy(origPos);

      const spinGroup = new THREE.Group();
      spinGroup.name = `wheel_spin_${corner}`;
      steerGroup.add(spinGroup);

      wMesh.position.set(0, 0, 0);
      spinGroup.add(wMesh);
      parent.add(steerGroup);

      wheels.push({
        name: corner,
        front: isFront,
        root: steerGroup,
        suspension: steerGroup,
        steer: steerGroup,
        spin: spinGroup,
        mesh: wMesh,
        x: origPos.x * cfg.scale,
        z: origPos.z * cfg.scale,
      });
    }

    // Ensure front steering wheels come first
    wheels.sort((a, b) => (b.front ? 1 : 0) - (a.front ? 1 : 0));

    // Rig Turret node for independent yaw aiming
    const turretNode = new THREE.Group();
    turretNode.name = 'turret_node';

    const turretPitch = new THREE.Group();
    turretPitch.name = 'turret_pitch';
    turretNode.add(turretPitch);

    if (turretMesh) {
      const turretPos = turretMesh.position.clone();
      const turretParent = turretMesh.parent;
      turretParent.remove(turretMesh);

      turretNode.position.copy(turretPos);
      turretMesh.position.set(0, 0, 0);
      turretPitch.add(turretMesh);
      turretParent.add(turretNode);
    } else {
      turretNode.position.set(0, 2.2 / cfg.scale, 0);
      tilt.add(turretNode);
    }

    // Muzzles & Flash meshes
    const muzzles = [];
    const flashes = [];
    for (let k = 0; k < 2; k++) {
      const offset = cfg.muzzleOffsets[k] || [k === 0 ? -0.2 : 0.2, 0.1, 0.7];
      const mz = new THREE.Object3D();
      mz.name = `muzzle_${k === 0 ? 'L' : 'R'}`;
      mz.position.set(offset[0] / cfg.scale, offset[1] / cfg.scale, offset[2] / cfg.scale);
      turretPitch.add(mz);
      muzzles.push(mz);

      const flash = new THREE.Mesh(
        Assets.geo('flashGeo', () => new THREE.SphereGeometry(0.22, 8, 6)),
        Assets.flashMat(),
      );
      flash.name = `muzzle_flash_${k === 0 ? 'L' : 'R'}`;
      flash.position.set(offset[0] / cfg.scale, offset[1] / cfg.scale, (offset[2] + 0.1) / cfg.scale);
      flash.visible = false;
      flash.castShadow = false;
      turretPitch.add(flash);
      flashes.push(flash);
    }

    // Nitro exhaust anchors
    const anchors = [];
    for (let k = 0; k < cfg.exhaustAnchors.length; k++) {
      const pos = cfg.exhaustAnchors[k];
      const anchor = new THREE.Object3D();
      anchor.name = `exhaust_anchor_${k === 0 ? 'L' : 'R'}`;
      anchor.position.set(pos[0], pos[1], pos[2]);
      tilt.add(anchor);
      anchors.push(anchor);
    }

    // Rocket pod mount points
    const rocketPods = [];
    for (let k = 0; k < cfg.rocketPods.length; k++) {
      const pos = cfg.rocketPods[k];
      const pod = new THREE.Group();
      pod.name = `rocket_pod_${k === 0 ? 'L' : 'R'}`;
      pod.position.set(pos[0], pos[1], pos[2]);
      tilt.add(pod);
      rocketPods.push(pod);
    }

    return {
      root,
      tilt,
      wheels,
      parts: wheelMeshes.concat(chassisMesh ? [chassisMesh] : []).concat(turretMesh ? [turretMesh] : []),
      detachables: [],
      turretNode,
      turretPitch,
      muzzles,
      paintMat,
      baseColor,
      anchors,
      rocketPods,
      flashes,
      lastFrac: 1,
      styleKey,
      isTrellisModel: true,
    };
  }
}
