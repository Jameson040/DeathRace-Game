/* ==========================================================================
   06 · COMBAT — hitscan twin autocannon, limited-homing rockets, radial
   explosions (falloff damage + knockback impulse), damage/destruction, pickups.
   Combat logic is pure (no scene access) so diagnostics call the same functions.
   ========================================================================== */
const WEAPON = {
  mgCooldown: 0.085,
  mgRange: 150,
  mgDamage: 3.6,
  mgImpulse: 0.35,
  mgAmmoPerShot: 1,
  rocketCooldown: 0.9,
  rocketSpeed: 44,
  rocketMaxSpeed: 66,
  rocketAccel: 40,
  rocketTurn: 2.1,
  rocketLife: 4.5,
  rocketDamage: 58,
  rocketRadius: 13,
  rocketImpulse: 26,
  rocketHomeCone: 0.42,
  rocketHomeRange: 85,
  wreckTime: 2.8,
  respawnHealth: 55,
  collideDamageMin: 6,
};

/**
 * Wreck penalty. Every wreck adds `seconds` to the racer's finish time and counts as `metresPerSecond` of
 * track distance in the live standing. The rebuild is placed `backM` of track arc behind the wreck site.
 */
const WRECK_PENALTY = { seconds: 10, backM: 120, metresPerSecond: 35 };

