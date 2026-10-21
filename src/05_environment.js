/* ==========================================================================
   05 · ENVIRONMENT — three biomes (terrain, road materials, barriers, instanced
   scenery, lighting, sky, weather) and the pooled ParticleSystem.
   ========================================================================== */
const BIOMES = {
  industrial: {
    label: 'INDUSTRIAL WASTELAND',
    skyTop: 0x0f0d18,
    skyHorizon: 0x9a5530,
    fogColor: 0x2b2228,
    fogDensity: 0.0068,
    hemiSky: 0x8f80a6,
    hemiGround: 0x241710,
    hemiI: 0.9,
    sunColor: 0xffa552,
    sunI: 1.3,
    sunPos: [-80, 60, 40],
    terrainLow: [0x2a2420, 0x3c2e25],
    terrainHigh: [0x4a4038, 0x5b4636],
    terrainAmp: 4.5,
    rail: 0x7d8790,
    post: 0x5b626a,
    gate: 0xffb020,
    weather: 'ash',
    accent: 0xffb020,
    dust: 0x6a625c,
    fire: true,
  },
  desert: {
    label: 'SCORCHED DESERT CANYON',
    skyTop: 0x2f6fbf,
    skyHorizon: 0xf7d9a8,
    fogColor: 0xe6c08a,
    fogDensity: 0.0032,
    hemiSky: 0xfff0d6,
    hemiGround: 0x7a5530,
    hemiI: 1.0,
    sunColor: 0xfff1d6,
    sunI: 2.5,
    sunPos: [60, 120, -40],
    terrainLow: [0xb9864c, 0xc89a5e],
    terrainHigh: [0xe7c08a, 0xf2d6a4],
    terrainAmp: 17,
    rail: 0xc9a07a,
    post: 0x9a7455,
    gate: 0xff6a00,
    weather: 'dust',
    accent: 0xff7a1a,
    dust: 0xd8b889,
    fire: false,
  },
  forest: {
    label: 'DARK PINE FOREST',
    skyTop: 0x040a09,
    skyHorizon: 0x2c403b,
    fogColor: 0x111c19,
    fogDensity: 0.0205,
    hemiSky: 0x6b8a88,
    hemiGround: 0x0b100c,
    hemiI: 0.6,
    sunColor: 0xa9c4ff,
    sunI: 0.95,
    sunPos: [-60, 90, -30],
    terrainLow: [0x1b2a1c, 0x223322],
    terrainHigh: [0x2e3a2a, 0x3b3a2a],
    terrainAmp: 9,
    rail: 0x5a4a38,
    post: 0x4a3a2a,
    gate: 0x9fe870,
    weather: 'rain',
    accent: 0x9fe870,
    dust: 0x40504a,
    fire: false,
  },
  riverside: {
    label: 'RIVER SIDE DRIVE',
    skyTop: 0x4aa0e0,
    skyHorizon: 0xbfe3f5,
    fogColor: 0xa9d6e6,
    fogDensity: 0.0026,
    hemiSky: 0xcfe9ff,
    hemiGround: 0x3d5a2a,
    hemiI: 1.05,
    sunColor: 0xfff4dc,
    sunI: 2.2,
    sunPos: [-70, 110, 50],
    terrainLow: [0x3f6b2e, 0x4c7a35],
    terrainHigh: [0x6b8f40, 0x7d9a4a],
    terrainAmp: 6,
    rail: 0x9aa3a8,
    post: 0x6d757c,
    gate: 0x33d6ff,
    weather: 'none',
    accent: 0x33d6ff,
    dust: 0x9ab8c0,
    fire: false,
    river: true,
  },
  brazil: {
    label: 'HIGH STREETS OF BRAZIL',
    skyTop: 0x2f8fe0,
    skyHorizon: 0xffe6b0,
    fogColor: 0xf5deb0,
    fogDensity: 0.0018,
    hemiSky: 0xfff3dc,
    hemiGround: 0x9a8a6a,
    hemiI: 1.1,
    sunColor: 0xfff0c8,
    sunI: 2.5,
    sunPos: [40, 130, -60],
    terrainLow: [0x8a8478, 0x9a9184],
    terrainHigh: [0xb8ad98, 0xc9bca5],
    terrainAmp: 1.2,
    rail: 0xe8e0cf,
    post: 0x7f7a70,
    gate: 0xff3d8b,
    weather: 'none',
    accent: 0xff3d8b,
    dust: 0xe0d0a8,
    fire: false,
  },
  mumbai: {
    label: 'MUMBAI AFTER THE FALL',
    skyTop: 0x2a2630,
    skyHorizon: 0xb07a4e,
    fogColor: 0x5b4a40,
    fogDensity: 0.0105,
    hemiSky: 0xb49a84,
    hemiGround: 0x2a1d16,
    hemiI: 0.8,
    sunColor: 0xffb06a,
    sunI: 1.2,
    sunPos: [-90, 45, 30],
    terrainLow: [0x3a2e26, 0x463628],
    terrainHigh: [0x5e4c3a, 0x6b5640],
    terrainAmp: 5,
    rail: 0x6e6862,
    post: 0x4d4843,
    gate: 0xff8a2a,
    weather: 'ash',
    accent: 0xff8a2a,
    dust: 0x7a6a58,
    fire: true,
  },
};

/**
 * Lighting presets. Any biome can be combined with any preset ('biome' keeps the biome's own values).
 * `headlight` is the intensity of the point light that follows the player; it is zero in daylight.
 */
const LIGHTING = {
  night: {
    label: 'NIGHT · DARK STREETS',
    skyTop: 0x010206,
    skyHorizon: 0x0c1428,
    fogColor: 0x05080f,
    fogDensity: 0.012,
    hemiSky: 0x2a3a66,
    hemiGround: 0x05060a,
    hemiI: 0.22,
    sunColor: 0x7f9cff,
    sunI: 0.18,
    sunPos: [-60, 90, -40],
    headlight: 30,
  },
  day: {
    label: 'CLEAR BLUE DAY',
    skyTop: 0x3c8fe6,
    skyHorizon: 0xbfe6ff,
    fogColor: 0xcdeeff,
    fogDensity: 0.0011,
    hemiSky: 0xe2f4ff,
    hemiGround: 0x7f9a6e,
    hemiI: 1.3,
    sunColor: 0xfffaf0,
    sunI: 2.7,
    sunPos: [60, 140, 40],
    headlight: 0,
  },
  sunset: {
    label: 'GOLDEN SUNSET',
    skyTop: 0x2e3f8f,
    skyHorizon: 0xff8f4f,
    fogColor: 0xf2956a,
    fogDensity: 0.0034,
    hemiSky: 0xffc08a,
    hemiGround: 0x4a2a1a,
    hemiI: 0.9,
    sunColor: 0xff9a52,
    sunI: 2.2,
    sunPos: [130, 30, -70],
    headlight: 0,
  },
  storm: {
    label: 'STORM DUSK',
    skyTop: 0x141a26,
    skyHorizon: 0x4a5262,
    fogColor: 0x343b46,
    fogDensity: 0.0095,
    hemiSky: 0x76829a,
    hemiGround: 0x1a1d22,
    hemiI: 0.6,
    sunColor: 0xaebcd6,
    sunI: 0.6,
    sunPos: [-40, 80, 60],
    headlight: 5,
  },
};
/** River channel for RIVER SIDE DRIVE: centred at lateral offset `lat` (negative = right of the road). */
const RIVER = { lat: -27, half: 5.5, reach: 9, depth: 2.4, waterDrop: 1.4 };

