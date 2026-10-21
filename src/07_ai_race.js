/* ==========================================================================
   07 · AI DRIVER + RACE MANAGER
   AIDriver: pure-pursuit on a predicted position, lane offsets, corner-speed
   planning from track curvature, traffic-aware passing, turret tracking, fire
   control, and anti-stuck recovery (reverse + opposite steer, then teleport).
   RaceManager: direction-aware gate crossings, lap counting, ranking, finish.
   NOTE: every track.query() result is a shared record — values are copied
   immediately after each query.
   ========================================================================== */
class AIDriver {
  constructor(v, track, seed, difficulty = 1) {
    this.v = v;
    this.track = track;
    this.rnd = mulberry32(seed);
    this.difficulty = difficulty;
    this.laneBase = (this.rnd() - 0.5) * ROAD_HALF * 1.2;
    this.laneTimer = 3 + this.rnd() * 3;
    this.input = { throttle: false, brake: false, steer: 0, nitro: false, fire: false, secondary: false };
    this.stuckT = 0;
    this.recoverT = 0;
    this.recoverSteer = 0;
    this.cooldown = 0;
    this.attempts = 0;
    this.attemptWindow = 0;
    this.recoveries = 0;
    this.teleports = 0;
    this.state = 'RACE';
    this.lastTarget = null;
    this.debugBlock = null;
  }

  update(dt, ctx) {
    const v = this.v;
    const t = this.track;
    const inp = this.input;
    const P = v.params;
    const N = t.N;
    const L = t.length;
    inp.throttle = false;
    inp.brake = false;
    inp.steer = 0;
    inp.nitro = false;
    inp.fire = false;
    inp.secondary = false;
    inp.smoke = false;
    inp.oil = false;
    if (v.wrecked || v.race.finished || !ctx.racing) {
      this.stuckT = 0;
      this.recoverT = 0;
      this.state = 'RACE';
      return inp;
    }

    const q = t.query(v.x, v.z, v.trackIdx);
    const myS = q.s;
    const myIdx = q.idx;
    const myLat = q.lat;
    v.trackIdx = myIdx;

    // ---- Lane variety and traffic passing ----
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 3 + this.rnd() * 4;
      this.laneBase = (this.rnd() - 0.5) * ROAD_HALF * 1.3;
    }
    let lane = this.laneBase;
    let blockDist = Number.POSITIVE_INFINITY;
    let blockLat = 0;
    let blockU = 0;
    let blocked = false;
    for (const o of ctx.vehicles) {
      if (o === v || o.wrecked) continue;
      const oq = t.query(o.x, o.z, o.trackIdx);
      const oS = oq.s;
      const oLat = oq.lat;
      const ds = wrapDelta(oS - myS, L);
      if (ds > 0 && ds < 22 && Math.abs(oLat - myLat) < 3.4 && ds < blockDist) {
        blockDist = ds;
        blockLat = oLat;
        blockU = o.u;
        blocked = true;
      }
    }
    if (blocked) {
      const side = blockLat > myLat ? -1 : 1; // pass on the side away from the blocker
      lane = clamp(blockLat + side * 4.6, -(ROAD_HALF - 3), ROAD_HALF - 3);
    }
    this.debugBlock = blocked ? blockDist : null;

    // Avoid active road traps in lane
    if (ctx.traps && ctx.traps.length) {
      for (const tr of ctx.traps) {
        if (!tr.active) continue;
        const ds = wrapDelta(tr.idx * t.ds - myS, L);
        if (ds > 4 && ds < 32 && Math.abs(tr.lat - lane) < 3.2) {
          const dodgeSide = tr.lat >= 0 ? -1 : 1;
          lane = clamp(dodgeSide * (ROAD_HALF * 0.45), -(ROAD_HALF - 3), ROAD_HALF - 3);
          break;
        }
      }
    }

    // ---- Predicted-waypoint pure pursuit ----
    const speed = Math.hypot(v.vx, v.vz);
    const pq = t.query(v.x + v.vx * 0.35, v.z + v.vz * 0.35, myIdx);
    const pIdx = pq.idx;
    const look = clamp(9 + Math.abs(v.u) * 0.55, 10, 40);
    const tIdx = (pIdx + Math.round(look / t.ds)) % N;
    const tp = t.poseAt(tIdx, lane);
    this.lastTarget = tp;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const dx = tp.x - v.x;
    const dz = tp.z - v.z;
    const fwd = dx * sh + dz * ch;
    const lft = dx * ch - dz * sh; // lft: offset toward the car's LEFT (positive steer = left)
    const curv = (2 * lft) / Math.max(fwd * fwd + lft * lft, 1e-3);
    const steer = clamp(Math.atan(curv * P.wheelbase) / P.maxSteer, -1, 1);
    inp.steer = steer;