const WeaponSystem = {
  /** Ray vs oriented box (XZ). Returns entry distance along d (≥0) or Infinity. */
  rayVehicle(ox, oz, dx, dz, v, maxT) {
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const px = ox - v.x;
    const pz = oz - v.z;
    const lx = px * ch - pz * sh;
    const lz = px * sh + pz * ch; // local (x=right, z=forward)
    const dlx = dx * ch - dz * sh;
    const dlz = dx * sh + dz * ch;
    let tmin = 0;
    let tmax = maxT;
    const slab = (o, d, lo, hi) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (!slab(lx, dlx, -v.halfWid, v.halfWid)) return Number.POSITIVE_INFINITY;
    if (!slab(lz, dlz, -v.halfLen, v.halfLen)) return Number.POSITIVE_INFINITY;
    return tmin;
  },
  /** Ray vs circle (XZ). */
  rayCircle(ox, oz, dx, dz, c, maxT) {
    const fx = ox - c.x;
    const fz = oz - c.z;
    const b = fx * dx + fz * dz;
    const cc = fx * fx + fz * fz - c.r * c.r;
    const disc = b * b - cc;
    if (disc < 0) return Number.POSITIVE_INFINITY;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= maxT ? t : Number.POSITIVE_INFINITY;
  },
  /**
   * Hitscan along (ox,oz)+t·(dx,dz), |d|=1. Returns the closest of: vehicle, obstacle, barrier wall.
   * { kind:'vehicle'|'obstacle'|'wall', dist, target? }
   */
  hitscan(ox, oz, dx, dz, range, owner, vehicles, obstacles, track) {
    let best = null;
    let bestT = range;
    for (const v of vehicles) {
      if (v === owner || v.wrecked) continue;
      const t = this.rayVehicle(ox, oz, dx, dz, v, bestT);
      if (t < bestT) {
        bestT = t;
        best = { kind: 'vehicle', dist: t, target: v };
      }
    }
    if (obstacles)
      for (const c of obstacles) {
        const t = this.rayCircle(ox, oz, dx, dz, c, bestT);
        if (t < bestT) {
          bestT = t;
          best = { kind: 'obstacle', dist: t, target: null };
        }
      }
    // Barrier occlusion: march the ray in 3-unit steps and test the track boundary.
    let hint = owner ? owner.trackIdx : -1;
    for (let t = 3; t < bestT; t += 3) {
      const q = track.query(ox + dx * t, oz + dz * t, hint);
      hint = q.idx;
      if (Math.abs(q.lat) > ROAD_HALF) {
        best = { kind: 'wall', dist: t, target: null };
        bestT = t;
        break;
      }
    }
    return best;
  },
  /** Turret slews toward desired relative yaw (independent of steering). */
  slewTurret(v, desiredRel, dt) {
    const want = clamp(wrapAngle(desiredRel), -1.9, 1.9);
    const d = clamp(want - v.turretYaw, -5.0 * dt, 5.0 * dt);
    v.turretYaw = clamp(v.turretYaw + d, -1.9, 1.9);
  },
  muzzleOrigin(v) {
    const yaw = v.heading + v.turretYaw;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    return { x: v.x + sh * (v.halfLen + 0.4), z: v.z + ch * (v.halfLen + 0.4), dx, dz, yaw };
  },
  /** Applies a physical hit: damage plus a small mass-aware impulse and a yaw jolt. */
  applyHit(target, dx, dz, dmg, impulse) {
    const destroyed = this.applyDamage(target, dmg);
    if (target.wrecked) return destroyed;
    const dv = impulse / target.mass;
    target.vx += dx * dv;
    target.vz += dz * dv;
    const side = dx * Math.cos(target.heading) - dz * Math.sin(target.heading); // + = pushed right
    target.omega = clamp(target.omega + ((-Math.sign(side || 1) * 0.6 * impulse) / target.mass) * 0.05, -2.5, 2.5);
    return destroyed;
  },
  /** Reduces hull; returns true on the call that destroys the vehicle. */
  applyDamage(v, amt) {
    if (v.wrecked || !(amt > 0)) return false;
    // Shield absorbs first; only the remainder reaches the hull.
    if (v.shieldPts > 0) {
      const absorbed = Math.min(v.shieldPts, amt);
      v.shieldPts -= absorbed;
      amt -= absorbed;
      if (amt <= 0) return false;
    }
    v.health = Math.max(0, v.health - amt);
    if (v.health <= 0) {
      v.wrecked = true;
      v.wreckTimer = WEAPON.wreckTime;
      v.throttle = false;
      v.brake = false;
      v.nitroActive = false;
      return true;
    }
    return false;
  },
  /**
   * Radial explosion. Falloff f = 1 − d/R. Damage = maxDamage·f, impulse = J·f along the centre→vehicle direction.
   * Returns [{vehicle, dv, damage, destroyed}] for every affected vehicle.
   */
  applyExplosion(cx, cz, opts, vehicles, fx) {
    const hits = [];
    const R = opts.radius;
    const owner = opts.owner || null;
    for (const v of vehicles) {
      const dx = v.x - cx;
      const dz = v.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      const f = 1 - d / R;
      let nx;
      let nz;
      if (d > 1e-4) {
        nx = dx / d;
        nz = dz / d;
      } else {
        nx = 1;
        nz = 0;
      }
      // The shooter is never pushed or spun by its own blast: firing must not change its speed.
      const self = v === owner;
      const J = self ? 0 : opts.impulse * f;
      const dmg = (self ? 0.5 : 1) * opts.damage * f;
      const dv = J / v.mass;
      v.vx += nx * dv;
      v.vz += nz * dv;
      if (!self) v.omega = clamp(v.omega + (nx * Math.cos(v.heading) - nz * Math.sin(v.heading) > 0 ? -1 : 1) * 0.9 * f, -3, 3);
      const destroyed = this.applyDamage(v, dmg);
      hits.push({ vehicle: v, dv, damage: dmg, destroyed });
      if (fx?.onHit) fx.onHit(v, dmg, f, destroyed, owner);
    }
    if (fx?.explosion) fx.explosion(cx, cz, R);
    return hits;
  },
  /** Rocket gate: unlocked, stocked, off cooldown and alive. */
  canLaunchRocket(v) {
    return !!v.loadout?.rockets && v.rockets > 0 && v.rocketCool <= 0 && !v.wrecked;
  },
  /** Fires one machine-gun round; returns the hit record (or null). Consumes ammo. */
  fireMachineGun(owner, ctx) {
    if (!owner.loadout?.gun || owner.ammo <= 0 || owner.fireCool > 0 || owner.wrecked) return null;
    owner.fireCool = WEAPON.mgCooldown;
    owner.ammo -= WEAPON.mgAmmoPerShot;
    const m = this.muzzleOrigin(owner);
    const jit = (Math.random() - 0.5) * 0.012;
    const dx = Math.sin(m.yaw + jit);
    const dz = Math.cos(m.yaw + jit);
    const hit = this.hitscan(m.x, m.z, dx, dz, WEAPON.mgRange, owner, ctx.vehicles, ctx.obstacles, ctx.track);
    const endDist = hit ? hit.dist : WEAPON.mgRange;
    if (ctx.fx) {
      ctx.fx.tracer(m.x, 1.3, m.z, m.x + dx * endDist, 1.3, m.z + dz * endDist);
      ctx.fx.muzzle(owner);
      if (hit) ctx.fx.impact(m.x + dx * hit.dist, m.z + dz * hit.dist, hit.kind);
    }
    if (hit && hit.kind === 'vehicle') {
      const destroyed = this.applyHit(hit.target, dx, dz, WEAPON.mgDamage, WEAPON.mgImpulse);
      if (owner.isPlayer) {
        owner.hitConfirm = 0.18;
        if (ctx.audio?.hitTick) ctx.audio.hitTick();
      }
      if (ctx.fx?.onHit) ctx.fx.onHit(hit.target, WEAPON.mgDamage, 0.3, destroyed, owner);
      if (destroyed) owner.kills++;
    }
    return hit;
  },
};