/* ---------------------------- Particles ---------------------------------- */
const PARTICLE_VS = `
  attribute float size; attribute float alpha; attribute vec3 color;
  uniform float uScale;
  varying float vA; varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
    vA = alpha; vC = color;
  }`;
const PARTICLE_FS = `
  varying float vA; varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.0, d) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC, a);
  }`;

/** A fixed-capacity ring buffer of billboard particles drawn with one Points object. */
class ParticlePool {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.head = 0;
    this.px = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.alpha0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.px, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 500 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.name = additive ? 'sparks' : 'smoke';
    scene.add(this.points);
    this.geometry = g;
    this.alive = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, alpha, grow = 0.5, drag = 1.5) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.px[i * 3] = x;
    this.px[i * 3 + 1] = y;
    this.px[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.size[i] = size;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.alpha0[i] = alpha;
    this.alpha[i] = alpha;
  }
  update(dt) {
    const cap = this.cap;
    for (let i = 0; i < cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= k;
      this.vel[j + 1] = this.vel[j + 1] * k + 0.0;
      this.vel[j + 2] *= k;
      this.px[j] += this.vel[j] * dt;
      this.px[j + 1] += this.vel[j + 1] * dt;
      this.px[j + 2] += this.vel[j + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = this.alpha0[i] * t;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - t));
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
  setScale(h, fovDeg) {
    this.uniforms.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

class ParticleSystem {
  constructor(scene) {
    this.sparks = new ParticlePool(scene, 700, true);
    this.smoke = new ParticlePool(scene, 420, false);
    this.debrisCap = 14;
    this.debris = [];
    this.debrisHead = 0;
    this.scene = scene;
  }
  sparksAt(x, y, z, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = (4 + Math.random() * 10) * power;
      this.sparks.emit(
        x,
        y,
        z,
        Math.cos(a) * s,
        2 + Math.random() * 6 * power,
        Math.sin(a) * s,
        0.25 + Math.random() * 0.35,
        1.6 + Math.random(),
        1.0,
        0.65 + Math.random() * 0.25,
        0.2,
        0.9,
        0.3,
        0.2,
      );
    }
  }
  puff(x, y, z, vx, vy, vz, size, life, r, g, b, alpha = 0.55) {
    this.smoke.emit(
      x,
      y,
      z,
      vx + (Math.random() - 0.5) * 1.2,
      vy,
      vz + (Math.random() - 0.5) * 1.2,
      life,
      size,
      r,
      g,
      b,
      alpha,
      1.6,
      0.8,
    );
  }
  fireAt(x, y, z) {
    this.sparks.emit(
      x + (Math.random() - 0.5) * 0.8,
      y,
      z + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 2,
      4 + Math.random() * 4,
      (Math.random() - 0.5) * 2,
      0.45 + Math.random() * 0.3,
      3.2 + Math.random() * 2,
      1.0,
      0.45 + Math.random() * 0.2,
      0.05,
      0.9,
      0.8,
      0.3,
    );
    if (Math.random() < 0.5) this.puff(x, y + 0.5, z, 0, 2.5, 0, 2.0, 1.4, 0.15, 0.13, 0.12, 0.35);
  }
  /** Debris pieces: real meshes with gravity and floor bounce, pooled. */
  spawnDebris(mesh, pos, vel) {
    const d = {
      mesh,
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
      spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      life: 5,
    };
    mesh.position.copy(pos);
    mesh.visible = true;
    this.scene.add(mesh);
    if (this.debris.length < this.debrisCap) this.debris.push(d);
    else {
      const old = this.debris[this.debrisHead];
      old.mesh.removeFromParent();
      this.debris[this.debrisHead] = d;
      this.debrisHead = (this.debrisHead + 1) % this.debrisCap;
    }
  }
  updateDebris(dt, floorY) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vy -= 22 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      if (d.mesh.position.y < floorY + 0.1) {
        d.mesh.position.y = floorY + 0.1;
        d.vy = Math.abs(d.vy) * 0.35;
        d.vx *= 0.6;
        d.vz *= 0.6;
      }
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.life <= 0) {
        d.mesh.removeFromParent();
        this.debris.splice(i, 1);
      }
    }
  }
  update(dt, floorY = 0) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.updateDebris(dt, floorY);
  }
  setScale(h, fov) {
    this.sparks.setScale(h, fov);
    this.smoke.setScale(h, fov);
  }
  clear() {
    for (const d of this.debris) d.mesh.removeFromParent();
    this.debris.length = 0;
    this.debrisHead = 0;
    this.sparks.life.fill(0);
    this.smoke.life.fill(0);
  }
}

/* ----------------------------- Weather ----------------------------------- */
class WeatherSystem {
  constructor(scene) {
    this.count = 650;
    this.pool = new ParticlePool(scene, this.count, false);
    this.pool.points.name = 'weather';
    this.kind = 'none';
    this.center = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) this.pool.life[i] = 0;
  }
  setKind(kind) {
    this.kind = kind;
    const p = this.pool;
    for (let i = 0; i < this.count; i++) {
      p.life[i] = 1e9;
      this.respawn(i, true);
    }
    for (const k of ['position', 'color', 'size', 'alpha']) p.geometry.attributes[k].needsUpdate = true;
  }
  respawn(i, first = false) {
    const p = this.pool;
    const j = i * 3;
    p.px[j] = this.center.x + (Math.random() - 0.5) * 140;
    p.px[j + 1] = this.center.y + (first ? Math.random() * 40 - 5 : 30 + Math.random() * 20 - 10);
    p.px[j + 2] = this.center.z + (Math.random() - 0.5) * 140;
    if (this.kind === 'rain') {
      p.size0[i] = 1.8;
      p.col[j] = 0.7;
      p.col[j + 1] = 0.78;
      p.col[j + 2] = 0.85;
      p.alpha0[i] = 0.35;
      p.vel[j] = 2;
      p.vel[j + 1] = -55;
      p.vel[j + 2] = 3;
    } else if (this.kind === 'ash') {
      p.size0[i] = 2.6;
      p.col[j] = 0.55;
      p.col[j + 1] = 0.52;
      p.col[j + 2] = 0.5;
      p.alpha0[i] = 0.45;
      p.vel[j] = 1.5;
      p.vel[j + 1] = -2.5;
      p.vel[j + 2] = 0.7;
    } else if (this.kind === 'dust') {
      p.size0[i] = 4.0;
      p.col[j] = 0.86;
      p.col[j + 1] = 0.72;
      p.col[j + 2] = 0.5;
      p.alpha0[i] = 0.16;
      p.vel[j] = 16;
      p.vel[j + 1] = 0.5;
      p.vel[j + 2] = 4;
    } else {
      p.alpha0[i] = 0;
    }
    p.alpha[i] = p.alpha0[i];
    p.size[i] = p.size0[i];
    p.grow[i] = 0;
  }
  update(dt, center) {
    if (this.kind === 'none') return;
    this.center.copy(center);
    const p = this.pool;
    const h = 60;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      p.px[j] += p.vel[j] * dt;
      p.px[j + 1] += p.vel[j + 1] * dt;
      p.px[j + 2] += p.vel[j + 2] * dt;
      if (p.px[j + 1] < center.y - 10 || Math.abs(p.px[j] - center.x) > 75 || Math.abs(p.px[j + 2] - center.z) > 75)
        this.respawn(i);
      else if (p.px[j + 1] > center.y + h) p.px[j + 1] = center.y - 8;
    }
    p.geometry.attributes.position.needsUpdate = true;
    p.geometry.attributes.color.needsUpdate = true;
    p.geometry.attributes.size.needsUpdate = true;
    p.geometry.attributes.alpha.needsUpdate = true;
  }
  dispose() {
    this.pool.dispose();
  }
}