    // ---- Corner planning: maximum curvature over the next ~60 units ----
    let kmax = 0;
    const span = Math.round(60 / t.ds);
    for (let k = 0; k < span; k += 3) kmax = Math.max(kmax, Math.abs(t.kappa[(myIdx + k) % N]));
    const latAcc = 36 + 6 * this.difficulty;
    let vDes = Math.min(P.maxSpeed * 0.96 * (0.94 + 0.06 * this.difficulty), Math.sqrt(latAcc / Math.max(kmax, 1e-4)));
    if (blocked && blockDist < 16) vDes = Math.min(vDes, Math.max(8, blockU * 0.95));
    if (blocked && blockDist < 6) vDes = Math.min(vDes, 4);

    if (v.u < vDes - 1.0) inp.throttle = true;
    else if (v.u > vDes + 4 && v.u > 6) inp.brake = true;
    if (kmax < 0.003 && v.nitro > 0.8 && !v.nitroActive && v.nitroCooldown <= 0 && this.rnd() < dt * 0.4)
      inp.nitro = true;

    // ---- Anti-stuck: speed < 2 u/s for > 1.2 s while it should be moving ----
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      this.state = 'RECOVER';
      inp.throttle = false;
      inp.brake = true;
      inp.nitro = false;
      inp.steer = this.recoverSteer;
      if (this.recoverT <= 0) {
        this.cooldown = 2.5;
        this.stuckT = 0;
        this.state = 'RACE';
      }
      return inp;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.attemptWindow = Math.max(0, this.attemptWindow - dt);
    if (this.attemptWindow <= 0) this.attempts = 0;
    const wantMove = vDes > 5 && !(blocked && blockDist < 9);
    if (wantMove && speed < 2) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 1.2 && this.cooldown <= 0) {
      this.attempts++;
      this.attemptWindow = 12;
      this.recoveries++;
      v.stuck.recoveries++;
      if (this.attempts >= 3) {
        v.stuck.teleportRequest = true;
        this.attempts = 0;
        this.teleports++;
      }
      this.recoverSteer = steer > 0.05 ? -1 : steer < -0.05 ? 1 : this.rnd() < 0.5 ? -1 : 1;
      this.recoverT = 1.5;
      this.stuckT = 0;
      this.state = 'RECOVER';
      inp.throttle = false;
      inp.brake = true;
      inp.steer = this.recoverSteer;
      return inp;
    }

    // ---- Weapons: turret tracks nearest enemy, fire only when aligned ----
    let target = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const o of ctx.vehicles) {
      if (o === v || o.wrecked) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < 85 && d < bestD) {
        bestD = d;
        target = o;
      }
    }
    if (target) {
      const rel = wrapAngle(Math.atan2(target.x - v.x, target.z - v.z) - v.heading);
      WeaponSystem.slewTurret(v, rel, dt);
      const err = Math.abs(rel - v.turretYaw);
      if (err < 0.07 && bestD < 75 && v.loadout.gun && v.ammo > 0) inp.fire = true;
      if (
        err < 0.1 &&
        bestD > 22 &&
        bestD < 70 &&
        WeaponSystem.canLaunchRocket(v) &&
        this.rnd() < dt * 0.6 * this.difficulty
      )
        inp.secondary = true;
    } else {
      WeaponSystem.slewTurret(v, 0, dt);
    }
    // Smoke: a blinded driver cannot hold its line, so steering wanders in proportion to the visibility loss.
    const blind = ctx.blindAt ? ctx.blindAt(v.x, v.z) : 0;
    if (blind > 0.05) inp.steer = clamp(inp.steer + (Math.random() - 0.5) * 1.6 * blind, -1, 1);

    // ---- AI Tactical Countermeasures (Smoke & Oil when tailgated) ----
    if (v.loadout?.gear && (v.smokeCharges > 0 || v.oilCharges > 0)) {
      for (const chaser of ctx.vehicles) {
        if (chaser === v || chaser.wrecked) continue;
        const cq = t.query(chaser.x, chaser.z, chaser.trackIdx);
        const behindDist = wrapDelta(myS - cq.s, L);
        if (behindDist > 3 && behindDist < 20 && Math.abs(cq.lat - myLat) < 3.8) {
          if (v.oilCharges > 0 && this.rnd() < dt * 1.4) inp.oil = true;
          else if (v.smokeCharges > 0 && this.rnd() < dt * 1.2) inp.smoke = true;
          break;
        }
      }
    }
    return inp;
  }
}