/** Rocket simulation (plain data) with limited, cone-restricted homing. */
class RocketSim {
  constructor(cap = 14) {
    this.cap = cap;
    this.items = [];
  }
  spawn(owner, x, z, heading) {
    if (this.items.length >= this.cap) return null;
    const r = {
      owner,
      x,
      y: (owner && owner.y != null ? owner.y : 0) + 1.25,
      z,
      heading,
      speed: WEAPON.rocketSpeed,
      life: WEAPON.rocketLife,
      age: 0,
      dead: false,
      hint: owner.trackIdx,
      puff: 0,
    };
    this.items.push(r);
    return r;
  }
  /** ctx: { vehicles, obstacles, track, fx } */
  update(dt, ctx) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const r = items[i];
      r.age += dt;
      r.life -= dt;
      let boom = r.life <= 0;
      // limited homing: nearest valid target within a forward cone
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      if (!boom)
        for (const v of ctx.vehicles) {
          if (v === r.owner || v.wrecked) continue;
          const dx = v.x - r.x;
          const dz = v.z - r.z;
          const d = Math.hypot(dx, dz);
          if (d > WEAPON.rocketHomeRange || d < 0.5) continue;
          const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - r.heading));
          if (ang > WEAPON.rocketHomeCone) continue;
          const score = d + ang * 12;
          if (score < bestScore) {
            bestScore = score;
            best = v;
          }
        }
      if (best) {
        const err = wrapAngle(Math.atan2(best.x - r.x, best.z - r.z) - r.heading);
        r.heading = wrapAngle(r.heading + clamp(err, -WEAPON.rocketTurn * dt, WEAPON.rocketTurn * dt));
      }
      r.speed = Math.min(WEAPON.rocketMaxSpeed, r.speed + WEAPON.rocketAccel * dt);
      const steps = 2;
      const sdt = dt / steps;
      for (let s = 0; s < steps && !boom; s++) {
        r.x += Math.sin(r.heading) * r.speed * sdt;
        r.z += Math.cos(r.heading) * r.speed * sdt;
        for (const v of ctx.vehicles) {
          if (v === r.owner) continue; // a rocket never collides with the car that fired it
          if (v.wrecked && v !== r.owner) continue;
          const sh = Math.sin(v.heading);
          const ch = Math.cos(v.heading);
          const px = r.x - v.x;
          const pz = r.z - v.z;
          const lx = px * ch - pz * sh;
          const lz = px * sh + pz * ch;
          if (Math.abs(lx) <= v.halfWid + 0.3 && Math.abs(lz) <= v.halfLen + 0.3) {
            boom = true;
            break;
          }
        }
        if (!boom && ctx.obstacles)
          for (const c of ctx.obstacles) {
            if (Math.hypot(r.x - c.x, r.z - c.z) < c.r + 0.2) {
              boom = true;
              break;
            }
          }
        if (!boom) {
          const q = ctx.track.query(r.x, r.z, r.hint);
          r.hint = q.idx;
          r.y = q.y + 1.2;
          if (Math.abs(q.lat) > ROAD_HALF + 0.6) boom = true;
        }
      }
      if (ctx.fx && !boom) {
        r.puff += dt;
        if (r.puff > 0.05) {
          r.puff = 0;
          ctx.fx.rocketTrail(r.x, r.z);
        }
      }
      if (boom) {
        WeaponSystem.applyExplosion(
          r.x,
          r.z,
          { radius: WEAPON.rocketRadius, damage: WEAPON.rocketDamage, impulse: WEAPON.rocketImpulse, owner: r.owner },
          ctx.vehicles,
          ctx.fx,
        );
        items[i] = items[items.length - 1];
        items.pop();
      }
    }
  }
  clear() {
    this.items.length = 0;
  }
}

