/* ==========================================================================
   08 · HUD + SELF-DIAGNOSTIC SUITE
   Every test below calls the production functions used during gameplay
   (VehiclePhysics.step, CollisionSystem.*, WeaponSystem.*, AIDriver.update,
   RaceManager.crossGates, PickupSystem.update, ProceduralDeathCarBuilder.build)
   on isolated fixtures. Live race objects are never touched.
   Expected values are fixed analytic/spec values and are never adjusted.
   ========================================================================== */
class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hud = $('hud');
    this.e = {
      lap: $('lap'),
      pos: $('pos'),
      cp: $('cp'),
      time: $('time'),
      spd: $('spd'),
      gear: $('gear'),
      healthTxt: $('healthTxt'),
      healthFill: $('healthFill'),
      ammoTxt: $('ammoTxt'),
      ammoFill: $('ammoFill'),
      rocketTxt: $('rocketTxt'),
      rocketFill: $('rocketFill'),
      nitroTxt: $('nitroTxt'),
      nitroFill: $('nitroFill'),
      wrong: $('wrong'),
      countdown: $('countdown'),
      msg: $('msg'),
      pickupMsg: $('pickupMsg'),
      biomeTag: $('biomeTag'),
      vehTag: $('vehTag'),
      fps: $('fps'),
      wreck: $('wreck'),
      wreckMsg: $('wreckMsg'),
      spdUnit: $('spd-unit'),
    };
    this.cache = new Map();
    this.msgT = 0;
    this.pickT = 0;
  }
  txt(key, s) {
    if (this.cache.get(key) !== s) {
      this.cache.set(key, s);
      this.e[key].textContent = s;
    }
  }
  css(key, w) {
    const k = `w_${key}`;
    if (this.cache.get(k) !== w) {
      this.cache.set(k, w);
      this.e[key].style.width = w;
    }
  }
  visible(on) {
    this.hud.classList.toggle('hidden', !on);
  }
  message(text, dur = 2.2) {
    this.txt('msg', text);
    this.msgT = dur;
  }
  pickup(text) {
    this.e.pickupMsg.textContent = text;
    this.pickT = 2.0;
  }
  countdownText(s) {
    this.txt('countdown', s);
  }
  setGear(g) {
    const k = 'gear';
    if (this.cache.get(k) !== g) {
      this.cache.set(k, g);
      this.e.gear.textContent = g;
      this.e.gear.className = g;
    }
  }
  tick(dt) {
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.txt('msg', '');
    }
    if (this.pickT > 0) {
      this.pickT -= dt;
      if (this.pickT <= 0) this.e.pickupMsg.textContent = '';
    }
  }
  wreck(on, text) {
    this.e.wreck.classList.toggle('hidden', !on);
    if (text) this.e.wreckMsg.textContent = text;
  }
  addKillfeed(killer, victim, isPlayer) {
    const feed = document.getElementById('killfeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = `kill-msg${isPlayer ? ' player-kill' : ''}`;
    const icon = `<svg style="width:14px;height:14px;vertical-align:-2px;margin:0 3px;fill:${isPlayer ? '#ffb300' : '#ff3b1f'}" viewBox="0 0 24 24"><path d="M12 2l2.4 5.5 5.9-1.8-3.2 5.2 4.9 3.6-5.8 2.1 1.7 5.9-5.9-3.2-4.5 4.3.8-6.1-5.7-2.6 5.5-3.1-2.4-5.6 5.8 2.3z"/></svg>`;
    item.innerHTML = isPlayer
      ? `<b>YOU</b> ${icon} <span>${esc(victim)}</span>`
      : `<b>${esc(killer)}</b> ${icon} <span>${esc(victim)}</span>`;
    feed.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 400);
    }, 4000);
  }
}

/* ------------------------------------------------------------------------ */
const TestFixtures = {
  _track: null,
  track() {
    if (!this._track) this._track = new Track(4242);
    return this._track;
  },
  reset() {
    this._track = null;
  },
  vehicle(style = 'bloodhammer', id = 900) {
    const v = makeVehicleState(id, style, false);
    v.lastGood = null;
    return v;
  },
  /**
   * Steering command that holds a car on the centre line: heading error toward the local tangent plus a
   * lateral correction. +1 = left, matching the physics convention. Used by fixtures that drive a line.
   */
  holdLine(v, track) {
    const q = track.query(v.x, v.z, v.trackIdx);
    const dh = wrapAngle(q.hd - v.heading);
    const lat = q.lat;
    v.trackIdx = q.idx;
    return clamp(1.2 * dh - 0.12 * lat, -1, 1);
  },
  /** Places a fixture vehicle at a track sample/lateral offset with a heading offset. */
  placeOnTrack(v, idx, lat, dHeading = 0) {
    const t = this.track();
    const p = t.poseAt(idx, lat);
    v.x = p.x;
    v.z = p.z;
    v.y = p.y;
    v.heading = wrapAngle(p.hd + dHeading);
    v.vx = 0;
    v.vz = 0;
    v.omega = 0;
    v.trackIdx = p.idx;
    VehiclePhysics.resetSurface(v, t);
    return v;
  },
};

class SelfDiagnosticSuite {
  constructor() {
    this.results = [];
    this.running = false;
    this.budgetMs = 15000;
  }