class RaceManager {
  constructor(track, racers) {
    this.track = track;
    this.racers = racers;
    this.time = 0;
    this.countdown = 3.6;
    this.phase = 'COUNTDOWN';
    this.finishCount = 0;
    this.finishGrace = 0;
    this.goFlash = 0;
    this.lastRank = 0;
  }
  /**
   * Direction-aware gate validation. Only the NEXT expected gate can count, and only on a
   * forward signed-plane crossing inside the road disc. Returns the counted gate index or -1.
   */
  crossGates(r, pX, pZ, cX, cZ) {
    const R = r.race;
    const track = this.track;
    const g = track.gates[R.nextGate];
    const sideP = (pX - g.x) * g.tx + (pZ - g.z) * g.tz;
    const sideC = (cX - g.x) * g.tx + (cZ - g.z) * g.tz;
    let crossed = false;
    if (R.prevGate === R.nextGate && R.prevSide < 0 && sideC >= 0) {
      const t = -sideP / (sideC - sideP);
      const ix = pX + (cX - pX) * t;
      const iz = pZ + (cZ - pZ) * t;
      const lat = (ix - g.x) * g.rx + (iz - g.z) * g.rz;
      const along = (cX - pX) * g.tx + (cZ - pZ) * g.tz;
      if (along > 0 && Math.abs(lat) <= ROAD_HALF + 3 && Math.hypot(ix - g.x, iz - g.z) <= ROAD_HALF + 6)
        crossed = true;
    }
    R.prevGate = R.nextGate;
    R.prevSide = sideC;
    if (!crossed) return -1;
    const k = R.nextGate;
    if (k === 0) {
      R.lap++;
      R.nextGate = 1;
      R.lastLapTime = this.time;
      if (R.lap >= LAPS_TO_FINISH && !R.finished) {
        R.finished = true;
        R.finishTime = this.time;
        this.finishCount++;
        R.finishPos = this.finishCount;
      }
    } else {
      R.nextGate = (k + 1) % GATE_COUNT;
    }
    R.gatesThisLap = R.nextGate === 0 ? GATE_COUNT : R.nextGate - 1;
    return k;
  }

  /** Accumulates signed arc progress (cheat-resistant: reversing reduces progress) and wrong-way state. */
  updateProgress(v) {
    const q = this.track.query(v.x, v.z, v.trackIdx);
    v.trackIdx = q.idx;
    const d = wrapDelta(q.s - v.race.lastS, this.track.length);
    if (Math.abs(d) < 25) v.race.raceDist += d;
    v.race.lastS = q.s;
    const fwdDot = Math.sin(v.heading) * q.tx + Math.cos(v.heading) * q.tz;
    v.race.wrongWay = fwdDot < -0.25 && Math.abs(v.u) > 3;
  }

  /** Per-physics-step bookkeeping for one vehicle. */
  processVehicle(v, prevX, prevZ) {
    if (v.race.finished) return -1;
    const k = this.crossGates(v, prevX, prevZ, v.x, v.z);
    this.updateProgress(v);
    return k;
  }