/** Scene-side visuals for weapons: tracers, rocket meshes, fireballs, shock rings, flash light. */
class WeaponVisuals {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.tracerCap = 48;
    this.tracerHead = 0;
    this.tracerLife = new Float32Array(this.tracerCap);
    const tp = new Float32Array(this.tracerCap * 2 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerPos = tp;
    this.tracers = new THREE.LineSegments(
      tg,
      new THREE.LineBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.9 }),
    );
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.tracerGeo = tg;
    // Rocket meshes (pooled)
    this.rocketMeshes = [];
    const body = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8);
    body.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.14, 0.4, 8);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 0.9);
    const flame = new THREE.ConeGeometry(0.22, 0.9, 8);
    flame.rotateX(-Math.PI / 2);
    flame.translate(0, 0, -1.1);
    const rBody = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.35 });
    const rNose = new THREE.MeshStandardMaterial({ color: 0xd62c12, metalness: 0.3, roughness: 0.5 });
    const rFlame = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      g.name = 'rocket';
      g.visible = false;
      g.add(new THREE.Mesh(body, rBody), new THREE.Mesh(nose, rNose), new THREE.Mesh(flame, rFlame));
      scene.add(g);
      this.rocketMeshes.push(g);
    }
    // Explosions
    this.fire = [];
    this.rings = [];
    const fGeo = new THREE.SphereGeometry(1, 12, 10);
    const rGeo = new THREE.RingGeometry(0.85, 1.0, 40);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(
        fGeo,
        new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false }),
      );
      f.visible = false;
      scene.add(f);
      this.fire.push({ mesh: f, t: 1 });
      const r = new THREE.Mesh(
        rGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffe9a8,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      scene.add(r);
      this.rings.push({ mesh: r, t: 1 });
    }
    this.light = new THREE.PointLight(0xffa040, 0, 60, 2);
    scene.add(this.light);
    this.lightT = 0;
    this.flashT = new Map();
  }
  tracer(x0, y0, z0, x1, y1, z1) {
    const i = this.tracerHead;
    this.tracerHead = (this.tracerHead + 1) % this.tracerCap;
    const o = i * 6;
    const p = this.tracerPos;
    p[o] = x0;
    p[o + 1] = y0;
    p[o + 2] = z0;
    p[o + 3] = x1;
    p[o + 4] = y1;
    p[o + 5] = z1;
    this.tracerLife[i] = 0.07;
    this.tracerGeo.attributes.position.needsUpdate = true;
  }
  explosion(x, z, radius) {
    const f = this.fire.find((e) => e.t >= 1) || this.fire[0];
    f.t = 0;
    f.mesh.visible = true;
    f.mesh.position.set(x, 1.6, z);
    f.radius = radius;
    const r = this.rings.find((e) => e.t >= 1) || this.rings[0];
    r.t = 0;
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.3, z);
    r.radius = radius;
    this.light.position.set(x, 4, z);
    this.lightT = 0.6;
    this.particles.sparksAt(x, 1, z, 26, 1.8);
    for (let i = 0; i < 10; i++)
      this.particles.puff(
        x + (Math.random() - 0.5) * radius * 0.4,
        1 + Math.random() * 2,
        z + (Math.random() - 0.5) * radius * 0.4,
        0,
        3 + Math.random() * 3,
        0,
        4.5,
        2.6,
        0.12,
        0.11,
        0.1,
        0.6,
      );
    for (let i = 0; i < 8; i++)
      this.particles.fireAt(x + (Math.random() - 0.5) * radius * 0.5, 0.8, z + (Math.random() - 0.5) * radius * 0.5);
  }
  muzzle(v) {
    if (!v.model) return;
    for (const f of v.model.flashes) f.visible = true;
    this.flashT.set(v, 0.05);
  }
  update(dt, rockets, cam) {
    for (let i = 0; i < this.tracerCap; i++)
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) {
          const o = i * 6;
          for (let k = 0; k < 6; k++) this.tracerPos[o + k] = 0;
          this.tracerGeo.attributes.position.needsUpdate = true;
        }
      }
    for (const f of this.fire)
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / 0.5);
        const s = (f.radius || 10) * (0.25 + 0.75 * Math.sqrt(f.t));
        f.mesh.scale.setScalar(s * 0.5);
        f.mesh.material.opacity = (1 - f.t) * 0.85;
        if (f.t >= 1) f.mesh.visible = false;
      }
    for (const r of this.rings)
      if (r.t < 1) {
        r.t = Math.min(1, r.t + dt / 0.55);
        const s = (r.radius || 10) * 0.2 + (r.radius || 10) * 1.6 * r.t;
        r.mesh.scale.setScalar(s);
        r.mesh.material.opacity = (1 - r.t) * 0.75;
        if (r.t >= 1) r.mesh.visible = false;
      }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightT / 0.6) * 9;
    } else this.light.intensity = 0;
    for (const [v, t] of this.flashT) {
      const nt = t - dt;
      if (nt <= 0) {
        this.flashT.delete(v);
        if (v.model) for (const f of v.model.flashes) f.visible = false;
      } else this.flashT.set(v, nt);
    }
    // Rockets: sync pooled meshes with sim
    for (let i = 0; i < this.rocketMeshes.length; i++) {
      const m = this.rocketMeshes[i];
      const r = rockets.items[i];
      if (!r) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(r.x, r.y ?? 1.3, r.z);
      m.rotation.set(0, r.heading, 0);
    }
  }
  /** Clears all visuals (used on restart/biome change). */
  reset() {
    this.tracerPos.fill(0);
    this.tracerLife.fill(0);
    this.tracerGeo.attributes.position.needsUpdate = true;
    for (const f of this.fire) {
      f.t = 1;
      f.mesh.visible = false;
    }
    for (const r of this.rings) {
      r.t = 1;
      r.mesh.visible = false;
    }
    for (const v of this.flashT.keys()) if (v.model) for (const f of v.model.flashes) f.visible = false;
    this.lightT = 0;
    this.light.intensity = 0;
    this.flashT.clear();
    for (const m of this.rocketMeshes) m.visible = false;
  }
}

/* -------------------------------- Pickups -------------------------------- */
const PICKUP_INFO = {
  bullets: { label: '+120 MG AMMO · MACHINE GUN UNLOCKED', color: 0xffc933 },
  missiles: { label: '+4 MISSILES · ROCKETS UNLOCKED', color: 0xff7a1a },
  shield: { label: '+60 SHIELD · DEFENCE UNLOCKED', color: 0x3ab0ff },
  blades: { label: 'CROSSED SWORDS · ATTACK UNLOCKED', color: 0xe8ecf2 },
  gear: { label: '+3 SMOKE +3 OIL · NEON GEAR UNLOCKED', color: 0x39ff88 },
  repair: { label: '+35 HULL REPAIR', color: 0x5cff8a },
  nitro: { label: '+50% NITRO CANISTER', color: 0x00d2ff },
};

/* Icon geometry and materials are built once per type and shared by every pickup of that type. */
const ICON_STEEL = new THREE.MeshStandardMaterial({ color: 0xc9d1da, metalness: 0.8, roughness: 0.25 });
const ICON_CACHE = {};