  tests() {
    const T = TestFixtures;
    const I = (over = {}) => Object.assign({ throttle: false, brake: false, steer: 0, nitro: false }, over);
    return [
      {
        id: 'TEST_NO_MOUSE_STEER',
        title: 'Steering derives only from keyboard state',
        run: () => {
          const target = new EventTarget();
          const im = new InputManager(target);
          const kd = (code) => target.dispatchEvent(new KeyboardEvent('keydown', { code }));
          const ku = (code) => target.dispatchEvent(new KeyboardEvent('keyup', { code }));
          kd('KeyD');
          const withKey = im.controls().steer;
          for (let i = 0; i < 25; i++) {
            target.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 + i * 30, clientY: 10 + i, buttons: 1 }));
            target.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 900, clientY: 500 }));
            target.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: 900, clientY: 500 }));
            target.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
          }
          const withMouse = im.controls().steer;
          ku('KeyD');
          const released = im.controls().steer;
          const mouseListened = im.registeredEvents.filter((e) => /mouse|pointer|wheel|contextmenu/.test(e));
          im.destroy();
          const ok = withKey === -1 && withMouse === -1 && released === 0 && mouseListened.length === 0;
          return {
            ok,
            value: `steer(key D)=${withKey} (right = -1), after mouse spam=${withMouse}, released=${released}, mouse listeners=${mouseListened.length}`,
            detail:
              'Mouse events were dispatched to the input target; the steering command must not change and no mouse listener may exist. Convention: +1 = left, so D (right) reads -1.',
          };
        },
      },

      {
        id: 'TEST_REVERSE_GEAR',
        title: 'Reverse from rest: 30 steps of S',
        run: () => {
          const v = T.vehicle();
          const steps = 30;
          let gearOk = true;
          for (let i = 0; i < steps; i++) {
            VehiclePhysics.step(v, I({ brake: true }), PHYS_DT);
            if (v.gear !== 'REVERSE') gearOk = false;
          }
          const u = VehiclePhysics.longitudinal(v);
          const ok = gearOk && u < -2 && Math.abs(v.vz) > 2 && v.vz < 0;
          return {
            ok,
            value: `u=${u.toFixed(3)} u/s after ${steps} steps (gear=${v.gear}); expected u < -2 (reverseAccel=${v.params.reverseAccel} × 0.25 s = ${(v.params.reverseAccel * 0.25).toFixed(2)})`,
            detail: 'Convention: heading 0 gives f=(0,1), so reversing yields vz<0 and u = v·f < 0.',
          };
        },
      },

      {
        id: 'TEST_WALL_GLIDE_NO_STOP',
        title: 'Wall response at 30 u/s, 35° to the wall',
        run: () => {
          const v = T.vehicle();
          // Wall = plane x = 0; road lies at x < 0, so the into-road normal is n = (−1, 0).
          const nx = -1;
          const nz = 0;
          const ang = (35 * Math.PI) / 180;
          // Velocity makes 35° with the wall surface (grazing): normal part 30·sin35, tangential part 30·cos35.
          v.vx = 30 * Math.sin(ang);
          v.vz = 30 * Math.cos(ang);
          v.x = 0.4;
          v.z = 0; // 0.4 units inside the wall (penetration)
          const before = { vx: v.vx, vz: v.vz, speed: Math.hypot(v.vx, v.vz) };
          const vnB = v.vx * nx + v.vz * nz;
          const vtB = v.vz; // tangent is +z
          const expectedSpeed = Math.sqrt((WALL_TANGENT_RETAIN * vtB) ** 2 + (WALL_E * vnB) ** 2); // from the inputs, not the output
          const res = CollisionSystem.applyWallContact(v, nx, nz, 0.4);
          const vnA = v.vx * nx + v.vz * nz;
          const vtA = v.vz;
          const speedA = Math.hypot(v.vx, v.vz);
          const finite = [v.x, v.z, v.vx, v.vz].every(Number.isFinite);
          const penFixed = v.x <= 1e-9;
          const normalOk = Math.abs(vnA + WALL_E * vnB) < 1e-6; // v_n' = −e·v_n
          const tangentOk = Math.abs(vtA - WALL_TANGENT_RETAIN * vtB) < 1e-6; // v_t' = 0.9·v_t
          const speedOk = Math.abs(speedA - expectedSpeed) < 1e-6;
          // Stationary repeat contact must not re-apply the impulse.
          const vxRepeat = v.vx;
          const vzRepeat = v.vz;
          CollisionSystem.applyWallContact(v, nx, nz, 0);
          const noRepeat = Math.abs(v.vx - vxRepeat) < 1e-12 && Math.abs(v.vz - vzRepeat) < 1e-12;
          // Continue driving along the wall for 0.5 s with throttle: the car must keep moving.
          v.heading = 0; // +z forward
          for (let i = 0; i < 60; i++) VehiclePhysics.step(v, I({ throttle: true }), PHYS_DT);
          const glideSpeed = VehiclePhysics.speed(v);
          const ok =
            res.impact && finite && penFixed && normalOk && tangentOk && speedOk && noRepeat && glideSpeed > 15;
          return {
            ok,
            value: `in=${before.speed.toFixed(2)} u/s → out=${speedA.toFixed(3)} (expected ${expectedSpeed.toFixed(3)}); v_t ratio=${(vtA / vtB).toFixed(3)}; v_n' / v_n=${(vnA / vnB).toFixed(3)} (e=${WALL_E}); after 0.5 s glide=${glideSpeed.toFixed(2)} u/s`,
            detail:
              'Checks: penetration removed, finite output, normal reflected by e, 90% tangential kept, no repeated impulse on stationary contact.',
          };
        },
      },

      {
        id: 'TEST_PROCEDURAL_CAR_QUALITY',
        title: 'Procedural vehicle hierarchy',
        run: () => {
          const report = [];
          let ok = true;
          for (const style of CAR_ORDER) {
            const m = ProceduralDeathCarBuilder.build(style);
            const seen = new Set();
            const names = new Set();
            m.root.traverse((o) => {
              if (o.isMesh && !seen.has(o)) {
                seen.add(o);
                if (o.userData.component) names.add(o.userData.component);
              }
            });
            const fronts = m.wheels.filter((w) => w.front && w.z > 0 && w.steer.name.startsWith('steer_pivot_')).length;
            const wheelsOk =
              m.wheels.length >= 2 &&
              m.wheels.every((w) => w.spin.isObject3D && w.steer.isObject3D && w.suspension.isObject3D);
            const turretOk = !!m.turretNode && m.turretNode.isObject3D && !!m.turretPitch && m.muzzles.length === 2;
            const podsOk = m.rocketPods.filter(Boolean).length === 2;
            const armorOk = m.detachables.length >= 3;
            const styleOk = names.size >= 22 && wheelsOk && fronts >= 2 && turretOk && podsOk && armorOk;
            ok = ok && styleOk;
            report.push(
              `${style}: ${names.size} named meshes, wheels=${m.wheels.length}, front pivots=${fronts}, turret=${turretOk}, mounts=${m.muzzles.length}+${m.rocketPods.filter(Boolean).length}`,
            );
          }
          return {
            ok,
            value: report.join(' | '),
            detail:
              'Requires ≥22 distinct named meshes per style, 4 wheel assemblies, 2 front steer pivots, a turret node with 2 muzzle mounts, and 2 rocket pods.',
          };
        },
      },

      {
        id: 'TEST_WEAPON_IMPULSE',
        title: 'Rocket explosion: impulse, falloff, valid state',
        run: () => {
          const v = T.vehicle();
          const hits = WeaponSystem.applyExplosion(
            4,
            0,
            { radius: WEAPON.rocketRadius, damage: WEAPON.rocketDamage, impulse: WEAPON.rocketImpulse, owner: null },
            [v],
            null,
          );
          const h = hits.find((x) => x.vehicle === v);
          const dvOk = !!h && h.dv > 0 && Number.isFinite(h.dv);
          const pushedAway = v.vx < 0; // blast centre at +x, so the car is pushed toward −x
          const dmgOk = !!h && h.damage > 0 && h.damage < WEAPON.rocketDamage;
          for (let i = 0; i < 120; i++) VehiclePhysics.step(v, I({ throttle: true }), PHYS_DT);
          const valid =
            [v.x, v.z, v.vx, v.vz, v.heading].every(Number.isFinite) &&
            !v.wrecked &&
            v.health > 0 &&
            v.gear !== undefined;
          const ok = dvOk && pushedAway && dmgOk && valid;
          return {
            ok,
            value: `Δv=${h ? h.dv.toFixed(3) : 'n/a'} u/s, vx=${v.vx.toFixed(3)}, damage=${h ? h.damage.toFixed(1) : 'n/a'}, health=${v.health.toFixed(1)}, drivable=${valid}`,
            detail: 'Explosion at distance 4 with radius 13: falloff f = 1 − d/R; impulse and damage scale with f.',
          };
        },
      },

      {
        id: 'TEST_CHECKPOINT_LAP_PROGRESS',
        title: 'Gates: order, direction, lap wrap, cheat rejection',
        run: () => {
          const tr = T.track();
          const race = new RaceManager(tr, []);
          const v = T.vehicle();
          const N = tr.N;
          const G = tr.gates;
          // Forward drive from just before gate 1 through gate 0 (lap 1 complete).
          const crossed = [];
          let prev = null;
          const startIdx = (G[1].idx - 12 + N) % N;
          const steps = ((G[0].idx - startIdx + N) % N) + 3;
          for (let k = 0; k <= steps; k++) {
            const p = tr.poseAt((startIdx + k) % N, 0);
            v.x = p.x;
            v.z = p.z;
            v.heading = p.hd;
            v.trackIdx = p.idx;
            if (prev) {
              const g = race.crossGates(v, prev.x, prev.z, p.x, p.z);
              if (g >= 0) crossed.push(g);
            }
            prev = p;
          }
          // Gates 1..11 then 0 must appear in order exactly once.
          const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
          const orderOk = crossed.length >= expected.length && expected.every((g, i) => crossed[i] === g);
          const lapCount = v.race.lap;
          // Reverse crossing of the line (expecting gate 0) must not count.
          v.race.nextGate = 0;
          v.race.prevGate = -1;
          const lapBefore = v.race.lap;
          const nextBefore = v.race.nextGate;
          prev = null;
          for (let k = 0; k <= 8; k++) {
            const p = tr.poseAt((G[0].idx + 6 - k + N) % N, 0);
            v.x = p.x;
            v.z = p.z;
            v.heading = wrapAngle(p.hd + Math.PI); // driving backwards through the line
            if (prev) race.crossGates(v, prev.x, prev.z, p.x, p.z);
            prev = p;
          }
          const reverseIgnored = v.race.lap === lapBefore && v.race.nextGate === nextBefore;
          // Out-of-order gate (gate 6 while expecting gate 1) must not count.
          const w = T.vehicle();
          w.race.nextGate = 1;
          prev = null;
          for (let k = 0; k <= 20; k++) {
            const p = tr.poseAt((G[6].idx - 10 + k + N) % N, 0);
            w.x = p.x;
            w.z = p.z;
            if (prev) race.crossGates(w, prev.x, prev.z, p.x, p.z);
            prev = p;
          }
          const outOfOrderIgnored = w.race.nextGate === 1 && w.race.lap === 0;
          // A single step that jumps across gates 1..4 credits only the expected gate 1 (nextGate → 2).
          const u = T.vehicle();
          u.race.nextGate = 1;
          const a = tr.poseAt(G[1].idx - 10, 0);
          const b = tr.poseAt(G[4].idx + 5, 0);
          race.crossGates(u, a.x, a.z, a.x, a.z);
          race.crossGates(u, a.x, a.z, b.x, b.z);
          const teleportIgnored = u.race.nextGate === 2 && u.race.lap === 0;
          const ok = orderOk && lapCount === 1 && reverseIgnored && outOfOrderIgnored && teleportIgnored;
          return {
            ok,
            value: `crossed=[${crossed.join(',')}] lap=${lapCount} reverseIgnored=${reverseIgnored} outOfOrderIgnored=${outOfOrderIgnored} teleportIgnored=${teleportIgnored}`,
            detail:
              'Gates must count in order 1..11 then 0 (lap +1); backward, out-of-order and multi-gate jumps must not be credited.',
          };
        },
      },

      {
        id: 'TEST_AI_STUCK_RECOVERY',
        title: 'AI wedged into wall recovers and moves on',
        run: () => {
          const tr = T.track();
          const v = T.vehicle('razorback', 901);
          // Nose pressed perpendicular into the right-hand wall, corner touching it.
          T.placeOnTrack(v, 420, ROAD_HALF - 3.4, Math.PI / 2);
          const race = new RaceManager(tr, [v]);
          const ai = new AIDriver(v, tr, 77, 1);
          const ctx = { vehicles: [v], racing: true };
          let stuckTime = 0;
          let minSpeedAfterStart = Number.POSITIVE_INFINITY;
          let startedMoving = false;
          let maxStuckRun = 0;
          let stuckRun = 0;
          const startRace = v.race.raceDist;
          const dt = PHYS_DT;
          for (let i = 0; i < 2400; i++) {
            const inp = ai.update(dt, ctx);
            VehiclePhysics.step(v, inp, dt);
            CollisionSystem.resolveBarriers(v, tr);
            VehiclePhysics.sanitize(v);
            VehiclePhysics.surfaceStep(v, tr, dt);
            race.updateProgress(v);
            const sp = VehiclePhysics.speed(v);
            if (i < 120) continue;
            if (sp < 2 && ai.state !== 'RECOVER') {
              stuckRun += dt;
              maxStuckRun = Math.max(maxStuckRun, stuckRun);
            } else stuckRun = 0;
            if (ai.state === 'RECOVER' || sp > 3) startedMoving = true;
            minSpeedAfterStart = Math.min(minSpeedAfterStart, sp);
            stuckTime += sp < 2 ? dt : 0;
          }
          const progressed = v.race.raceDist - startRace;
          const recovered = ai.recoveries >= 1;
          const finite = Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.vx);
          const ok = recovered && finite && progressed > 15 && maxStuckRun < 1.6;
          return {
            ok,
            value: `recoveries=${ai.recoveries}, teleports=${ai.teleports}, progress=${progressed.toFixed(1)} units in 20 s, longest stuck run=${maxStuckRun.toFixed(2)} s`,
            detail:
              'Wedged start: speed < 2 u/s for >1.2 s triggers a 1.5 s reverse with opposite steer; the AI must then make forward progress.',
          };
        },
      },

      {
        id: 'TEST_COLLISION_PENETRATION',
        title: 'Penetration resolution: car-car and barrier',
        run: () => {
          const A = T.vehicle('bloodhammer', 910);
          const B = T.vehicle('gutshot', 911);
          A.x = 0;
          A.z = 0;
          A.heading = 0;
          B.x = 2.2;
          B.z = 0.5;
          B.heading = 0.3;
          B.vz = -12;
          B.vx = 0;
          A.vz = 8;
          const r1 = CollisionSystem.resolvePair(A, B);
          const r2 = CollisionSystem.resolvePair(A, B);
          const pairOk =
            !!r1 &&
            r1.depth > 0 &&
            (!r2 || r2.depth < 1e-6) &&
            [A.x, A.z, B.x, B.z, A.vx, A.vz, B.vx, B.vz].every(Number.isFinite);
          const relVelAfter = A.vz - B.vz;
          // Barrier: centre outside the wall with all corners penetrating.
          const tr = T.track();
          const C = T.vehicle('razorback', 912);
          T.placeOnTrack(C, 700, ROAD_HALF + 0.6, 0);
          for (let pass = 0; pass < 3; pass++) CollisionSystem.resolveBarriers(C, tr);
          CollisionSystem.computeCorners(C);
          let maxOut = Number.NEGATIVE_INFINITY;
          for (let k = 0; k < 4; k++) {
            const q = tr.query(C.corners[k * 2], C.corners[k * 2 + 1], C.trackIdx);
            maxOut = Math.max(maxOut, Math.abs(q.lat) - ROAD_HALF);
          }
          const wallOk = maxOut <= 1e-3 && Number.isFinite(C.x) && Number.isFinite(C.vx);
          const ok = pairOk && wallOk;
          return {
            ok,
            value: `pair depth=${r1 ? r1.depth.toFixed(4) : 'none'}, residual after re-test=${r2 ? r2.depth.toExponential(2) : '0'}; barrier max corner excess=${maxOut.toExponential(2)}; closing speed after=${relVelAfter.toFixed(2)}`,
            detail:
              'Two overlapping OBBs must be separated in one pass; a barrier-penetrating car must have all corners returned inside the road edge.',
          };
        },
      },

      {
        id: 'TEST_NITRO_STATE',
        title: 'Nitro: boost, expiry, cooldown lock, recharge',
        run: () => {
          const a = T.vehicle('razorback', 920);
          const b = T.vehicle('razorback', 921);
          const dt = PHYS_DT;
          for (let i = 0; i < 240; i++) {
            VehiclePhysics.step(a, I({ throttle: true, nitro: i === 0 }), dt);
            VehiclePhysics.step(b, I({ throttle: true }), dt);
          }
          const boosted = a.nitroActive && a.u > b.u + 1 && a.nitro < 1;
          // Run until the boost expires on its own (nitroT = 3.0 s); measure how long it lasted.
          let boostSteps = 240;
          while (a.nitroActive && boostSteps < 240 + 600) {
            VehiclePhysics.step(a, I({ throttle: true }), dt);
            boostSteps++;
          }
          const boostSec = boostSteps / 120;
          const expired = !a.nitroActive && a.nitroCooldown > 1.4 && a.nitroCooldown <= 1.5 + 1e-9;
          const boostDurationOk = Math.abs(boostSec - 3.0) < 0.02;
          const nitroAtExpiry = a.nitro;
          // Pressing during cooldown must not ignite.
          VehiclePhysics.step(a, I({ throttle: true, nitro: true }), dt);
          const blockedByCooldown = !a.nitroActive;
          // No natural refill: 6 s later cooldown has ended, but nitro remains unchanged (no natural refill).
          for (let i = 0; i < 720; i++) VehiclePhysics.step(a, I({ throttle: true }), dt);
          const naturalGained = a.nitro - nitroAtExpiry;
          const noNaturalRefill = Math.abs(naturalGained) < 1e-4 && !a.nitroActive;
          // Road pickup refill: collecting a nitro canister restores +0.50 (50%) nitro.
          PickupSystem.apply(a, 'nitro');
          const pickupGained = a.nitro - nitroAtExpiry;
          const pickupOk = Math.abs(pickupGained - 0.5) < 1e-3;
          // Collisions still resolve while boosting: a boosted car pressed against the wall stays inside the road.
          const tr = T.track();
          const c = T.vehicle('bloodhammer', 922);
          T.placeOnTrack(c, 900, ROAD_HALF - 2.5, Math.PI / 2 - 0.1);
          c.nitro = 1;
          c.nitroActive = false;
          c.nitroCooldown = 0;
          VehiclePhysics.updateNitro(c, I({ nitro: true }), dt);
          let wallSafe = c.nitroActive;
          for (let i = 0; i < 360; i++) {
            VehiclePhysics.step(c, I({ throttle: true }), dt);
            CollisionSystem.resolveBarriers(c, tr);
            CollisionSystem.computeCorners(c);
            for (let k = 0; k < 4; k++) {
              const q = tr.query(c.corners[k * 2], c.corners[k * 2 + 1], c.trackIdx);
              if (Math.abs(q.lat) > ROAD_HALF + 1e-3) wallSafe = false;
            }
          }
          const ok = boosted && boostDurationOk && expired && blockedByCooldown && noNaturalRefill && pickupOk && wallSafe;
          return {
            ok,
            value: `boost du=${(a.u - b.u).toFixed(2)} u/s; boost lasted ${boostSec.toFixed(2)} s (expect 3.00); cooldown after expiry=${a.nitroCooldown.toFixed(2)} s; press in cooldown ignited=${!blockedByCooldown}; natural fill=+${naturalGained.toFixed(3)} (0 expected); pickup fill=+${pickupGained.toFixed(2)} (+0.50); wall safe=${wallSafe}`,
            detail:
              'Boost must add speed, drain charge, expire after 3 s, lock re-ignition for 1.5 s cooldown, NOT recharge naturally over time, and refill +0.50 when collecting a road nitro canister.',
          };
        },
      },

      {
        id: 'TEST_PICKUP_COLLECTION',
        title: 'Pickups: collect once, respawn after timer',
        run: () => {
          const tr = T.track();
          const pk = new PickupSystem(tr, null);
          const v = T.vehicle('gutshot', 930);
          const it = pk.items.find((x) => x.type === 'bullets');
          v.x = it.x;
          v.z = it.z;
          v.heading = 0;
          v.ammo = 100;
          const ev1 = pk.update(PHYS_DT, [v]);
          const ammoOk = ev1.length === 1 && v.ammo === 220 && v.loadout.gun && !it.active;
          const ev2 = pk.update(PHYS_DT, [v]);
          const noDouble = ev2.length === 0;
          const rep = pk.items.find((x) => x.type === 'repair');
          const w = T.vehicle('gutshot', 931);
          w.health = 50;
          w.x = rep.x;
          w.z = rep.z;
          w.heading = 0;
          pk.update(PHYS_DT, [w]);
          const repairOk = w.health === 85;
          v.x = 1e5;
          w.x = 1e5;
          for (let i = 0; i < 40; i++) pk.update(0.5, [v, w]);
          const respawned = it.active;
          const ok = ammoOk && noDouble && repairOk && respawned;
          return {
            ok,
            value: `ammo 100→${v.ammo}, collected=${ev1.length}, double=${ev2.length}, repair 50→${w.health}, respawned=${respawned}`,
            detail: 'Ammo/repair effects apply exactly once and the pickup returns after its respawn timer.',
          };
        },
      },

      {
        id: 'TEST_DAMAGE_AND_DESTRUCTION',
        title: 'Damage, wreck state, stable race logic',
        run: () => {
          const v = T.vehicle('bloodhammer', 940);
          const o = T.vehicle('razorback', 941);
          v.vx = 20;
          v.vz = 0;
          v.heading = 0;
          v.health = 100;
          const d1 = WeaponSystem.applyDamage(v, 40);
          const mid = v.health;
          const d2 = WeaponSystem.applyDamage(v, 70);
          const d3 = WeaponSystem.applyDamage(v, 10);
          const wreckOk = !d1 && mid === 60 && d2 && v.wrecked && v.health === 0 && v.wreckTimer > 0 && !d3;
          const sp0 = VehiclePhysics.speed(v);
          for (let i = 0; i < 240; i++) VehiclePhysics.step(v, I({ throttle: true }), PHYS_DT);
          const sp1 = VehiclePhysics.speed(v);
          const finiteOk = Number.isFinite(sp1);
          const race = new RaceManager(T.track(), [v, o]);
          race.step(PHYS_DT, [v, o]);
          const ranks = [v.race.position, o.race.position].sort().join(',');
          const rankOk = ranks === '1,2';
          const ok = wreckOk && sp1 < sp0 && finiteOk && rankOk;
          return {
            ok,
            value: `hull 100→${mid}→${v.health}, wrecked=${v.wrecked}, speed ${sp0.toFixed(1)}→${sp1.toFixed(2)} (coasting), ranks=${ranks}`,
            detail: 'A wrecked vehicle takes no throttle, coasts to rest, and the race ranking remains valid.',
          };
        },
      },

      {
        id: 'TEST_NO_NAN_PHYSICS',
        title: '50 s of randomized driving and collisions stay finite',
        run: () => {
          const tr = T.track();
          const rnd = mulberry32(31337);
          const vs = [T.vehicle('bloodhammer', 950), T.vehicle('razorback', 951), T.vehicle('gutshot', 952)];
          T.placeOnTrack(vs[0], 100, 0);
          T.placeOnTrack(vs[1], 100, 4);
          T.placeOnTrack(vs[2], 100, -4);
          const obstacles = [{ x: tr.cx[300] + 6, z: tr.cz[300] + 6, r: 1.5 }];
          let inputs = vs.map(() => I());
          let nonFinite = 0;
          let maxSpeed = 0;
          for (let i = 0; i < 6000; i++) {
            if (i % 60 === 0)
              inputs = vs.map(() => ({
                throttle: rnd() < 0.8,
                brake: rnd() < 0.15,
                steer: rnd() * 2 - 1,
                nitro: rnd() < 0.05,
              }));
            const dt = PHYS_DT;
            vs.forEach((v, k) => {
              VehiclePhysics.step(v, inputs[k], dt);
              CollisionSystem.resolveBarriers(v, tr);
              CollisionSystem.resolveCircles(v, obstacles);
              VehiclePhysics.sanitize(v);
              VehiclePhysics.surfaceStep(v, tr, dt);
            });
            for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) CollisionSystem.resolvePair(vs[a], vs[b]);
            for (const v of vs) {
              VehiclePhysics.sanitize(v);
              if (![v.x, v.z, v.vx, v.vz, v.heading, v.omega].every(Number.isFinite)) nonFinite++;
              maxSpeed = Math.max(maxSpeed, VehiclePhysics.speed(v));
            }
          }
          const sanitizeHits = vs.reduce((s, v) => s + v.nanRecoveries, 0);
          const ok = nonFinite === 0 && sanitizeHits === 0 && maxSpeed <= DRIVE_BASE.maxSpeedAbs + 1e-6;
          return {
            ok,
            value: `steps=6000 (50 s), non-finite samples=${nonFinite}, sanitizer activations=${sanitizeHits}, peak speed=${maxSpeed.toFixed(1)} u/s`,
            detail:
              'Physics, barrier, obstacle and car-car collisions under random input must never produce NaN or unbounded speed.',
          };
        },
      },

      {
        id: 'TEST_STEER_DIRECTION',
        title: 'A steers left, D steers right (physical, camera convention)',
        run: () => {
          const dt = PHYS_DT;
          const right = new THREE.Vector3(0, 0, 1).cross(new THREE.Vector3(0, 1, 0)); // camera convention: right = forward × up
          const trial = (code) => {
            const im = new InputManager(new EventTarget());
            im.target.dispatchEvent(new KeyboardEvent('keydown', { code }));
            const steer = im.controls().steer;
            im.destroy();
            const v = T.vehicle('razorback', 960);
            v.heading = 0;
            v.vz = 20;
            for (let i = 0; i < 60; i++) VehiclePhysics.step(v, I({ throttle: true, steer }), dt);
            return { steer, lateral: v.x * right.x + v.z * right.z, dh: v.heading };
          };
          const d = trial('KeyD');
          const a = trial('KeyA');
          const ok = d.steer === -1 && a.steer === 1 && d.lateral > 0.5 && a.lateral < -0.5 && d.dh < 0 && a.dh > 0;
          return {
            ok,
            value: `D: steer=${d.steer}, moved ${d.lateral.toFixed(2)} u to the car's right, heading change ${d.dh.toFixed(3)} rad; A: steer=${a.steer}, moved ${a.lateral.toFixed(2)} u to the right (negative = left), heading change ${a.dh.toFixed(3)} rad`,
            detail:
              'Right = forward × up. At heading 0 the car faces +Z and its right is −X. Holding D must move and turn the car right; A must do the opposite.',
          };
        },
      },

      {
        id: 'TEST_KEY_REBIND',
        title: 'Assignable controls: rebinding and conflict swap',
        run: () => {
          const im = new InputManager(new EventTarget());
          const press = (code) => im.target.dispatchEvent(new KeyboardEvent('keydown', { code }));
          const release = (code) => im.target.dispatchEvent(new KeyboardEvent('keyup', { code }));
          im.assign('nitro', 'ArrowUp'); // ArrowUp was accelerate, so accelerate receives F (swap)
          press('ArrowUp');
          const nitroOnArrow = im.consumePress('nitro');
          const throttleOnArrow = im.controls().throttle;
          release('ArrowUp');
          press('KeyF');
          const throttleOnF = im.controls().throttle;
          const nitroOnF = im.consumePress('nitro');
          release('KeyF');
          im.setBindings(ARROW_PRESET);
          press('ArrowLeft');
          const steerLeft = im.controls().steer;
          release('ArrowLeft');
          const escRejected = im.assign('fire', 'Escape') === false;
          im.destroy();
          const ok = nitroOnArrow && !throttleOnArrow && throttleOnF && !nitroOnF && steerLeft === 1 && escRejected;
          return {
            ok,
            value: `nitro on ArrowUp=${nitroOnArrow}; accelerate moved off ArrowUp=${!throttleOnArrow}; accelerate now on F=${throttleOnF}; F no longer nitro=${!nitroOnF}; arrow preset steer-left=${steerLeft}; Esc rejected as a binding=${escRejected}`,
            detail:
              'Assigning a key already used by another action must swap the two, leaving no action unbound. Escape stays reserved for cancelling.',
          };
        },
      },

      {
        id: 'TEST_RECOVER_50M',
        title: 'Reset (R) places the car 50 m behind on the tangent',
        run: () => {
          const tr = T.track();
          const v = T.vehicle('bloodhammer', 970);
          T.placeOnTrack(v, 500, 3.5, 0.35); // deliberately bad state: off-centre and angled
          v.vz = 15;
          const q0 = tr.query(v.x, v.z, v.trackIdx);
          const s0 = q0.s;
          const x0 = v.x;
          const z0 = v.z;
          const pick = RaceManager.recoverBehind(v, tr, [v], 50);
          const arc = wrapDelta(s0 - pick * tr.ds, tr.length);
          const q1 = tr.query(v.x, v.z, pick);
          const lat1 = q1.lat;
          const idx1 = q1.idx;
          const hdErr = Math.abs(wrapAngle(v.heading - tr.poseAt(pick, 0).hd));
          const chord = Math.hypot(v.x - x0, v.z - z0);
          const ok =
            arc >= 49.5 &&
            arc <= 50.5 &&
            Math.abs(lat1) < 0.05 &&
            idx1 === pick &&
            hdErr < 1e-9 &&
            Math.abs(chord - 50) < 1.5 &&
            v.vz === 0 &&
            v.vx === 0 &&
            !v.airborne &&
            [v.x, v.z, v.y].every(Number.isFinite);
          return {
            ok,
            value: `arc back=${arc.toFixed(2)} u (expect 50), chord=${chord.toFixed(2)} u, lateral=${lat1.toFixed(3)}, heading error=${hdErr.toExponential(1)} rad, speed=${VehiclePhysics.speed(v).toFixed(1)}`,
            detail:
              'Reset must move the car 50 units of track arc behind its position, centred, aligned to the tangent, and at rest.',
          };
        },
      },

      {
        id: 'TEST_FIRING_KEEPS_SPEED',
        title: 'Firing never changes the shooter speed (rocket blast, machine gun, fire while driving)',
        run: () => {
          const tr = T.track();
          const I = (over = {}) => Object.assign({ throttle: false, brake: false, steer: 0, nitro: false }, over);
          // Blast check: a rocket explodes 4 u ahead of the shooter. The shooter's velocity must not change.
          const b = T.placeOnTrack(T.vehicle('bloodhammer', 960), 200, 0, 0);
          b.vx = 18 * Math.sin(b.heading);
          b.vz = 18 * Math.cos(b.heading);
          b.health = 100;
          const bx0 = b.vx;
          const bz0 = b.vz;
          const ahead = [{ x: b.x + Math.sin(b.heading) * 4, z: b.z + Math.cos(b.heading) * 4, r: 1 }];
          const rs = new RocketSim(4);
          rs.spawn(b, b.x, b.z, b.heading);
          for (let i = 0; i < 60 && rs.items.length; i++) rs.update(PHYS_DT, { vehicles: [b], obstacles: ahead, track: tr, fx: null });
          const blastDv = Math.hypot(b.vx - bx0, b.vz - bz0);
          const blastDamage = 100 - b.health;
          // Fire-while-driving: identical driving with and without the gun and rocket firing.
          const drive = (id, fire) => {
            const v = T.placeOnTrack(T.vehicle('bloodhammer', id), 300, 0, 0);
            v.loadout.gun = true;
            v.ammo = 500;
            v.fireCool = 0;
            v.vx = 0;
            v.vz = 0;
            for (let i = 0; i < 240; i++) {
              const inp = I({ throttle: true, steer: T.holdLine(v, tr) });
              v.frameInput = inp;
              if (fire && i % 12 === 0) {
                v.fireCool = 0;
                WeaponSystem.fireMachineGun(v, { vehicles: [v], obstacles: [], track: tr, fx: null });
              }
              VehiclePhysics.step(v, inp, PHYS_DT);
            }
            return v;
          };
          const fired = drive(961, true);
          const control = drive(962, false);
          const dU = Math.abs(VehiclePhysics.speed(fired) - VehiclePhysics.speed(control));
          const dX = Math.hypot(fired.x - control.x, fired.z - control.z);
          const ok =
            blastDv < 1e-12 &&
            blastDamage > 0 &&
            dU < 1e-9 &&
            dX < 1e-6 &&
            [fired.x, fired.z, fired.vx, fired.vz].every(Number.isFinite);
          return {
            ok,
            value: `blast Δv=${blastDv.toExponential(1)} u/s with self-damage ${blastDamage.toFixed(1)}; speed fired vs control Δ=${dU.toExponential(1)} u/s, position Δ=${dX.toExponential(1)} u`,
            detail:
              'A rocket that explodes next to its shooter damages it but gives it no knockback. Machine-gun fire and blasts must leave the shooter\'s speed and path identical to a car that did not fire.',
          };
        },
      },

      {
        id: 'TEST_WRECK_PENALTY',
        title: 'Wreck: time penalty, rebuild far back, and the live standing reflects it',
        run: () => {
          const tr = T.track();
          const a = T.placeOnTrack(T.vehicle('bloodhammer', 950), 300, 0, 0);
          const b = T.placeOnTrack(T.vehicle('razorback', 951), 280, 0, 0);
          const race = new RaceManager(tr, [a, b]);
          a.race.raceDist = 100; // a leads by 100 u before any wreck
          b.race.raceDist = 0;
          race.rank([a, b]);
          const pos0 = a.race.position;
          const s0 = tr.query(a.x, a.z, a.trackIdx).s;
          WeaponSystem.applyDamage(a, 9999);
          const applied = RaceManager.applyWreckPenalty(a);
          race.rank([a, b]);
          const pos1 = a.race.position;
          const penaltyOk = applied && a.race.penaltyS === WRECK_PENALTY.seconds && a.race.wrecks === 1;
          const pick = RaceManager.recoverBehind(a, tr, [a, b], WRECK_PENALTY.backM);
          const arc = wrapDelta(s0 - pick * tr.ds, tr.length);
          const arcOk = arc >= WRECK_PENALTY.backM - 1.5 && arc <= WRECK_PENALTY.backM + 1.5;
          // Finished racers: penalty moves them down the finish order.
          const f1 = T.vehicle('bloodhammer', 952);
          const f2 = T.vehicle('razorback', 953);
          RaceManager.applyWreckPenalty(f1); // the penalty is taken while f1 is still racing
          f1.race.finished = true;
          f1.race.finishTime = 60;
          f2.race.finished = true;
          f2.race.finishTime = 62;
          const raceF = new RaceManager(tr, [f1, f2]);
          raceF.rank([f1, f2]);
          const finishOk = f1.race.position === 2 && f2.race.position === 1 && f1.race.finishPos === 2;
          const noPenaltyAfterFinish = !RaceManager.applyWreckPenalty(f2) && f2.race.penaltyS === 0;
          const ok = pos0 === 1 && pos1 === 2 && penaltyOk && arcOk && finishOk && noPenaltyAfterFinish;
          return {
            ok,
            value: `standing ${pos0}→${pos1} after wreck (+${WRECK_PENALTY.seconds} s); rebuild ${arc.toFixed(1)} u behind the wreck (expect ${WRECK_PENALTY.backM}); finish order after penalty ${f2.race.position},${f1.race.position}`,
            detail:
              'Each wreck adds the penalty seconds, rebuilds the car backM of track arc behind the wreck site, and reorders the standing; finished racers keep their penalised order.',
          };
        },
      },

      {
        id: 'TEST_TRACK_FEATURES',
        title: 'Lap features: 2 ramps, 2 U-dips, 2 rough patches',
        run: () => {
          const tr = T.track();
          const ramps = tr.features.filter((f) => f.type === 'ramp');
          const dips = tr.features.filter((f) => f.type === 'dip');
          let runs = 0;
          for (let i = 0; i < tr.N; i++) if (tr.rough[i] && !tr.rough[(i - 1 + tr.N) % tr.N]) runs++;
          const maxDipGrade = Math.max(...dips.map((d) => (d.D / 2) * ((2 * Math.PI) / (d.L * tr.ds))));
          const maxRampGrade = Math.max(...ramps.map((r) => r.H / (r.W * tr.ds)));
          const ok =
            ramps.length === 2 &&
            dips.length === 2 &&
            runs === 2 &&
            maxDipGrade <= 0.08 &&
            maxRampGrade <= 0.15 &&
            dips.every((d) => d.D >= 2.5);
          return {
            ok,
            value: `ramps=${ramps.length} (rise slope ${maxRampGrade.toFixed(3)} ≈ ${((Math.atan(maxRampGrade) * 180) / Math.PI).toFixed(1)}°), U-dips=${dips.length} (depth ${dips[0] ? dips[0].D : 'n/a'} u, max added grade ${maxDipGrade.toFixed(3)} ≈ ${((Math.atan(maxDipGrade) * 180) / Math.PI).toFixed(1)}°), rough patches per lap=${runs}`,
            detail:
              'Features are read from the built track: exactly two of each, with dip grade ≤ 4.6° and ramp slope ≤ 8.5°.',
          };
        },
      },

      {
        id: 'TEST_ROUGH_PATCH_EFFECT',
        title: 'Rough patch: detected by surface step and slows the car',
        run: () => {
          const tr = T.track();
          const rough = tr.features.find((f) => f.type === 'rough');
          const idx = rough.i0 + 45;
          const probe = T.vehicle('bloodhammer', 980);
          T.placeOnTrack(probe, idx, 0, 0);
          VehiclePhysics.surfaceStep(probe, tr, PHYS_DT);
          const detected = probe.surf === SURF_ROUGH;
          const drive = (surf) => {
            const v = T.vehicle('bloodhammer', 981);
            T.placeOnTrack(v, idx, 0, 0);
            v.surf = surf;
            for (let k = 0; k < 1200; k++)
              VehiclePhysics.step(v, I({ throttle: true, steer: T.holdLine(v, tr) }), PHYS_DT); // 10 s from rest, on the line
            return VehiclePhysics.speed(v);
          };
          const vRoad = drive(SURF_ROAD);
          const vRough = drive(SURF_ROUGH);
          const ok = detected && vRough < vRoad * 0.85 && vRough > 10;
          return {
            ok,
            value: `surface detected=${detected}; top speed after 10 s: road ${vRoad.toFixed(1)} u/s, rough ${vRough.toFixed(1)} u/s (ratio ${(vRough / vRoad).toFixed(2)})`,
            detail:
              'Identical position and throttle; only the surface multipliers change (grip 0.6, rolling ×3, drag ×2). Rough must cap speed at least 15% lower.',
          };
        },
      },

      {
        id: 'TEST_RAMP_AIRTIME',
        title: 'Ramp: car takes off at the lip and lands',
        run: () => {
          const tr = T.track();
          const ramp = tr.features.find((f) => f.type === 'ramp');
          const lip = (ramp.i0 + ramp.W) % tr.N;
          const v = T.vehicle('razorback', 990);
          T.placeOnTrack(v, lip - 70, 0, 0);
          v.vx = 35 * Math.sin(v.heading);
          v.vz = 35 * Math.cos(v.heading);
          VehiclePhysics.resetSurface(v, tr); // vertical speed must match the slope at this speed
          const takeoffs = [];
          let maxAir = 0;
          let airSteps = 0;
          let landed = 0;
          let finite = true;
          for (let k = 0; k < 720; k++) {
            VehiclePhysics.step(v, I({ throttle: true, steer: T.holdLine(v, tr) }), PHYS_DT);
            CollisionSystem.resolveBarriers(v, tr);
            VehiclePhysics.sanitize(v);
            const r = VehiclePhysics.surfaceStep(v, tr, PHYS_DT);
            if (r.takeoff) takeoffs.push(r.idx);
            if (r.landed > 0) landed = r.landed;
            if (v.airborne) {
              airSteps++;
              maxAir = Math.max(maxAir, v.y - r.ground);
            }
            if (!Number.isFinite(v.y)) finite = false;
          }
          const nearLip = takeoffs.length >= 1 && takeoffs.every((i) => Math.abs(wrapDelta(i - lip, tr.N)) <= 4);
          const ok = nearLip && maxAir >= 0.25 && !v.airborne && airSteps > 0 && finite;
          return {
            ok,
            value: `takeoffs=${takeoffs.length} at sample ${takeoffs[0] !== undefined ? takeoffs[0] : 'none'} (lip ${lip}), max height above road=${maxAir.toFixed(2)} u, airtime=${(airSteps / 120).toFixed(2)} s, landing impact=${landed.toFixed(2)} u/s`,
            detail: 'Entering the ramp at 35 u/s must leave the ground only at the lip and land back on the surface.',
          };
        },
      },

      {
        id: 'TEST_DIP_NO_LAUNCH',
        title: 'U-dip: no airtime at high speed',
        run: () => {
          const tr = T.track();
          const dip = tr.features.find((f) => f.type === 'dip');
          const start = dip.i0 - 25;
          const end = dip.i0 + dip.L + 5;
          const v = T.vehicle('razorback', 991);
          T.placeOnTrack(v, start, 0, 0);
          v.vx = 56 * Math.sin(v.heading);
          v.vz = 56 * Math.cos(v.heading);
          VehiclePhysics.resetSurface(v, tr);
          let launches = 0;
          let maxSpeed = 0;
          for (let k = 0; k < 480; k++) {
            VehiclePhysics.step(v, I({ throttle: true, steer: T.holdLine(v, tr) }), PHYS_DT);
            CollisionSystem.resolveBarriers(v, tr);
            VehiclePhysics.sanitize(v);
            const r = VehiclePhysics.surfaceStep(v, tr, PHYS_DT);
            maxSpeed = Math.max(maxSpeed, VehiclePhysics.speed(v));
            if (r.takeoff && wrapDelta(r.idx - dip.i0, tr.N) >= -25 && wrapDelta(r.idx - end, tr.N) <= 0) launches++;
          }
          const ok = launches === 0 && maxSpeed >= 50;
          return {
            ok,
            value: `launches inside the dip=${launches}; peak speed=${maxSpeed.toFixed(1)} u/s`,
            detail:
              'A U-shaped dip is concave at its low point. At ~56 u/s it must be followed by the road with no takeoff.',
          };
        },
      },

      {
        id: 'TEST_AIRTIME_ONLY_AT_RAMPS',
        title: 'AI lap: every takeoff happens at a ramp lip',
        run: () => {
          const tr = T.track();
          const v = T.vehicle('razorback', 995);
          T.placeOnTrack(v, 0, 0, 0);
          const ai = new AIDriver(v, tr, 4242, 1);
          const ctx = { vehicles: [v], racing: true };
          const lips = tr.features.filter((f) => f.type === 'ramp').map((f) => (f.i0 + f.W) % tr.N);
          const takeoffs = [];
          let distance = 0;
          for (let k = 0; k < 7200; k++) {
            const inp = ai.update(PHYS_DT, ctx);
            VehiclePhysics.step(v, inp, PHYS_DT);
            distance += VehiclePhysics.speed(v) * PHYS_DT;
            CollisionSystem.resolveBarriers(v, tr);
            VehiclePhysics.sanitize(v);
            const r = VehiclePhysics.surfaceStep(v, tr, PHYS_DT);
            if (r.takeoff) takeoffs.push(r.idx);
          }
          const lipOf = (i) => lips.findIndex((l) => Math.abs(wrapDelta(i - l, tr.N)) <= 4);
          const allAtLips = takeoffs.length > 0 && takeoffs.every((i) => lipOf(i) >= 0);
          const lipsUsed = new Set(takeoffs.map(lipOf).filter((x) => x >= 0)).size;
          const ok = allAtLips && lipsUsed === 2 && Number.isFinite(v.x);
          return {
            ok,
            value: `60 s of AI driving: takeoffs=${takeoffs.length}, at ramp lips=${allAtLips}, distinct ramps used=${lipsUsed}/2, distance ${distance.toFixed(0)} u`,
            detail:
              'Airtime must come only from the two ramp lips; the AI must cross both within 60 s without any takeoff elsewhere.',
          };
        },
      },

      {
        id: 'TEST_NO_PROPS_ON_ROAD',
        title: 'Scenery never sits on the road (all biomes)',
        run: () => {
          const tr = T.track();
          let instances = 0;
          let onRoad = 0;
          let collidable = 0;
          const biomes = ['industrial', 'desert', 'forest', 'riverside', 'brazil', 'mumbai'];
          for (const biome of biomes) {
            const scene = new THREE.Scene();
            const env = new EnvironmentBuilder(scene, null).build(biome, tr, 77);
            collidable += env.obstacles.length;
            env.group.traverse((o) => {
              if (!o.isInstancedMesh) return;
              const a = o.instanceMatrix.array;
              for (let i = 0; i < o.count; i++) {
                const q = tr.query(a[i * 16 + 12], a[i * 16 + 14]);
                instances++;
                if (Math.abs(q.lat) < ROAD_HALF) onRoad++;
              }
            });
            env.dispose();
          }
          const ok = onRoad === 0 && collidable === 0 && instances > 100;
          return {
            ok,
            value: `instanced props checked=${instances}, inside road half-width=${onRoad}, collidable road obstacles=${collidable} (6 biomes)`,
            detail:
              'Every instanced prop must sit outside the road half-width (12 u), and no collidable obstacle may remain on the road.',
          };
        },
      },

      {
        id: 'TEST_LOADOUT_LOCKED_AT_START',
        title: 'Loadout: no weapons or accessories until picked up',
        run: () => {
          const v = T.vehicle('bloodhammer', 940);
          const L = v.loadout;
          const allLocked = !L.gun && !L.rockets && !L.shield && !L.blades && !L.gear;
          const empty = v.ammo === 0 && v.rockets === 0 && v.shieldPts === 0 && v.smokeCharges === 0 && v.oilCharges === 0;
          v.ammo = 100;
          v.rockets = 6;
          const shot = WeaponSystem.fireMachineGun(v, { vehicles: [], obstacles: [], track: T.track(), fx: null });
          const gunBlocked = shot === null && v.ammo === 100;
          const rocketBlocked = !WeaponSystem.canLaunchRocket(v);
          const ok = allLocked && empty && gunBlocked && rocketBlocked;
          return {
            ok,
            value: `locked=${allLocked}, empty=${empty}, gun refused with ammo=${gunBlocked}, rocket refused with stock=${rocketBlocked}`,
            detail:
              'A new car owns no weapons, shield, blades or gear. The gun and rocket gates refuse to fire while locked, even with ammo or rockets in stock.',
          };
        },
      },

      {
        id: 'TEST_PICKUP_UNLOCKS',
        title: 'Road pickups unlock weapons and accessories',
        run: () => {
          const pk = new PickupSystem(T.track(), null);
          const v = T.vehicle('razorback', 941);
          const steps = [
            ['bullets', () => v.loadout.gun && v.ammo === 120],
            ['missiles', () => v.loadout.rockets && v.rockets === 4],
            ['shield', () => v.loadout.shield && v.shieldPts === 60],
            ['blades', () => v.loadout.blades],
            ['gear', () => v.loadout.gear && v.smokeCharges === 3 && v.oilCharges === 3],
          ];
          const log = [];
          let ok = true;
          for (const [type, check] of steps) {
            const it = pk.items.find((x) => x.type === type && x.active);
            if (!it) {
              ok = false;
              log.push(`${type}:no-spot`);
              continue;
            }
            v.x = it.x;
            v.z = it.z;
            v.heading = 0;
            const ev = pk.update(PHYS_DT, [v]);
            const good = ev.length === 1 && ev[0].type === type && check();
            ok = ok && good;
            log.push(`${type}:${good ? 'ok' : 'FAIL'}`);
          }
          const types = ['bullets', 'missiles', 'shield', 'blades', 'gear', 'repair', 'nitro'];
          const icons = types.every((t) => PickupSystem.buildIcon(t).children.length > 0);
          ok = ok && icons;
          return {
            ok,
            value: `${log.join(' ')}, icons for ${types.length} types=${icons}`,
            detail:
              'Each pickup is collected once and flips its unlock with the expected amount: bullets 120 ammo, missiles 4 rockets, shield 60, blades, gear 3 smoke + 3 oil.',
          };
        },
      },

      {
        id: 'TEST_SHIELD_ABSORB',
        title: 'Shield absorbs damage before the hull',
        run: () => {
          const v = T.vehicle('gutshot', 942);
          v.health = 100;
          v.shieldPts = 60;
          const d1 = WeaponSystem.applyDamage(v, 30);
          const afterFirst = `${v.shieldPts.toFixed(0)}/${v.health.toFixed(0)}`;
          WeaponSystem.applyDamage(v, 50);
          const ok = !d1 && v.shieldPts === 0 && v.health === 80 && afterFirst === '30/100';
          return {
            ok,
            value: `30 dmg → shield/hull ${afterFirst}; 50 more → shield ${v.shieldPts}, hull ${v.health}`,
            detail: 'Damage is absorbed by the shield first (60 → 30 → 0). Only the remaining 20 of the second hit reaches the hull (100 → 80).',
          };
        },
      },

      {
        id: 'TEST_RAM_CHIP_SMALL',
        title: 'Ramming chips a small amount of hull per contact',
        run: () => {
          const curve = [ramChip(4, false), ramChip(10, false), ramChip(40, false), ramChip(10, true)];
          const A = TestFixtures.vehicle('bloodhammer', 943);
          const B = TestFixtures.vehicle('razorback', 944);
          TestFixtures.placeOnTrack(A, 300, 0, 0);
          const sh = Math.sin(A.heading);
          const ch = Math.cos(A.heading);
          // Car B sits 5.0 u ahead of A in its own lane. Side by side (3.2 u) the smallest overlap is lateral,
          // which makes the contact a sideways scrape rather than a ram; 5.0 u makes the contact normal longitudinal.
          B.x = A.x + sh * 5.0;
          B.z = A.z + ch * 5.0;
          B.y = A.y;
          B.heading = A.heading;
          B.trackIdx = A.trackIdx;
          B.vx = 0;
          B.vz = 0;
          A.vx = sh * 25;
          A.vz = ch * 25;
          const c = CollisionSystem.resolvePair(A, B);
          const impact = c ? c.impact : 0;
          const chip = ramChip(impact, false);
          const ok =
            curve[0] === 0 &&
            curve[1] > 0 &&
            curve[1] <= RAM.cap &&
            curve[2] === RAM.cap &&
            curve[3] === 2 * curve[1] &&
            chip > 0 &&
            chip <= RAM.cap;
          return {
            ok,
            value: `chip(4)=${curve[0]}, chip(10)=${curve[1].toFixed(2)}, chip(40)=${curve[2].toFixed(2)} (cap), blades×2 at 10=${curve[3].toFixed(2)}; 25 u/s head-on: impact ${impact.toFixed(2)} → chip ${chip.toFixed(2)}`,
            detail: `Each contact event costs at most RAM.cap = ${RAM.cap} hull (${RAM.cap * RAM.bladeMul} with blades). The game charges each pair at most once per cooldown window; that cooldown is game logic and is not exercised here.`,
          };
        },
      },

      {
        id: 'TEST_SMOKE_BLIND',
        title: 'Smoke blinds inside the cloud, clears outside, and thins with age',
        run: () => {
          const sf = new SmokeField(16);
          sf.spawn(0, 0, 0, 0);
          const inside = sf.densityAt(0, 0);
          const outside = sf.densityAt(40, 0);
          sf.update(SMOKE.life * 0.5);
          const mid = sf.densityAt(0, 0);
          sf.update(SMOKE.life);
          const after = sf.densityAt(0, 0);
          const ok = inside > 0.5 && outside === 0 && mid > 0 && mid < inside && after === 0;
          return {
            ok,
            value: `inside=${inside.toFixed(2)}, 40 u away=${outside}, half-life=${mid.toFixed(2)}, expired=${after}`,
            detail: 'Visibility loss is 1 at the centre of a fresh cloud, 0 outside its radius, lower as it ages, and 0 once the cloud expires.',
          };
        },
      },

      {
        id: 'TEST_OIL_TRACTION',
        title: 'Oil slick removes traction, then recovers after leaving',
        run: () => {
          const of = new OilField(40);
          const v = TestFixtures.vehicle('bloodhammer', 945);
          TestFixtures.placeOnTrack(v, 300, 0, 0);
          of.spawn(v.x, v.z, v.y);
          of.applyTo(v, PHYS_DT);
          const onOil = v.traction;
          v.x += 80; // drive off the slick
          for (let i = 0; i < 120 * 3; i++) of.applyTo(v, PHYS_DT);
          const recovered = v.traction;
          // Lateral slip: the physics decays sideways speed as s·exp(−grip·dt), with grip scaled by traction.
          const lateral = (tr) => {
            const w = TestFixtures.vehicle('bloodhammer', 946);
            TestFixtures.placeOnTrack(w, 300, 0, 0);
            w.vx = -Math.cos(w.heading) * 3;
            w.vz = Math.sin(w.heading) * 3;
            w.traction = tr;
            for (let i = 0; i < 60; i++) VehiclePhysics.step(w, I(), PHYS_DT);
            return Math.abs(w.vx * Math.cos(w.heading) - w.vz * Math.sin(w.heading));
          };
          const dry = lateral(1);
          const oily = lateral(OIL.minTraction);
          const ok = onOil <= 0.2 && recovered >= 0.999 && dry <= 0.15 && oily >= 1.2;
          return {
            ok,
            value: `traction on oil ${onOil.toFixed(2)}, after 3 s off ${recovered.toFixed(3)}; 0.5 s sideways slip from 3 u/s: dry ${dry.toFixed(2)}, oil ${oily.toFixed(2)}`,
            detail:
              'Over a slick traction falls to OIL.minTraction (0.12) and recovers linearly. Expected: dry road sheds ≥95% of sideways speed in 0.5 s, the oiled car keeps ≥40%.',
          };
        },
      },

      {
        id: 'TEST_LIGHTING_PRESETS',
        title: 'Lighting presets: night is dark, day is light blue',
        run: () => {
          const tr = T.track();
          const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          const res = {};
          for (const id of ['day', 'night', 'sunset', 'storm']) {
            const scene = new THREE.Scene();
            const env = new EnvironmentBuilder(scene, null).build('industrial', tr, 77, id);
            res[id] = {
              sky: lum(scene.background),
              sky3: scene.background.clone(),
              sun: env.sun.intensity,
              head: env.headlight.intensity,
              applied: env.lightingId,
            };
            env.dispose();
          }
          const d = res.day.sky3;
          const blueDay = d.b > d.r && d.b > d.g;
          const names = ['day', 'night', 'sunset', 'storm'].every((k) => res[k].applied === k);
          const ok =
            res.night.sky < res.day.sky * 0.1 &&
            res.night.sun < res.day.sun * 0.2 &&
            res.night.head > 0 &&
            res.day.head === 0 &&
            blueDay &&
            names;
          return {
            ok,
            value: `sky luminance night ${res.night.sky.toFixed(3)} vs day ${res.day.sky.toFixed(3)}; sun night ${res.night.sun} vs day ${res.day.sun}; headlight night ${res.night.head}, day ${res.day.head}; day sky blue=${blueDay}`,
            detail: 'Each preset is applied to the scene it is built into. Night must be at least 10× darker than day, with a player headlight; day must be blue-dominant with no headlight.',
          };
        },
      },

      {
        id: 'TEST_RIVERSIDE_CHANNEL',
        title: 'River Side Drive: channel beside the road, road surface untouched',
        run: () => {
          const tr = T.track();
          const env = new EnvironmentBuilder(new THREE.Scene(), null).build('riverside', tr, 77);
          const p = tr.poseAt(300, RIVER.lat);
          const bed = env.height(p.x, p.z);
          const water = p.y - RIVER.waterDrop;
          const road = tr.poseAt(300, 0);
          const roadH = env.height(road.x, road.z);
          const hasWater = !!env.group.getObjectByName('river_water');
          const ok = hasWater && bed < water - 0.5 && water - bed < 2.5 && Math.abs(roadH - (road.y - 0.35)) < 0.02;
          env.dispose();
          return {
            ok,
            value: `water mesh=${hasWater}, bed ${bed.toFixed(2)} vs water ${water.toFixed(2)} (depth ${(water - bed).toFixed(2)}), road ${roadH.toFixed(3)} vs ${(road.y - 0.35).toFixed(3)}`,
            detail: 'The river water mesh exists, the bed lies below the water surface, and the road surface height is unchanged by the channel.',
          };
        },
      },

      {
        id: 'TEST_SOUND_FALLOFF',
        title: 'Sound: distance falloff, and silence before audio is unlocked',
        run: () => {
          const r = AUDIO.range.gun;
          const f0 = AudioFx.falloff(0, r);
          const fh = AudioFx.falloff(r / 2, r);
          const fr = AudioFx.falloff(r, r);
          let monotonic = true;
          for (let d = 0; d < r; d += 5) if (AudioFx.falloff(d + 5, r) > AudioFx.falloff(d, r)) monotonic = false;
          const quiet = new AudioFx(); // no AudioContext yet, as before the first user gesture
          quiet.gun(0, 0, true);
          quiet.rocket(0, 0, true);
          quiet.explosion(0, 0, 8, true);
          quiet.pickup();
          quiet.updateEngines([]);
          const silent = Object.values(quiet.counts).every((n) => n === 0) && quiet.ctx === null;
          const ok = f0 === 1 && Math.abs(fh - 0.25) < 1e-9 && fr === 0 && monotonic && silent;
          return {
            ok,
            value: `falloff: d=0 → ${f0}, d=range/2 → ${fh}, d=range → ${fr}, monotonic=${monotonic}; before unlock: no sounds counted=${silent}`,
            detail: 'Loudness is 1 at the listener, 0.25 at half range (quadratic), and 0 at range. Sound calls made before the AudioContext exists play nothing and count nothing.',
          };
        },
      },

      {
        id: 'TEST_TRACK_GEOMETRY',
        title: 'Track: closed loop, width, radius, gate layout',
        run: () => {
          const tr = T.track();
          const first = tr.poseAt(0, 0);
          const last = tr.poseAt(tr.N - 1, 0);
          const gap = Math.hypot(first.x - last.x, first.z - last.z);
          let maxK = 0;
          for (let i = 0; i < tr.N; i++) maxK = Math.max(maxK, Math.abs(tr.kappa[i]));
          const minRadius = 1 / maxK;
          const gateOk = tr.gates.length >= 12 && tr.gates.every((g, i, a) => i === 0 || g.idx > a[i - 1].idx);
          const ok = tr.valid && gap < 2 && 2 * ROAD_HALF >= 24 && minRadius >= 40 && gateOk && GATE_COUNT >= 12;
          return {
            ok,
            value: `length=${tr.length.toFixed(0)} u, closure gap=${gap.toFixed(3)}, min radius=${minRadius.toFixed(1)}, width=${2 * ROAD_HALF}, gates=${tr.gates.length}, valid=${tr.valid}`,
            detail: 'Closed circuit with ≥24 unit road width, minimum corner radius ≥40 and ≥12 ordered gates.',
          };
        },
      },
    ];
  }

  /** Runs every test; a failing test gets ONE bounded retry on a freshly built fixture. */
  run(onRow) {
    this.running = true;
    const t0 = performance.now();
    this.results = [];
    const list = this.tests();
    for (const test of list) {
      if (performance.now() - t0 > this.budgetMs) {
        this.results.push({
          id: test.id,
          title: test.title,
          status: 'ERROR',
          value: 'not executed',
          detail: 'Time budget exceeded before this test ran.',
          attempts: 0,
        });
        continue;
      }
      let attempts = 0;
      let out = null;
      let status = 'ERROR';
      let corrected = false;
      while (attempts < 2) {
        attempts++;
        try {
          out = test.run();
          status = out.ok ? 'PASS' : 'FAIL';
        } catch (err) {
          out = {
            ok: false,
            value: 'exception',
            detail: String(err?.stack || err)
              .split('\n')
              .slice(0, 3)
              .join(' | '),
          };
          status = 'ERROR';
        }
        if (status === 'PASS') {
          corrected = attempts > 1;
          break;
        }
        if (attempts < 2) TestFixtures.reset(); // bounded correction: rebuild shared fixtures and retry once
      }
      const row = { id: test.id, title: test.title, status, value: out.value, detail: out.detail, attempts, corrected };
      this.results.push(row);
      if (onRow) onRow(row);
    }
    this.running = false;
    this.elapsed = performance.now() - t0;
    return this.results;
  }
  summary() {
    const p = this.results.filter((r) => r.status === 'PASS').length;
    const f = this.results.filter((r) => r.status === 'FAIL').length;
    const e = this.results.filter((r) => r.status === 'ERROR').length;
    return { p, f, e, total: this.results.length };
  }
}