  /**
   * Safe placement after recovery/teleport. Searches BACKWARD along the track only, so a
   * respawn can never jump forward over an unvisited checkpoint. Faces the track tangent.
   */
  static safeRespawn(v, track, vehicles, opts = {}) {
    const q = track.query(v.x, v.z, v.trackIdx);
    const base = q.idx;
    const offsets = opts.forwardOk
      ? [0, -3, -6, -9, -12, 3, -15, -20, -30]
      : [0, -3, -6, -9, -12, -15, -20, -25, -30, -40, -55];
    let pick = base;
    for (const off of offsets) {
      const idx = (((base + off) % track.N) + track.N) % track.N;
      const p = track.poseAt(idx, 0);
      let clear = true;
      for (const o of vehicles) {
        if (o === v || o.wrecked) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 7) {
          clear = false;
          break;
        }
      }
      if (clear) {
        pick = idx;
        break;
      }
    }
    const p = track.poseAt(pick, 0);
    v.x = p.x;
    v.z = p.z;
    v.y = p.y;
    v.heading = p.hd;
    v.vx = 0;
    v.vz = 0;
    v.omega = 0;
    v.steerCmd = 0;
    v.steerAngle = 0;
    v.u = 0;
    v.trackIdx = pick;
    v.race.lastS = pick * track.ds;
    v.race.prevGate = -1;
    v.lastGood = null;
    v.gear = 'NEUTRAL';
    return pick;
  }

  /**
   * Player reset (R): places the car `dist` units of track arc BEHIND where it is, centred on the
   * road and facing the tangent, with zero speed. Clearance is found by stepping further BACK only,
   * so a reset can never skip a checkpoint. Returns the sample index used.
   */
  static recoverBehind(v, track, vehicles, dist = 50, fromIdx = null) {
    const base = fromIdx !== null ? fromIdx : track.query(v.x, v.z, v.trackIdx).idx;
    const N = track.N;
    const back = Math.round(dist / track.ds);
    let pick = (((base - back) % N) + N) % N;
    for (let extra = 0; extra <= 40; extra += 2) {
      const idx = (((base - back - extra) % N) + N) % N;
      const p = track.poseAt(idx, 0);
      let clear = true;
      for (const o of vehicles) {
        if (o === v || o.wrecked) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 7) {
          clear = false;
          break;
        }
      }
      if (clear) {
        pick = idx;
        break;
      }
    }
    const p = track.poseAt(pick, 0);
    v.x = p.x;
    v.z = p.z;
    v.heading = p.hd;
    v.vx = 0;
    v.vz = 0;
    v.omega = 0;
    v.u = 0;
    v.steerCmd = 0;
    v.steerAngle = 0;
    v.trackIdx = pick;
    v.gear = 'NEUTRAL';
    v.race.lastS = pick * track.ds;
    v.race.prevGate = -1;
    VehiclePhysics.resetSurface(v, track);
    return pick;
  }

  /** Lower-level: heading/position tests need the track only. */
  step(dt, racers) {
    if (this.phase === 'COUNTDOWN') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'RACING';
        this.goFlash = 0.9;
      }
    } else if (this.phase === 'RACING') {
      this.time += dt;
      this.goFlash = Math.max(0, this.goFlash - dt);
      const player = racers.find((r) => r.isPlayer);
      if (player?.race.finished) {
        this.phase = 'FINISHING';
        this.finishGrace = 12;
      }
      if (racers.every((r) => r.race.finished)) this.phase = 'OVER';
    } else if (this.phase === 'FINISHING') {
      this.time += dt;
      this.finishGrace -= dt;
      if (racers.every((r) => r.race.finished) || this.finishGrace <= 0) this.phase = 'OVER';
    }
    this.rank(racers);
  }

  /**
   * Wreck penalty: adds WRECK_PENALTY.seconds to a racer still in the race. Finished racers are not
   * penalised. Returns true when a penalty was applied.
   */
  static applyWreckPenalty(v) {
    if (v.race.finished) return false;
    v.race.penaltyS += WRECK_PENALTY.seconds;
    v.race.wrecks++;
    return true;
  }

  /**
   * Standings. Finished racers are ordered by penalised finish time (finish time + penalty). Racers still
   * running are ordered by signed race distance minus the penalty converted to distance.
   */
  rank(racers) {
    const liveDist = (r) => r.race.raceDist - r.race.penaltyS * WRECK_PENALTY.metresPerSecond;
    const finTime = (r) => r.race.finishTime + r.race.penaltyS;
    const list = racers.slice().sort((a, b) => {
      const fa = a.race.finished;
      const fb = b.race.finished;
      if (fa && fb) return finTime(a) - finTime(b);
      if (fa !== fb) return fa ? -1 : 1;
      return liveDist(b) - liveDist(a);
    });
    let fin = 0;
    list.forEach((r, i) => {
      r.race.position = i + 1;
      if (r.race.finished) r.race.finishPos = ++fin;
    });
    return list;
  }
}