function buildIconParts(type) {
  const col = PICKUP_INFO[type].color;
  const glow = new THREE.MeshStandardMaterial({
    color: col,
    emissive: col,
    emissiveIntensity: type === 'gear' ? 1.6 : 0.9,
    metalness: 0.3,
    roughness: 0.3,
  });
  const parts = [];
  const P = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => parts.push({ geo, mat, pos, rot });
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  switch (type) {
    case 'bullets':
      for (const x of [-0.32, 0.32]) {
        P(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 12), glow, [x, -0.2, 0]);
        P(new THREE.ConeGeometry(0.2, 0.5, 12), ICON_STEEL, [x, 0.55, 0]);
      }
      break;
    case 'missiles':
      P(new THREE.CylinderGeometry(0.22, 0.22, 1.7, 12), glow, [0, -0.1, 0]);
      P(new THREE.ConeGeometry(0.22, 0.55, 12), ICON_STEEL, [0, 1.0, 0]);
      P(box(0.22, 0.4, 0.04), glow, [0.34, -0.7, 0]);
      P(box(0.22, 0.4, 0.04), glow, [-0.34, -0.7, 0]);
      P(box(0.04, 0.4, 0.22), glow, [0, -0.7, 0.34]);
      P(box(0.04, 0.4, 0.22), glow, [0, -0.7, -0.34]);
      break;
    case 'shield': {
      const s = new THREE.Shape();
      s.moveTo(-0.8, 0.9);
      s.lineTo(0.8, 0.9);
      s.lineTo(0.8, 0.1);
      s.quadraticCurveTo(0.8, -0.6, 0, -1.0);
      s.quadraticCurveTo(-0.8, -0.6, -0.8, 0.1);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.25,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 2,
      });
      geo.translate(0, 0, -0.12);
      P(geo, glow);
      P(new THREE.SphereGeometry(0.22, 12, 8), ICON_STEEL, [0, 0.3, 0.26]);
      break;
    }
    case 'blades':
      for (const sgn of [1, -1]) {
        P(box(0.14, 2.3, 0.05), ICON_STEEL, [0, 0, 0], [0, 0, sgn * 0.7]);
        P(box(0.8, 0.12, 0.12), glow, [0, -0.6, 0], [0, 0, sgn * 0.7]);
        P(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), glow, [sgn * 0.55, -1.0, 0], [0, 0, sgn * 0.7]);
      }
      break;
    case 'gear': {
      // Neon gear: ten teeth around a hollow centre, extruded.
      const s = new THREE.Shape();
      const steps = 40;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const r = k % 4 < 2 ? 1.0 : 0.78;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (k === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.36, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.22,
        bevelEnabled: true,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        bevelSegments: 1,
      });
      geo.translate(0, 0, -0.11);
      P(geo, glow);
      break;
    }
    case 'repair':
      P(box(1.0, 0.32, 0.22), glow);
      P(box(0.32, 1.0, 0.22), glow);
      break;
    case 'nitro':
      // 3D Nitrous oxide bottle: pressurized cylinder, dome cap, steel valve neck & release knob
      P(new THREE.CylinderGeometry(0.36, 0.36, 1.25, 16), glow, [0, -0.05, 0]);
      P(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow, [0, 0.575, 0]);
      P(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12), ICON_STEEL, [0, 0.85, 0]);
      P(new THREE.TorusGeometry(0.15, 0.04, 6, 12), ICON_STEEL, [0, 1.0, 0], [Math.PI / 2, 0, 0]);
      break;
    default:
      throw new Error(`unknown pickup type ${type}`);
  }
  // Floor ring under the icon (horizontal)
  P(new THREE.TorusGeometry(1.6, 0.08, 6, 24), glow, [0, -1.25, 0], [Math.PI / 2, 0, 0]);
  return parts;
}

class PickupSystem {
  constructor(track, scene) {
    this.items = [];
    this.scene = scene;
    this.respawnTime = 14;
    this.events = [];
    for (const s of track.pickupSpots) {
      const p = track.poseAt(s.idx, s.lat);
      const it = { type: s.type, x: p.x, y: p.y, z: p.z, active: true, timer: 0, mesh: null, id: this.items.length };
      if (scene) {
        const g = PickupSystem.buildIcon(s.type);
        g.name = `pickup_${s.type}`;
        g.position.set(p.x, p.y + 1.4, p.z);
        scene.add(g);
        it.mesh = g;
      }
      this.items.push(it);
    }
  }
  /** Fresh group of meshes for one pickup type; geometry and materials are shared (cached per type). */
  static buildIcon(type) {
    if (!ICON_CACHE[type]) ICON_CACHE[type] = buildIconParts(type);
    const g = new THREE.Group();
    for (const p of ICON_CACHE[type]) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.position.set(p.pos[0], p.pos[1], p.pos[2]);
      m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      g.add(m);
    }
    return g;
  }
  /** Collision test: vehicle body (padded OBB) contains the pickup centre. */
  static touches(v, x, z) {
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const px = x - v.x;
    const pz = z - v.z;
    const lx = px * ch - pz * sh;
    const lz = px * sh + pz * ch;
    return Math.abs(lx) <= v.halfWid + 1.0 && Math.abs(lz) <= v.halfLen + 1.0;
  }
  /** Applies a pickup. Weapon and accessory pickups also unlock the matching system. */
  static apply(v, type) {
    switch (type) {
      case 'bullets':
        v.loadout.gun = true;
        v.ammo = Math.min(v.ammoMax, v.ammo + 120);
        break;
      case 'missiles':
        v.loadout.rockets = true;
        v.rockets = Math.min(v.rocketMax, v.rockets + 4);
        break;
      case 'shield':
        v.loadout.shield = true;
        v.shieldPts = Math.min(v.shieldMax, v.shieldPts + 60);
        break;
      case 'blades':
        v.loadout.blades = true;
        break;
      case 'gear':
        v.loadout.gear = true;
        v.smokeCharges = Math.min(6, v.smokeCharges + 3);
        v.oilCharges = Math.min(6, v.oilCharges + 3);
        break;
      case 'repair':
        v.health = Math.min(v.maxHealth, v.health + 35);
        break;
      case 'nitro':
        v.nitro = Math.min(1, v.nitro + 0.5);
        break;
      default:
        throw new Error(`unknown pickup type ${type}`);
    }
  }
  /** Collect + respawn. Returns events [{type, vehicle}] (array reused per call). */
  update(dt, vehicles) {
    this.events.length = 0;
    for (const it of this.items) {
      if (!it.active) {
        it.timer -= dt;
        if (it.timer <= 0) {
          it.active = true;
          if (it.mesh) it.mesh.visible = true;
        }
        continue;
      }
      for (const v of vehicles) {
        if (v.wrecked) continue;
        if (PickupSystem.touches(v, it.x, it.z)) {
          PickupSystem.apply(v, it.type);
          it.active = false;
          it.timer = this.respawnTime;
          if (it.mesh) it.mesh.visible = false;
          this.events.push({ type: it.type, vehicle: v });
          break;
        }
      }
    }
    return this.events;
  }
  animate(t) {
    for (const it of this.items)
      if (it.mesh && it.active) {
        it.mesh.rotation.y = t * 1.8;
        it.mesh.position.y = it.y + 1.4 + Math.sin(t * 2.4 + it.id) * 0.25;
      }
  }
  /** Removes this race's icons. Shared icon geometry stays cached for the session. */
  dispose() {
    for (const it of this.items) if (it.mesh) it.mesh.removeFromParent();
    this.items = [];
  }
}