/* --------------------------- Environment --------------------------------- */
class EnvironmentBuilder {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = null;
    this.geos = [];
    this.mats = [];
    this.textures = [];
    this.obstacles = [];
    this.emitters = [];
    this.skyMesh = null;
    this.biome = null;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -55;
    sc.right = 55;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 1;
    sc.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.headlight = new THREE.PointLight(0xffe0b0, 0, 70, 1.4);
    this.headlight.name = 'headlight';
    this.scene.add(this.headlight);
    this.lightingId = 'biome';
    this.weather = new WeatherSystem(scene);
    this.emitTimer = 0;
  }

  track(o) {
    if (o.geometry) this.geos.push(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => this.mats.push(m));
    return o;
  }
  reg(geo) {
    this.geos.push(geo);
    return geo;
  }

  /** Analytic base terrain plus road blend (road always lies on an exact flat-to-track surface). */
  baseHeight(x, z, B) {
    const n = this.noise;
    if (this.biomeId === 'desert') {
      const dunes = (n.fbm(x * 0.0032, z * 0.0032, 4) - 0.45) * 2.2;
      const ridge = Math.abs(n.fbm(x * 0.0055 + 9, z * 0.0055 - 4, 3) - 0.5) * 2;
      return B.terrainAmp * (dunes * 0.9 + ridge * 0.35);
    }
    if (this.biomeId === 'forest') return B.terrainAmp * (n.fbm(x * 0.006, z * 0.006, 4) - 0.45) * 2.0;
    if (this.biomeId === 'riverside') return B.terrainAmp * (n.fbm(x * 0.004, z * 0.004, 4) - 0.45) * 2.0;
    if (this.biomeId === 'brazil') return B.terrainAmp * (n.fbm(x * 0.004, z * 0.004, 3) - 0.5);
    if (this.biomeId === 'mumbai') {
      const mounds = n.fbm(x * 0.006, z * 0.006, 4) - 0.45;
      const rubble = n.fbm(x * 0.02, z * 0.02, 3) - 0.5;
      return B.terrainAmp * (mounds * 2.0 + rubble * 0.5);
    }
    return B.terrainAmp * (n.fbm(x * 0.005, z * 0.005, 4) - 0.4) * 2.0;
  }
  height(x, z) {
    const B = this.biome;
    const tr = this.track;
    const near = tr.strideNearest(x, z);
    const i = near.idx;
    const lat = (x - tr.cx[i]) * tr.rx[i] + (z - tr.cz[i]) * tr.rz[i];
    const roadY = tr.heightAt(i, lat); // banked road surface under this point
    const w = smoothstep(ROAD_HALF + 3, ROAD_HALF + 24, near.d);
    let h = lerp(roadY - 0.35, this.baseHeight(x, z, B), w);
    if (B.river) {
      // River bed: the ground falls to a channel parallel to the road, smoothly blended into the banks.
      const t = 1 - smoothstep(RIVER.half, RIVER.half + 3.5, Math.abs(lat - RIVER.lat));
      if (t > 0) h = lerp(h, tr.heightAt(i, RIVER.lat) - RIVER.depth, t);
    }
    return h;
  }

  canvasTex(key, w, h, draw, repeatX = 1, repeatY = 1) {
    const cache = this.texCache || (this.texCache = {});
    if (!cache[key]) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      cache[key] = t;
      this.textures.push(t);
    }
    return cache[key];
  }

  roadTexture(biomeId) {
    return this.canvasTex(`road_${biomeId}`, 256, 512, (g, w, h) => {
      const rnd = mulberry32(99);
      const base = { desert: '#6e6258', forest: '#3a3b36', brazil: '#56555a', mumbai: '#3d3630' }[biomeId] || '#3b3a3c';
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = (40 + rnd() * 60) | 0;
        g.fillStyle = `rgba(${v},${v},${v},0.25)`;
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      if (biomeId === 'forest') {
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(90,62,36,${0.12 + rnd() * 0.2})`;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, 6 + rnd() * 18, 0, TAU);
          g.fill();
        }
      }
      if (biomeId === 'industrial') {
        for (let i = 0; i < 30; i++) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 14, 4 + rnd() * 6, 0, 0, TAU);
          g.fill();
        }
      }
      // Edge hazard stripes (industrial) or painted edge lines (others)
      if (biomeId === 'industrial') {
        for (const x0 of [0, w - 14]) {
          for (let y = -h; y < h; y += 28) {
            g.fillStyle = '#e8b400';
            g.beginPath();
            g.moveTo(x0, y);
            g.lineTo(x0 + 14, y + 14);
            g.lineTo(x0 + 14, y + 28);
            g.lineTo(x0, y + 14);
            g.fill();
          }
        }
      } else {
        g.fillStyle = 'rgba(235,235,225,0.85)';
        g.fillRect(10, 0, 6, h);
        g.fillRect(w - 16, 0, 6, h);
      }
      g.fillStyle = 'rgba(245,235,190,0.9)';
      for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 4, y, 8, 64);
    });
  }

  /** Builds the complete scene for one biome and track. */
  build(biomeId, track, seed, lightingId = 'biome') {
    this.dispose();
    const B = BIOMES[biomeId];
    this.biomeId = biomeId;
    this.biome = B;
    this.track = track;
    this.noise = makeNoise(seed | 0);
    const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.rnd = rnd;
    this.group = new THREE.Group();
    this.group.name = `environment_${biomeId}`;
    this.scene.add(this.group);
    const G = this.group;
    this.obstacles = [];
    this.emitters = [];


    // Sky dome (gradient, follows camera in Game.update)
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(B.skyTop) }, horizon: { value: new THREE.Color(B.skyHorizon) } },
      vertexShader:
        'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mats.push(skyMat);
    this.skyMat = skyMat;
    this.skyMesh = new THREE.Mesh(this.reg(new THREE.SphereGeometry(1500, 24, 12)), skyMat);
    this.skyMesh.name = 'sky';
    this.skyMesh.renderOrder = -10;
    G.add(this.skyMesh);

    this.buildTerrain(B);
    this.buildRoad(track, B, biomeId);
    this.buildBarriers(track, B);
    this.buildGantry(track, B);
    this.buildGateMarkers(track, B);
    this.buildProps(biomeId, track, B, rnd);
    this.applyLighting(lightingId);
    this.weather.setKind(B.weather);
    return this;
  }

  /** Applies a lighting preset ('biome' keeps the biome's values). Only sky, fog, hemi, sun and headlight change. */
  applyLighting(id) {
    const B = this.biome;
    const P = LIGHTING[id] || null;
    const v = (k) => (P && P[k] !== undefined ? P[k] : B[k]);
    this.lightingId = P ? id : 'biome';
    this.scene.background = new THREE.Color(v('skyTop'));
    this.scene.fog = new THREE.FogExp2(v('fogColor'), v('fogDensity'));
    this.skyMat.uniforms.top.value.set(v('skyTop'));
    this.skyMat.uniforms.horizon.value.set(v('skyHorizon'));
    this.hemi.color.setHex(v('hemiSky'));
    this.hemi.groundColor.setHex(v('hemiGround'));
    this.hemi.intensity = v('hemiI');
    this.sun.color.setHex(v('sunColor'));
    this.sun.intensity = v('sunI');
    this.sunPosOffset = v('sunPos');
    this.sun.position.set(...this.sunPosOffset);
    this.sun.target.position.set(0, 0, 0);
    this.headlight.intensity = P ? P.headlight : 0;
  }

  /** Dynamically centers the sun shadow frustum on the player for sharp shadows across the circuit. */
  updateSunFollow(x, y, z) {
    if (!this.sun) return;
    const off = this.sunPosOffset || [60, 110, 50];
    this.sun.position.set(x + off[0], y + off[1], z + off[2]);
    this.sun.target.position.set(x, y, z);
  }

  /** Puts the headlight just ahead of the player's car (night presets only). */
  setHeadlight(x, y, z, hd) {
    this.headlight.position.set(x + Math.sin(hd) * 5, y + 1.6, z + Math.cos(hd) * 5);
  }

  buildTerrain(B) {
    const size = 1400;
    const seg = 150;
    const geo = this.reg(new THREE.PlaneGeometry(size, size, seg, seg));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const count = pos.count;
    const cols = new Float32Array(count * 3);
    const cLo = new THREE.Color(B.terrainLow[0]);
    const cLo2 = new THREE.Color(B.terrainLow[1]);
    const cHi = new THREE.Color(B.terrainHigh[0]);
    const cHi2 = new THREE.Color(B.terrainHigh[1]);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      const t = clamp((h + B.terrainAmp * 0.6) / (B.terrainAmp * 1.6 + 0.01), 0, 1);
      const n = this.noise(x * 0.03, z * 0.03);
      tmp
        .copy(cLo)
        .lerp(cLo2, n)
        .lerp(cHi, t * 0.85)
        .lerp(cHi2, Math.max(0, t - 0.6) * 0.8);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildRoad(track, B, biomeId) {
    const N = track.N;
    const H = ROAD_HALF;
    const verts = new Float32Array((N + 1) * 2 * 3);
    const uvs = new Float32Array((N + 1) * 2 * 2);
    const idx = [];
    const cols = new Float32Array((N + 1) * 2 * 3);
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      for (let side = 0; side < 2; side++) {
        const lat = side === 0 ? -H : H;
        const p = track.poseAt(k, lat);
        const o = i * 2 + side;
        verts[o * 3] = p.x;
        verts[o * 3 + 1] = p.y + 0.04;
        verts[o * 3 + 2] = p.z;
        // Rough (dirt / broken) patches tint toward brown with per-vertex variation.
        const bl = track.roughBlend[k];
        const nz = (((k * 37 + side * 11) % 17) / 17 - 0.5) * 0.12;
        cols[o * 3] = 1 + (0.62 + nz - 1) * bl;
        cols[o * 3 + 1] = 1 + (0.5 + nz * 0.8 - 1) * bl;
        cols[o * 3 + 2] = 1 + (0.34 + nz * 0.6 - 1) * bl;
        uvs[o * 2] = side;
        uvs[o * 2 + 1] = (i * track.ds) / 22;
      }
      if (i < N) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = this.reg(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: this.roadTexture(biomeId),
      vertexColors: true,
      roughness: biomeId === 'desert' ? 0.9 : 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'road';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildBarriers(track, B) {
    const N = track.N;
    const H = ROAD_HALF + 0.6;
    const railMat =
      this.mats.push(new THREE.MeshStandardMaterial({ color: B.rail, metalness: 0.6, roughness: 0.42 })) &&
      this.mats[this.mats.length - 1];
    const postMat =
      this.mats.push(new THREE.MeshStandardMaterial({ color: B.post, metalness: 0.4, roughness: 0.7 })) &&
      this.mats[this.mats.length - 1];
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k < N; k += 2) {
        const p = track.poseAt(k, side * H);
        pts.push(new THREE.Vector3(p.x, p.y + 0.78, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const rail = new THREE.Mesh(this.reg(new THREE.TubeGeometry(curve, Math.round(N / 2), 0.2, 6, true)), railMat);
      rail.name = side < 0 ? 'barrier_L' : 'barrier_R';
      rail.castShadow = true;
      this.group.add(rail);
      const pts2 = [];
      for (let k = 0; k < N; k += 2) {
        const p = track.poseAt(k, side * (H + 0.05));
        pts2.push(new THREE.Vector3(p.x, p.y + 0.36, p.z));
      }
      const rail2 = new THREE.Mesh(
        this.reg(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(pts2, true, 'centripetal'),
            Math.round(N / 2),
            0.16,
            6,
            true,
          ),
        ),
        railMat,
      );
      rail2.name = 'barrier_low';
      this.group.add(rail2);
      const count = Math.floor(N / 9);
      const posts = new THREE.InstancedMesh(this.reg(new THREE.BoxGeometry(0.28, 1.2, 0.28)), postMat, count);
      posts.name = 'barrier_posts';
      posts.castShadow = true;
      const dummy = new THREE.Object3D();
      for (let k = 0; k < count; k++) {
        const i = k * 9;
        const p = track.poseAt(i, side * H);
        dummy.position.set(p.x, p.y + 0.4, p.z);
        dummy.rotation.set(0, p.hd, 0);
        dummy.updateMatrix();
        posts.setMatrixAt(k, dummy.matrix);
      }
      posts.instanceMatrix.needsUpdate = true;
      this.group.add(posts);
    }
  }

  buildGantry(track, B) {
    const p0 = track.poseAt(0, 0);
    const mat =
      this.mats.push(new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.7, roughness: 0.45 })) &&
      this.mats[this.mats.length - 1];
    const span = ROAD_HALF * 2 + 5;
    const crossbar = new THREE.Mesh(this.reg(new THREE.BoxGeometry(span, 0.8, 0.8)), mat);
    crossbar.position.set(p0.x, p0.y + 9.2, p0.z);
    crossbar.rotation.y = p0.hd;
    crossbar.name = 'gantry_crossbar';
    this.group.add(crossbar);
    for (const side of [-1, 1]) {
      const p = track.poseAt(0, side * (ROAD_HALF + 2.5));
      const post = new THREE.Mesh(this.reg(new THREE.BoxGeometry(0.9, 9.6, 0.9)), mat);
      post.position.set(p.x, p.y + 4.8, p.z);
      post.name = 'gantry_post';
      post.castShadow = true;
      this.group.add(post);
    }
    const banner = new THREE.Mesh(
      this.reg(new THREE.PlaneGeometry(span - 1, 1.8)),
      new THREE.MeshStandardMaterial({ map: Assets.checker(), roughness: 0.6, side: THREE.DoubleSide }),
    );
    banner.position.set(p0.x + Math.sin(p0.hd) * 0.5, p0.y + 8.0, p0.z + Math.cos(p0.hd) * 0.5);
    banner.rotation.y = p0.hd;
    banner.name = 'finish_banner';
    this.group.add(banner);
    this.mats.push(banner.material);
    this.reg(banner.geometry);
  }

  buildGateMarkers(track, B) {
    const count = (GATE_COUNT - 1) * 2;
    const mat =
      this.mats.push(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: B.gate, emissiveIntensity: 0.9 })) &&
      this.mats[this.mats.length - 1];
    const im = new THREE.InstancedMesh(this.reg(new THREE.BoxGeometry(0.45, 3.4, 0.45)), mat, count);
    im.name = 'gate_markers';
    const dummy = new THREE.Object3D();
    let k = 0;
    for (let g = 1; g < GATE_COUNT; g++)
      for (const side of [-1, 1]) {
        const p = track.poseAt(track.gates[g].idx, side * (ROAD_HALF + 1.6));
        dummy.position.set(p.x, p.y + 1.7, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        im.setMatrixAt(k++, dummy.matrix);
      }
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
  }

  /** Scatter helper: returns up to `count` (x,z) with centreline distance in [minD,maxD]. */
  scatter(count, rnd, minD, maxD, ext = 380) {
    const out = [];
    let tries = 0;
    while (out.length < count && tries < count * 60) {
      tries++;
      const x = (rnd() * 2 - 1) * ext;
      const z = (rnd() * 2 - 1) * ext;
      const d = this.track.strideNearest(x, z).d;
      if (d >= minD && d <= maxD) out.push({ x, z, d });
    }
    return out;
  }

  buildProps(biomeId, track, B, rnd) {
    const G = this.group;
    const dummy = new THREE.Object3D();
    const H = ROAD_HALF;
    const addInstanced = (name, geo, mat, list, fn) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.name = name;
      im.castShadow = true;
      im.receiveShadow = true;
      list.forEach((item, i) => {
        fn(item, i, dummy);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (item.color) im.setColorAt(i, item.color);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      G.add(im);
      return im;
    };
    const matBasic = (color, extra = {}) =>
      this.mats.push(new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.3 }, extra))) &&
      this.mats[this.mats.length - 1];

    // Shoulder scenery sits OUTSIDE the barrier (lateral ≥ ROAD_HALF + 3.6) and is non-collidable: nothing blocks the road.
    const shoulderPoses = (every, lat) => {
      const out = [];
      for (let i = Math.round(every / 2); i < track.N; i += every) {
        const side = Math.floor(i / every) % 2 === 0 ? 1 : -1;
        out.push({ i, lat: side * lat, p: track.poseAt(i, side * lat) });
      }
      return out;
    };

    if (biomeId === 'industrial') {
      // Refinery tanks (instanced), smokestacks, containers, flare towers, pipe bridges, sodium lamps.
      const tanks = this.scatter(16, rnd, 45, 130).map((t) => ({ x: t.x, z: t.z, r: 6 + rnd() * 5, h: 9 + rnd() * 6 }));
      const tankGeo = this.reg(new THREE.CylinderGeometry(1, 1, 1, 22));
      const tankMat = matBasic(0x6b6258, { metalness: 0.5, roughness: 0.6 });
      addInstanced('refinery_tanks', tankGeo, tankMat, tanks, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z) + t.h / 2, t.z);
        d.scale.set(t.r, t.h, t.r);
        d.rotation.set(0, rnd() * TAU, 0);
      });
      const stacks = this.scatter(10, rnd, 60, 160).map((t) => ({ x: t.x, z: t.z }));
      addInstanced(
        'smokestacks',
        this.reg(new THREE.CylinderGeometry(1.4, 2.2, 36, 12)),
        matBasic(0x4a4642),
        stacks,
        (t, i, d) => {
          d.position.set(t.x, this.height(t.x, t.z) + 18, t.z);
        },
      );
      for (const t of stacks.slice(0, 6))
        this.emitters.push({ kind: 'smoke', x: t.x, y: this.height(t.x, t.z) + 36, z: t.z, rate: 2.5 });
      const containers = this.scatter(26, rnd, 20, 38).map((t) => ({
        x: t.x,
        z: t.z,
        color: new THREE.Color().setHSL(
          rnd() < 0.5 ? 0.02 + rnd() * 0.04 : 0.55 + rnd() * 0.1,
          0.45,
          0.28 + rnd() * 0.12,
        ),
      }));
      addInstanced(
        'containers',
        this.reg(new THREE.BoxGeometry(6, 2.6, 2.4)),
        this.mats.push(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.35 })) &&
          this.mats[this.mats.length - 1],
        containers,
        (t, i, d) => {
          d.position.set(t.x, this.height(t.x, t.z) + 1.3, t.z);
          d.rotation.set(0, rnd() * TAU, 0);
        },
      );
      const flares = this.scatter(3, rnd, 90, 170);
      for (const f of flares) {
        const y0 = this.height(f.x, f.z);
        const tower = new THREE.Mesh(
          this.reg(new THREE.CylinderGeometry(0.7, 1.0, 42, 10)),
          matBasic(0x55504c, { metalness: 0.6 }),
        );
        tower.position.set(f.x, y0 + 21, f.z);
        tower.name = 'flare_tower';
        G.add(tower);
        this.emitters.push({ kind: 'fire', x: f.x, y: y0 + 42.5, z: f.z, rate: 1 });
      }
      for (let k = 0; k < 3; k++) {
        const idx = Math.round(((k + 0.5) * track.N) / 3) + 25;
        const pa = track.poseAt(idx, -H - 6);
        const pb = track.poseAt(idx, 0);
        const pc = track.poseAt(idx, H + 6);
        const pts = [
          new THREE.Vector3(pa.x, pa.y + 9, pa.z),
          new THREE.Vector3(pb.x, pb.y + 9.6, pb.z),
          new THREE.Vector3(pc.x, pc.y + 9, pc.z),
        ];
        const pipe = new THREE.Mesh(
          this.reg(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.55, 8, false)),
          matBasic(0x8a4b2a, { metalness: 0.7, roughness: 0.5 }),
        );
        pipe.name = 'pipe_bridge';
        pipe.castShadow = true;
        G.add(pipe);
        for (const p of [pa, pc]) {
          const pil = new THREE.Mesh(this.reg(new THREE.BoxGeometry(1.2, 9.2, 1.2)), matBasic(0x3e3a38));
          pil.position.set(p.x, p.y + 4.6, p.z);
          pil.name = 'pipe_pillar';
          G.add(pil);
        }
      }
      const lampPoses = [];
      for (let i = 0; i < track.N; i += 28)
        for (const side of [-1, 1]) lampPoses.push(track.poseAt(i, side * (H + 2.5)));
      addInstanced(
        'streetlamp_poles',
        this.reg(new THREE.CylinderGeometry(0.14, 0.18, 9, 6)),
        matBasic(0x2b2b2b),
        lampPoses,
        (p, i, d) => {
          d.position.set(p.x, p.y + 4.5, p.z);
        },
      );
      addInstanced(
        'sodium_heads',
        this.reg(new THREE.BoxGeometry(0.9, 0.3, 0.6)),
        this.mats.push(
          new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffb347, emissiveIntensity: 1.8 }),
        ) && this.mats[this.mats.length - 1],
        lampPoses,
        (p, i, d) => {
          d.position.set(p.x, p.y + 9.0, p.z);
          d.rotation.set(0, p.hd, 0);
        },
      );
      // Oil barrels: decorative scenery beyond the barrier (not collidable)
      const barrels = shoulderPoses(110, H + 4.2).map((s) => ({
        x: s.p.x,
        z: s.p.z,
        y: s.p.y,
        color: new THREE.Color(0xc4501f),
      }));
      addInstanced(
        'oil_barrels',
        this.reg(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 12)),
        matBasic(0xffffff, { metalness: 0.5, roughness: 0.5 }),
        barrels,
        (b, i, d) => {
          d.position.set(b.x, b.y + 0.65, b.z);
        },
      );
      for (const b of barrels.slice(0, 3))
        this.emitters.push({ kind: 'fire', x: b.x, y: b.y + 1.5, z: b.z, rate: 0.6 });
    }

    if (biomeId === 'desert') {
      // Sandstone mesas (jagged cylinders, instanced) and derricks (merged lattice, instanced)
      const mesaGeo = this.reg(new THREE.CylinderGeometry(18, 30, 50, 9, 2));
      const mp = mesaGeo.attributes.position;
      for (let i = 0; i < mp.count; i++) {
        const x = mp.getX(i);
        const y = mp.getY(i);
        const z = mp.getZ(i);
        const j = 1 + (this.noise(x * 0.2 + y * 0.1, z * 0.2) - 0.5) * 0.25;
        mp.setXYZ(i, x * j, y, z * j);
      }
      mesaGeo.computeVertexNormals();
      const mesas = this.scatter(16, rnd, 80, 230).map((m) => ({
        x: m.x,
        z: m.z,
        s: 0.7 + rnd() * 0.8,
        color: new THREE.Color().setHSL(0.07 + rnd() * 0.02, 0.5, 0.45 + rnd() * 0.12),
      }));
      addInstanced('mesas', mesaGeo, matBasic(0xc8895a, { roughness: 0.95 }), mesas, (m, i, d) => {
        d.position.set(m.x, this.height(m.x, m.z) + 22 * m.s - 3, m.z);
        d.scale.set(m.s, m.s, m.s);
      });
      const derrickParts = [];
      const legGeo = new THREE.CylinderGeometry(0.22, 0.22, 26, 5);
      for (const [ax, az] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ]) {
        const l = legGeo.clone();
        l.translate(ax, 13, az);
        derrickParts.push(l);
      }
      for (let k = 0; k < 4; k++) {
        const b = new THREE.BoxGeometry(6.2, 0.22, 0.22);
        b.translate(0, 4 + k * 6, 3);
        derrickParts.push(b);
        const b2 = new THREE.BoxGeometry(0.22, 0.22, 6.2);
        b2.translate(3, 4 + k * 6, 0);
        derrickParts.push(b2);
      }
      const deck = new THREE.BoxGeometry(8, 0.6, 8);
      deck.translate(0, 27, 0);
      derrickParts.push(deck);
      const beam = new THREE.BoxGeometry(0.5, 0.5, 18);
      beam.translate(0, 29, 0);
      derrickParts.push(beam);
      const derrickGeo = this.reg(mergeGeometries(derrickParts.map((g) => (g.toNonIndexed ? g.toNonIndexed() : g))));
      const derricks = this.scatter(8, rnd, 45, 130).map((m) => ({ x: m.x, z: m.z }));
      addInstanced(
        'oil_derricks',
        derrickGeo,
        matBasic(0x2e2a26, { metalness: 0.6, roughness: 0.55 }),
        derricks,
        (m, i, d) => {
          d.position.set(m.x, this.height(m.x, m.z), m.z);
          d.rotation.set(0, rnd() * TAU, 0);
        },
      );
      for (const m of derricks.slice(0, 4))
        this.emitters.push({ kind: 'dust', x: m.x, y: this.height(m.x, m.z) + 2, z: m.z, rate: 0.4 });
      // Canyon arches spanning the road
      for (let k = 0; k < 4; k++) {
        const idx = Math.round(((k + 0.3) * track.N) / 4) + 60;
        const p = track.poseAt(idx, 0);
        const arch = new THREE.Mesh(
          this.reg(new THREE.TorusGeometry(15.5, 3.8, 10, 28, Math.PI)),
          matBasic(0xb8703f, { roughness: 0.95 }),
        );
        arch.position.set(p.x, p.y, p.z);
        arch.rotation.y = p.hd;
        arch.name = 'canyon_arch';
        arch.castShadow = true;
        G.add(arch);
      }
      // Ruined billboards beside the road (facing traffic)
      const texts = ['GUTTER OIL CO.', 'NO FUEL 200 MI', 'DEATH RACE 2 · THIS WAY', 'SALVAGE & PARTS'];
      for (let k = 0; k < texts.length; k++) {
        const idx = Math.round(((k + 0.5) * track.N) / texts.length) + 140;
        const side = k % 2 ? 1 : -1;
        const p = track.poseAt(idx, side * (H + 9));
        const tex = this.canvasTex(`bb${k}`, 512, 192, (g, w, h) => {
          g.fillStyle = '#e9c46a';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#7a2e12';
          g.fillRect(0, h - 26, w, 26);
          g.fillStyle = '#2a1206';
          g.font = 'bold 58px Impact, Arial Narrow, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(texts[k], w / 2, h / 2 - 8);
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.lineWidth = 4;
          g.strokeRect(6, 6, w - 12, h - 12);
        });
        const board = new THREE.Mesh(
          this.reg(new THREE.PlaneGeometry(12, 4.5)),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
        );
        this.mats.push(board.material);
        board.position.set(p.x, p.y + 7.5, p.z);
        board.lookAt(track.cx[idx], p.y + 7.5, track.cz[idx]);
        board.name = 'billboard';
        G.add(board);
        const post = new THREE.Mesh(this.reg(new THREE.BoxGeometry(0.5, 7.5, 0.5)), matBasic(0x4a3a2a));
        post.position.set(p.x, p.y + 3.7, p.z);
        G.add(post);
      }
      // Shoulder boulders: decorative scenery beyond the barrier (not collidable)
      const boulders = shoulderPoses(120, H + 3.6).map((s, k) => ({
        x: s.p.x,
        z: s.p.z,
        y: s.p.y,
        s: 1.2 + (k % 3) * 0.4,
      }));
      const bGeo = this.reg(new THREE.IcosahedronGeometry(1, 1));
      addInstanced('boulders', bGeo, matBasic(0x8c6a4c, { roughness: 0.95 }), boulders, (b, i, d) => {
        d.position.set(b.x, b.y + b.s * 0.5, b.z);
        d.scale.set(b.s, b.s * 0.7, b.s);
        d.rotation.set(rnd(), rnd(), 0);
      });
      // Desert dust trail emitters are spawned per-car in Game (dustAcc).
    }

    if (biomeId === 'forest') {
      // Layered pine trees: trunk (brown) + four foliage tiers (green), instanced with per-tree tint.
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.28, 0.42, 4, 6);
      trunk.translate(0, 2, 0);
      const tcol = [];
      for (let i = 0; i < trunk.attributes.position.count; i++) tcol.push(0.35, 0.22, 0.12);
      trunk.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
      parts.push(trunk);
      const tiers = [
        [3.4, 4.2, 3.2],
        [2.7, 3.6, 5.2],
        [2.0, 3.0, 7.0],
        [1.2, 2.4, 8.7],
      ];
      for (const [r, h, y] of tiers) {
        const c = new THREE.ConeGeometry(r, h, 8);
        c.translate(0, y, 0);
        const cc = [];
        for (let i = 0; i < c.attributes.position.count; i++) cc.push(0.85, 0.95, 0.85);
        c.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
        parts.push(c);
      }
      const treeGeo = this.reg(mergeGeometries(parts.map((g) => g.toNonIndexed())));
      const treeMat =
        this.mats.push(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })) &&
        this.mats[this.mats.length - 1];
      const trees = this.scatter(780, rnd, ROAD_HALF + 9, 330, 360).map((t) => ({
        x: t.x,
        z: t.z,
        s: 0.8 + rnd() * 0.9,
        color: new THREE.Color().setHSL(0.33 + (rnd() - 0.5) * 0.06, 0.45, 0.14 + rnd() * 0.12),
      }));
      addInstanced('pine_trees', treeGeo, treeMat, trees, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z), t.z);
        d.scale.set(t.s, t.s * (0.9 + rnd() * 0.3), t.s);
        d.rotation.set(0, rnd() * TAU, 0);
      });
      // Boulders and fallen logs: decorative scenery beyond the barrier (not collidable)
      const rockGeo = this.reg(new THREE.IcosahedronGeometry(1, 1));
      const rp = rockGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const k = 0.8 + this.noise(rp.getX(i) * 3 + 7, rp.getZ(i) * 3) * 0.4;
        rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.8, rp.getZ(i) * k);
      }
      rockGeo.computeVertexNormals();
      const rocks = shoulderPoses(70, H + 3.6).map((s, k) => ({
        x: s.p.x,
        z: s.p.z,
        y: s.p.y,
        s: 1.4 + (k % 4) * 0.45,
      }));
      addInstanced('shoulder_rocks', rockGeo, matBasic(0x5d5a52, { roughness: 0.95 }), rocks, (r, i, d) => {
        d.position.set(r.x, r.y + r.s * 0.2, r.z);
        d.scale.set(r.s, r.s * 0.75, r.s);
        d.rotation.set(0, i, 0);
      });
      const logs = shoulderPoses(95, H + 4.0).map((s, k) => ({
        x: s.p.x,
        z: s.p.z,
        y: s.p.y,
        yaw: s.p.hd + (k % 2 ? 0.4 : -0.4),
      }));
      addInstanced(
        'fallen_logs',
        this.reg(new THREE.CylinderGeometry(0.6, 0.7, 6.2, 8)),
        matBasic(0x4a3520, { roughness: 0.95 }),
        logs,
        (l, i, d) => {
          d.position.set(l.x, l.y + 0.6, l.z);
          d.rotation.set(0, l.yaw, Math.PI / 2);
        },
      );
      // Extra background logs & stumps (non-colliding scenery)
      const stumps = this.scatter(60, rnd, ROAD_HALF + 12, 200, 300).map((t) => ({ x: t.x, z: t.z }));
      addInstanced(
        'stumps',
        this.reg(new THREE.CylinderGeometry(0.5, 0.6, 1.0, 7)),
        matBasic(0x3a2a1a),
        stumps,
        (t, i, d) => {
          d.position.set(t.x, this.height(t.x, t.z) + 0.5, t.z);
        },
      );
    }

    if (biomeId === 'riverside') {
      this.buildRiver(track);
      const trees = this.scatter(260, rnd, H + 5, 230, 300).filter(
        (t) => Math.abs(track.query(t.x, t.z).lat - RIVER.lat) > RIVER.half + 5,
      );
      const trunkGeo = this.reg(new THREE.CylinderGeometry(0.3, 0.45, 4.5, 7));
      trunkGeo.translate(0, 2.25, 0);
      const canopyGeo = this.reg(new THREE.IcosahedronGeometry(2.6, 1));
      canopyGeo.translate(0, 6.2, 0);
      const placed = trees.map((t) => ({ x: t.x, z: t.z, s: 0.8 + rnd() * 0.7, rot: rnd() * TAU }));
      addInstanced('riverside_trunks', trunkGeo, matBasic(0x5a4632, { roughness: 0.95 }), placed, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z), t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.setScalar(t.s);
      });
      const leafy = placed.map((t) => ({
        ...t,
        color: new THREE.Color().setHSL(0.24 + (rnd() - 0.5) * 0.06, 0.5, 0.26 + rnd() * 0.1),
      }));
      addInstanced('riverside_canopies', canopyGeo, matBasic(0xffffff, { roughness: 0.9 }), leafy, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z), t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.setScalar(t.s);
      });
    }

    if (biomeId === 'brazil') {
      // High street: colourful facades on both sides of the road, palms along the pavement.
      const facade = this.canvasTex(
        'facade_brazil',
        128,
        256,
        (g, w, h) => {
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, w, h);
          for (let y = 14; y < h - 20; y += 34) {
            for (let x = 10; x < w - 16; x += 26) {
              g.fillStyle = '#2a3b4c';
              g.fillRect(x, y, 14, 20);
              g.fillStyle = 'rgba(255,255,255,0.35)';
              g.fillRect(x + 2, y + 2, 4, 7);
            }
          }
          g.fillStyle = 'rgba(0,0,0,0.14)';
          for (let y = 0; y < h; y += 34) g.fillRect(0, y + 30, w, 3);
        },
        2,
        3,
      );
      const facadeMat =
        this.mats.push(new THREE.MeshStandardMaterial({ color: 0xffffff, map: facade, roughness: 0.85, metalness: 0 })) &&
        this.mats[this.mats.length - 1];
      const blockGeo = this.reg(new THREE.BoxGeometry(1, 1, 1));
      blockGeo.translate(0, 0.5, 0);
      const palette = ['#f2c14e', '#e4572e', '#17bebb', '#76b041', '#ff6f91', '#ffe066', '#5bc0eb', '#f29e4c', '#ffffff'];
      const blocks = [];
      for (let i = 0; i < track.N; i += 11) {
        for (const side of [1, -1]) {
          const p = track.poseAt(i, side * (H + 5.5 + rnd() * 3));
          blocks.push({
            x: p.x,
            z: p.z,
            yaw: p.hd,
            w: 6 + rnd() * 4,
            d: 7 + rnd() * 5,
            h: 7 + rnd() * 16,
            color: new THREE.Color(palette[(rnd() * palette.length) | 0]),
          });
        }
      }
      addInstanced('brazil_blocks', blockGeo, facadeMat, blocks, (b, i, d) => {
        d.position.set(b.x, this.height(b.x, b.z), b.z);
        d.rotation.set(0, b.yaw, 0);
        d.scale.set(b.w, b.h, b.d);
      });
      const tintGeo = (g, r, gg, b) => {
        const cc = [];
        for (let i = 0; i < g.attributes.position.count; i++) cc.push(r, gg, b);
        g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
        return g;
      };
      const palmParts = [tintGeo(new THREE.CylinderGeometry(0.2, 0.32, 7.5, 6).translate(0, 3.75, 0).toNonIndexed(), 0.45, 0.33, 0.2)];
      for (let k = 0; k < 7; k++) {
        const f = new THREE.ConeGeometry(0.45, 3.4, 4);
        f.rotateZ(-Math.PI / 2);
        f.translate(1.7, 0, 0);
        f.rotateZ(-0.35);
        f.rotateY((k / 7) * TAU);
        f.translate(0, 7.3, 0);
        palmParts.push(tintGeo(f.toNonIndexed(), 0.2, 0.5, 0.2));
      }
      const palmGeo = this.reg(mergeGeometries(palmParts));
      const palmMat =
        this.mats.push(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 })) &&
        this.mats[this.mats.length - 1];
      const palms = this.scatter(110, rnd, H + 7, 170, 260).map((t) => ({
        x: t.x,
        z: t.z,
        s: 0.9 + rnd() * 0.5,
        rot: rnd() * TAU,
      }));
      addInstanced('palm_trees', palmGeo, palmMat, palms, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z), t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.setScalar(t.s);
      });
    }

    if (biomeId === 'mumbai') {
      // After the fall: broken towers, rubble, abandoned wrecks and a few smoke columns.
      const towerGeo = this.reg(new THREE.BoxGeometry(1, 1, 1));
      towerGeo.translate(0, 0.5, 0);
      const towers = [];
      for (let i = 0; i < track.N; i += 13) {
        for (const side of [1, -1]) {
          if (rnd() < 0.3) continue;
          const p = track.poseAt(i, side * (H + 6 + rnd() * 10));
          towers.push({
            x: p.x,
            z: p.z,
            yaw: p.hd,
            w: 7 + rnd() * 7,
            d: 7 + rnd() * 6,
            h: 10 + rnd() * 26,
            tilt: (rnd() - 0.5) * 0.08,
            color: new THREE.Color().setHSL(0.07 + rnd() * 0.03, 0.12 + rnd() * 0.1, 0.16 + rnd() * 0.12),
          });
        }
      }
      addInstanced('ruined_towers', towerGeo, matBasic(0xffffff, { roughness: 0.95 }), towers, (t, i, d) => {
        d.position.set(t.x, this.height(t.x, t.z), t.z);
        d.rotation.set(t.tilt, t.yaw, 0);
        d.scale.set(t.w, t.h, t.d);
      });
      const rubbleGeo = this.reg(new THREE.IcosahedronGeometry(1, 0));
      const rubble = this.scatter(300, rnd, H + 3.6, 150, 260).map((r) => ({
        x: r.x,
        z: r.z,
        s: 0.6 + rnd() * 1.8,
        rot: rnd() * TAU,
        color: new THREE.Color().setHSL(0.08, 0.1, 0.2 + rnd() * 0.15),
      }));
      addInstanced('rubble', rubbleGeo, matBasic(0xffffff, { roughness: 1 }), rubble, (r, i, d) => {
        d.position.set(r.x, this.height(r.x, r.z) + r.s * 0.2, r.z);
        d.rotation.set(r.rot, r.rot * 0.7, 0);
        d.scale.set(r.s, r.s * 0.4, r.s * 1.2);
      });
      const wreckGeo = this.reg(new THREE.BoxGeometry(4.4, 1.5, 2.1));
      wreckGeo.translate(0, 0.75, 0);
      const wrecks = this.scatter(44, rnd, H + 3.8, 45, 200).map((w) => ({
        x: w.x,
        z: w.z,
        yaw: rnd() * TAU,
        tilt: (rnd() - 0.5) * 0.25,
        color: new THREE.Color().setHSL(0.05 + rnd() * 0.06, 0.35, 0.18 + rnd() * 0.1),
      }));
      addInstanced('wrecks', wreckGeo, matBasic(0xffffff, { roughness: 0.7, metalness: 0.4 }), wrecks, (w, i, d) => {
        d.position.set(w.x, this.height(w.x, w.z), w.z);
        d.rotation.set(w.tilt * 0.4, w.yaw, w.tilt);
      });
      for (const s of this.scatter(7, rnd, H + 8, 60, 160)) {
        this.emitters.push({ kind: 'smoke', x: s.x, y: this.height(s.x, s.z) + 14, z: s.z, rate: 1.4 });
      }
    }
  }

  /** Water surface ribbon for RIVER SIDE DRIVE: follows the track and lies flat across the channel. */
  buildRiver(track) {
    const N = track.N;
    const pos = new Float32Array((N + 1) * 2 * 3);
    for (let i = 0; i <= N; i++) {
      const j = i % N;
      const y = track.poseAt(j, RIVER.lat).y - RIVER.waterDrop;
      const a = track.poseAt(j, RIVER.lat - RIVER.reach);
      const b = track.poseAt(j, RIVER.lat + RIVER.reach);
      pos.set([a.x, y, a.z, b.x, y, b.z], i * 6);
    }
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = 2 * i;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = this.reg(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat =
      this.mats.push(
        new THREE.MeshStandardMaterial({
          color: 0x1f6f8f,
          roughness: 0.15,
          metalness: 0.3,
          transparent: true,
          opacity: 0.86,
          side: THREE.DoubleSide,
        }),
      ) && this.mats[this.mats.length - 1];
    const water = new THREE.Mesh(geo, mat);
    water.name = 'river_water';
    this.group.add(water);
  }

  /** Continuous scenery emitters (stacks, flares, barrel fires). Budgeted per frame. */
  updateEmitters(dt, particles) {
    if (!this.emitters.length) return;
    this.emitTimer += dt;
    if (this.emitTimer < 1 / 30) return;
    const step = this.emitTimer;
    this.emitTimer = 0;
    for (const e of this.emitters) {
      if (Math.random() > e.rate * step) continue;
      if (e.kind === 'smoke') particles.puff(e.x, e.y, e.z, 1.5, 6, 0.5, 6, 4.5, 0.22, 0.2, 0.19, 0.42);
      else if (e.kind === 'fire') particles.fireAt(e.x, e.y, e.z);
      else if (e.kind === 'dust') particles.puff(e.x, e.y, e.z, 3, 0.8, 0.5, 4, 3, 0.8, 0.66, 0.42, 0.25);
    }
  }

  dispose() {
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geos = [];
    this.mats = [];
    this.textures = [];
    this.texCache = {};
    this.emitters = [];
    this.obstacles = [];
    if (this.weather) this.weather.setKind('none');
  }
}