/* ------------------------ Road Traps & Road Hazards ------------------------- */
class RoadTrapSystem {
  constructor(track, scene) {
    this.track = track;
    this.scene = scene;
    this.traps = [];
    this.group = new THREE.Group();
    this.group.name = 'road_traps_group';
    if (scene) scene.add(this.group);
    this.initTraps();
  }

  initTraps() {
    const tr = this.track;
    if (!tr || !tr.N) return;
    const N = tr.N;

    const trapFractions = [
      { f: 0.06, type: 'mine', lat: -4.5 },
      { f: 0.12, type: 'spikes', lat: 4.5 },
      { f: 0.18, type: 'fire', lat: 0.0 },
      { f: 0.24, type: 'mine', lat: 4.2 },
      { f: 0.29, type: 'spikes', lat: -4.5 },
      { f: 0.35, type: 'slick', lat: 3.8 },
      { f: 0.40, type: 'mine', lat: 0.0 },
      { f: 0.46, type: 'fire', lat: -4.2 },
      { f: 0.52, type: 'spikes', lat: 4.5 },
      { f: 0.58, type: 'mine', lat: -4.5 },
      { f: 0.63, type: 'slick', lat: -3.8 },
      { f: 0.69, type: 'fire', lat: 4.2 },
      { f: 0.74, type: 'spikes', lat: 0.0 },
      { f: 0.80, type: 'mine', lat: 4.5 },
      { f: 0.86, type: 'fire', lat: -4.2 },
      { f: 0.92, type: 'spikes', lat: -4.5 },
      { f: 0.96, type: 'mine', lat: 3.8 },
    ];

    for (let i = 0; i < trapFractions.length; i++) {
      const def = trapFractions[i];
      const idx = Math.round(def.f * N) % N;
      const pose = tr.poseAt(idx, def.lat);
      const trap = {
        id: i,
        type: def.type,
        idx,
        lat: def.lat,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        hd: pose.hd,
        active: true,
        cooldown: 0,
        radius: def.type === 'spikes' ? 3.4 : def.type === 'slick' ? 3.2 : 2.4,
        mesh: null,
        lightMesh: null,
      };

      if (this.scene) {
        trap.mesh = this.buildTrapMesh(trap);
        this.group.add(trap.mesh);
      }
      this.traps.push(trap);
    }
  }

  buildTrapMesh(trap) {
    const g = new THREE.Group();
    g.name = `trap_${trap.type}_${trap.id}`;
    g.position.set(trap.x, trap.y + 0.05, trap.z);
    g.rotation.y = trap.hd;

    if (trap.type === 'mine') {
      const baseGeo = new THREE.CylinderGeometry(1.3, 1.5, 0.2, 8);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x252528, metalness: 0.85, roughness: 0.35 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      const domeGeo = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff2200, emissiveIntensity: 1.2, roughness: 0.2 });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.1;
      g.add(dome);
      trap.lightMesh = dome;

      const toothGeo = new THREE.ConeGeometry(0.16, 0.45, 4);
      const toothMat = new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.7, roughness: 0.3 });
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2 + Math.PI / 4;
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(Math.cos(ang) * 1.25, 0.18, Math.sin(ang) * 1.25);
        tooth.rotation.z = -Math.cos(ang) * 0.3;
        tooth.rotation.x = Math.sin(ang) * 0.3;
        g.add(tooth);
      }
    } else if (trap.type === 'spikes') {
      const barGeo = new THREE.BoxGeometry(4.2, 0.2, 0.9);
      const barMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.9, roughness: 0.25 });
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.castShadow = true;
      bar.receiveShadow = true;
      g.add(bar);

      const spikeGeo = new THREE.ConeGeometry(0.15, 0.5, 4);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd9e0ea, metalness: 0.95, roughness: 0.15 });
      for (let x = -1.8; x <= 1.8; x += 0.6) {
        const sp = new THREE.Mesh(spikeGeo, spikeMat);
        sp.position.set(x, 0.3, 0);
        g.add(sp);
      }

      const beaconGeo = new THREE.SphereGeometry(0.18, 8, 6);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      for (const bx of [-2.0, 2.0]) {
        const b = new THREE.Mesh(beaconGeo, beaconMat);
        b.position.set(bx, 0.2, 0);
        g.add(b);
      }
      trap.lightMesh = bar;
    } else if (trap.type === 'fire') {
      const grateGeo = new THREE.BoxGeometry(3.6, 0.12, 2.2);
      const grateMat = new THREE.MeshStandardMaterial({ color: 0x202022, metalness: 0.7, roughness: 0.4 });
      const grate = new THREE.Mesh(grateGeo, grateMat);
      grate.receiveShadow = true;
      g.add(grate);

      const coilGeo = new THREE.PlaneGeometry(3.0, 1.8);
      const coilMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.rotation.x = -Math.PI / 2;
      coil.position.y = 0.08;
      g.add(coil);
      trap.lightMesh = coil;
    } else if (trap.type === 'slick') {
      const slickGeo = new THREE.CircleGeometry(2.4, 14);
      const slickMat = new THREE.MeshStandardMaterial({ color: 0x180928, roughness: 0.1, metalness: 0.85, depthWrite: false });
      const slick = new THREE.Mesh(slickGeo, slickMat);
      slick.rotation.x = -Math.PI / 2;
      slick.position.y = 0.02;
      g.add(slick);
    }

    return g;
  }

  animate(clock) {
    for (const trap of this.traps) {
      if (!trap.active || !trap.mesh) continue;
      if (trap.type === 'mine' && trap.lightMesh) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * 9 + trap.id);
        trap.lightMesh.material.emissiveIntensity = 0.6 + pulse * 1.8;
      } else if (trap.type === 'fire' && trap.lightMesh) {
        const flicker = 0.6 + 0.4 * Math.sin(clock * 16 + trap.id * 3);
        trap.lightMesh.material.color.setRGB(1.0, 0.2 + 0.2 * flicker, 0);
      }
    }
  }

  update(dt, racers, particles, audio, hud, game) {
    for (const trap of this.traps) {
      if (!trap.active) {
        trap.cooldown -= dt;
        if (trap.cooldown <= 0) {
          trap.active = true;
          if (trap.mesh) trap.mesh.visible = true;
        }
        continue;
      }

      for (const v of racers) {
        if (v.wrecked) continue;
        const dx = v.x - trap.x;
        const dz = v.z - trap.z;
        if (Math.hypot(dx, dz) <= trap.radius) {
          this.trigger(trap, v, particles, audio, hud, game);
          break;
        }
      }
    }
  }

  trigger(trap, v, particles, audio, hud, game) {
    if (trap.type === 'mine') {
      trap.active = false;
      trap.cooldown = 14;
      if (trap.mesh) trap.mesh.visible = false;

      particles.fireAt(trap.x, trap.y + 0.8, trap.z);
      particles.sparksAt(trap.x, trap.y + 0.8, trap.z, 28, 1.8);
      audio.explosion(trap.x, trap.z, 10, v.isPlayer);

      game.damage(v, 42);
      v.vy += 4.5;
      v.u *= 0.65;
      v.omega += (Math.random() - 0.5) * 3.5;

      if (v.isPlayer) {
        hud.message('EXPLOSIVE MINE DETONATED!', 2.2);
        game.shake = Math.max(game.shake, 0.75);
      }
    } else if (trap.type === 'spikes') {
      trap.active = false;
      trap.cooldown = 10;

      particles.sparksAt(v.x, v.y + 0.4, v.z, 24, 1.3);
      audio.scrape(v.x, v.z, 1.2);

      game.damage(v, 22);
      v.u *= 0.52;
      v.traction = Math.min(v.traction, 0.35);

      if (v.isPlayer) {
        hud.message('SPIKE STRIP — TIRES SHREDDED!', 2.2);
        game.shake = Math.max(game.shake, 0.5);
      }
    } else if (trap.type === 'fire') {
      trap.active = false;
      trap.cooldown = 8;

      particles.fireAt(v.x, v.y + 0.6, v.z);
      particles.puff(v.x, v.y + 1.2, v.z, 0, 2.8, 0, 2.2, 1.6, 0.1, 0.1, 0.1, 0.6);
      audio.smoke(v.x, v.z);

      game.damage(v, 30);
      v.nitro = Math.max(0, v.nitro - 0.4);
      v.nitroCooldown = Math.max(v.nitroCooldown, 4.0);

      if (v.isPlayer) {
        hud.message('NAPALM VENT — ARMOR SCORCHED!', 2.0);
        game.shake = Math.max(game.shake, 0.4);
      }
    } else if (trap.type === 'slick') {
      audio.oil(v.x, v.z);
      v.traction = 0.15;
      v.omega += (v.trackLat > 0 ? -1 : 1) * 2.4;

      if (v.isPlayer) {
        hud.message('CHEMICAL SLICK — LOST TRACTION!', 1.8);
      }
    }
  }

  dispose() {
    if (this.group) this.group.removeFromParent();
    this.traps = [];
  }
}

/* ---------------------------- Smoke (blinding) ------------------------------ */
const SMOKE = { life: 9, r0: 3.2, r1: 8.5, drag: 1.4 };
/**
 * Pooled smoke clouds. Each cloud is a column that drifts, widens and thins with age. densityAt() returns the
 * visibility loss at a ground point (0 clear, 1 blind). The game uses it for the player's screen and the AI's steering.
 */
class SmokeField {
  constructor(n = 16) {
    this.n = n;
    this.on = new Uint8Array(n);
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vz = new Float64Array(n);
    this.age = new Float64Array(n);
  }
  reset() {
    this.on.fill(0);
  }
  spawn(x, z, vx, vz) {
    let k = -1;
    let oldest = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) {
        k = i;
        break;
      }
      if (this.age[i] > this.age[oldest]) oldest = i;
    }
    if (k < 0) k = oldest; // pool full: recycle the oldest cloud
    this.on[k] = 1;
    this.x[k] = x;
    this.z[k] = z;
    this.vx[k] = vx;
    this.vz[k] = vz;
    this.age[k] = 0;
    return k;
  }
  update(dt) {
    const damp = Math.exp(-SMOKE.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) continue;
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      this.vx[i] *= damp;
      this.vz[i] *= damp;
      this.age[i] += dt;
      if (this.age[i] >= SMOKE.life) this.on[i] = 0;
    }
  }
  densityAt(px, pz) {
    let s = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) continue;
      const f = this.age[i] / SMOKE.life;
      const r = SMOKE.r0 + (SMOKE.r1 - SMOKE.r0) * f;
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const q = (dx * dx + dz * dz) / (r * r);
      if (q < 1) s += (1 - q) * (1 - f * f);
    }
    return Math.min(1, s);
  }
  /** Calls fn(x, z, ageFraction) for each live cloud (used for visual puffs). */
  forEach(fn) {
    for (let i = 0; i < this.n; i++) if (this.on[i]) fn(this.x[i], this.z[i], this.age[i] / SMOKE.life);
  }
}

/* ------------------------------ Oil slicks --------------------------------- */
const OIL = { life: 22, r: 3.4, recover: 2.5, minTraction: 0.12 };
/**
 * Pooled oil slicks on the road. A car over a slick loses traction (v.traction falls to OIL.minTraction) and
 * recovers over OIL.recover seconds after leaving it. The slick is drawn as a dark, iridescent road decal.
 */
class OilField {
  constructor(n = 40) {
    this.n = n;
    this.on = new Uint8Array(n);
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.y = new Float64Array(n);
    this.age = new Float64Array(n);
    this.meshes = [];
    this.geo = null;
    this.mat = null;
    this.scene = null;
  }
  attachScene(scene) {
    this.scene = scene;
    this.geo = new THREE.CircleGeometry(OIL.r, 28);
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0x07070d,
      roughness: 0.06,
      metalness: 0.25,
      iridescence: 1,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [200, 600],
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 0; i < this.n; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.rotation.x = -Math.PI / 2;
      m.name = 'oil_slick';
      m.visible = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }
  reset() {
    this.on.fill(0);
    this.syncVisuals();
  }
  spawn(x, z, y) {
    let k = -1;
    let oldest = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) {
        k = i;
        break;
      }
      if (this.age[i] > this.age[oldest]) oldest = i;
    }
    if (k < 0) k = oldest;
    this.on[k] = 1;
    this.x[k] = x;
    this.z[k] = z;
    this.y[k] = y;
    this.age[k] = 0;
    return k;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= OIL.life) this.on[i] = 0;
    }
  }
  touching(x, z, pad = 0) {
    for (let i = 0; i < this.n; i++) {
      if (!this.on[i]) continue;
      const dx = x - this.x[i];
      const dz = z - this.z[i];
      const r = OIL.r + pad;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  /** Sets v.traction for this step: full loss while over a slick, then a linear recovery. */
  applyTo(v, dt) {
    if (this.touching(v.x, v.z, 0.8)) v.slickLoss = 1;
    else v.slickLoss = Math.max(0, (v.slickLoss || 0) - dt / OIL.recover);
    v.traction = 1 - (1 - OIL.minTraction) * v.slickLoss;
  }
  syncVisuals() {
    for (let i = 0; i < this.n; i++) {
      const m = this.meshes[i];
      if (!m) continue;
      m.visible = !!this.on[i];
      if (this.on[i]) m.position.set(this.x[i], this.y[i] + 0.06, this.z[i]);
    }
  }
  dispose() {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes = [];
    if (this.geo) this.geo.dispose();
    if (this.mat) this.mat.dispose();
    this.geo = null;
    this.mat = null;
  }
}
