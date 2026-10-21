/* ==========================================================================
   02 · PHYSICS — VehiclePhysics (drivetrain state machine, steering, grip),
   CollisionSystem (barrier guardrails, obstacles, SAT car-to-car impulses)
   ========================================================================== */
const CHARACTERS = [
  {
    id: 'carla',
    name: 'Carla the Crusher',
    title: 'Road Enforcer',
    poster: 'assets/characters/carla.jpg',
    quote: 'Crush first. Negotiate never.',
    specialty: 'Heavy Ramming & Kinetic Plating',
    bio: 'Former highway patrol commander turned ruthless syndicate enforcer. Built like iron with lethal head-on impact instincts.'
  },
  {
    id: 'bigfoot',
    name: 'Burly Bigfoot',
    title: 'The Mountain',
    poster: 'assets/characters/bigfoot.jpg',
    quote: "I don't dodge obstacles. I erase them.",
    specialty: 'Max Battering Mass & Wall Deflection',
    bio: 'Colossal desert marauder known for smashing through barricades and turning rival cars into crumpled scrap metal.'
  },
  {
    id: 'ace',
    name: 'Ace Falcon',
    title: 'Supersonic Daredevil',
    poster: 'assets/characters/ace.jpg',
    quote: "If you see my taillights, you're already too late.",
    specialty: 'Top Speed Redline & Rapid Nitro Burns',
    bio: 'Former supersonic aerial test pilot who lives at top gear redline, using straightaways to gap the entire circuit.'
  },
  {
    id: 'ironfang',
    name: 'Ironfang Spike',
    title: 'Arena Gladiator',
    poster: 'assets/characters/ironfang.jpg',
    quote: 'Blood and iron on the blacktop!',
    specialty: 'Close-Quarters Blade Shredding',
    bio: 'Pit fighter of the sunken arenas whose vehicle bristles with serrated steel blades designed to shred tires in overtakes.'
  },
  {
    id: 'razor_jack',
    name: 'Razor Jack',
    title: 'Shadow Blade',
    poster: 'assets/characters/razor_jack.jpg',
    quote: 'One clean cut is all it takes.',
    specialty: 'Precision Drift Apex & Micro-Nitro',
    bio: 'Precision wheelman from the neon docks who links corners with surgical power-slides and instant counter-attacks.'
  },
  {
    id: 'rudy',
    name: 'Rudy the Rhino',
    title: 'Unstoppable Juggernaut',
    poster: 'assets/characters/rudy.jpg',
    quote: 'Out of my lane or become a hood ornament!',
    specialty: 'Armor Shock Absorption & Missile Armor',
    bio: 'Armored vanguard warrior who shrugs off blast damage and maintains relentless forward momentum through heavy fire.'
  },
  {
    id: 'pyro',
    name: 'Ignis the Pyro',
    title: 'Flame Bringer',
    poster: 'assets/characters/pyro.jpg',
    quote: 'Let the highway burn in neon ash.',
    specialty: 'Dense Smoke Obscuration & Blind Attacks',
    bio: 'Refinery arsonist specializing in high-density smoke clouds that blind chasing rivals right before sharp hairpins.'
  },
  {
    id: 'typhon',
    name: 'Typhon the Trickster',
    title: 'Slick Tactician',
    poster: 'assets/characters/typhon.jpg',
    quote: "You can't shoot what you can't predict.",
    specialty: 'Oil Slick Traps & Slalom Evasion',
    bio: 'Tactical saboteur who leaves slippery oil slicks along apex corners to send aggressive tailgaters careening into walls.'
  },
  {
    id: 'panhead',
    name: 'Panhead Pete',
    title: 'Mad Speedster',
    poster: 'assets/characters/panhead.jpg',
    quote: 'Speed is a mental illness and I am totally cured!',
    specialty: 'Wild Oversteer Power-Slide Drift',
    bio: 'Deranged wasteland tinkerer with a saucepan helmet who dives into corners sideways with full throttle and zero fear.'
  },
];

const CAR_STYLES = {
  bloodhammer: {
    label: 'BLOODHAMMER',
    badge: 'CLASSIC',
    style: 'muscle',
    paint: 0x9d1b1b,
    accent: 0xf2b705,
    mass: 1.15,
    maxHealth: 130,
    blurb: 'Classic Muscle Brawler. Balanced speed and armor.',
    params: { maxSpeed: 50, accel: 25, grip: 8.5 },
    modelType: 'procedural',
  },
  razorback: {
    label: 'RAZORBACK',
    badge: 'CLASSIC',
    style: 'interceptor',
    paint: 0x1d3f6e,
    accent: 0xff6a00,
    mass: 0.95,
    maxHealth: 90,
    blurb: 'Classic Light Interceptor. Rear wing, fast acceleration.',
    params: { maxSpeed: 56, accel: 29, grip: 9.5 },
    modelType: 'procedural',
  },
  gutshot: {
    label: 'GUTSHOT',
    badge: 'CLASSIC',
    style: 'hauler',
    paint: 0x4b5a2a,
    accent: 0xd9d9d9,
    mass: 1.4,
    maxHealth: 175,
    blurb: 'Classic Armored Hauler. Side boards, heavy plow, durable.',
    params: { maxSpeed: 44, accel: 21, grip: 8.0 },
    modelType: 'procedural',
  },
  sandviper: {
    label: 'SANDVIPER',
    badge: 'BUGGY',
    style: 'buggy',
    paint: 0xd97706,
    accent: 0x10b981,
    mass: 0.82,
    maxHealth: 95,
    blurb: 'Open-Wheel Desert Raider. Ultra agile and responsive.',
    params: { maxSpeed: 58, accel: 31, grip: 9.8 },
    modelType: 'procedural',
  },
  warrig: {
    label: 'GOLIATH',
    badge: '6x6 DREADNOUGHT',
    style: 'warrig',
    paint: 0x27272a,
    accent: 0xef4444,
    mass: 2.1,
    maxHealth: 260,
    blurb: '6x6 Armored Dreadnought War Rig. Twin smokestacks, ramming plow.',
    params: { maxSpeed: 40, accel: 17, grip: 7.8 },
    modelType: 'procedural',
  },
  apc: {
    label: 'IRONCLAD',
    badge: '8x8 TACTICAL',
    style: 'apc',
    paint: 0x3b4d3b,
    accent: 0xfbbf24,
    mass: 2.3,
    maxHealth: 280,
    blurb: '8x8 Heavy Tactical Personnel Carrier. Maximum armor and stability.',
    params: { maxSpeed: 38, accel: 16, grip: 8.2 },
    modelType: 'procedural',
  },
  hotrod: {
    label: 'MEATGRINDER',
    badge: 'RAT-ROD',
    style: 'hotrod',
    paint: 0x581c87,
    accent: 0xfacc15,
    mass: 0.90,
    maxHealth: 110,
    blurb: 'Chopped V8 Rat-Rod. Zoomie exhausts, brutal acceleration.',
    params: { maxSpeed: 60, accel: 32, grip: 9.0 },
    modelType: 'procedural',
  },
  cyber: {
    label: 'WIDOWMAKER',
    badge: 'CYBER WEDGE',
    style: 'cyber',
    paint: 0x0f172a,
    accent: 0x00e5ff,
    mass: 0.85,
    maxHealth: 100,
    blurb: 'Stealth Cyber Hyper-Wedge. Highest top speed, neon underglow.',
    params: { maxSpeed: 64, accel: 34, grip: 10.5 },
    modelType: 'procedural',
  },
  monster: {
    label: 'COLOSSUS',
    badge: 'MONSTER 4x4',
    style: 'monster',
    paint: 0x1d4ed8,
    accent: 0xfde047,
    mass: 1.6,
    maxHealth: 200,
    blurb: 'Mega-Tire Crusher 4x4. Huge ground clearance and high impact mass.',
    params: { maxSpeed: 46, accel: 22, grip: 8.8 },
    modelType: 'procedural',
  },
  hearse: {
    label: 'TOMBSTONE',
    badge: 'GOTHIC SIEGE',
    style: 'hearse',
    paint: 0x18181b,
    accent: 0xa855f7,
    mass: 1.35,
    maxHealth: 160,
    blurb: 'Gothic Armored Siege Hearse. Chrome landau bars and reinforced hull.',
    params: { maxSpeed: 48, accel: 24, grip: 8.4 },
    modelType: 'procedural',
  },
  trophy: {
    label: 'MUDSHARK',
    badge: 'BAJA TROPHY',
    style: 'trophy',
    paint: 0xc2410c,
    accent: 0x38bdf8,
    mass: 1.25,
    maxHealth: 140,
    blurb: 'Widebody Baja Trophy Truck. Dual spare tires and roof lightbar.',
    params: { maxSpeed: 54, accel: 28, grip: 9.4 },
    modelType: 'procedural',
  },
  halftrack: {
    label: 'HELLHOUND',
    badge: 'HALF-TRACK',
    style: 'halftrack',
    paint: 0x4b5563,
    accent: 0xf97316,
    mass: 1.75,
    maxHealth: 220,
    blurb: 'Articulated Half-Track with rear tank treads. Unstoppable traction.',
    params: { maxSpeed: 43, accel: 20, grip: 9.6 },
    modelType: 'procedural',
  },
  dozer: {
    label: 'DOOMBRINGER',
    badge: 'SIEGE DOZER',
    style: 'dozer',
    paint: 0xca8a04,
    accent: 0x1f2937,
    mass: 2.4,
    maxHealth: 290,
    blurb: 'Armored Siege Bulldozer. Colossal front blade and rear ripper claws.',
    params: { maxSpeed: 36, accel: 15, grip: 8.0 },
    modelType: 'procedural',
  },
  trellis_car: {
    label: 'RAZOR INTERCEPTOR',
    badge: '3D MODEL',
    style: 'interceptor',
    paint: 0x1a2b4c,
    accent: 0x00d2ff,
    mass: 0.88,
    maxHealth: 85,
    blurb: '3D High-Tech Muscle Interceptor. Blistering top speed and agile handling.',
    params: { maxSpeed: 62, accel: 33, grip: 10.2 },
    modelType: 'trellis',
    trellisAsset: 'razorback',
  },
  trellis_truck: {
    label: 'GUTSHOT WAR RIG',
    badge: '3D MODEL',
    style: 'hauler',
    paint: 0x3b332a,
    accent: 0xff3b1f,
    mass: 1.85,
    maxHealth: 230,
    blurb: '3D 6-Wheel Heavy War Rig. Colossal armor, massive ramming cowcatcher.',
    params: { maxSpeed: 42, accel: 18, grip: 7.6 },
    modelType: 'trellis',
    trellisAsset: 'gutshot',
  },
  trellis_jeep: {
    label: 'BEAST BRAWLER 4x4',
    badge: '3D MODEL',
    style: 'muscle',
    paint: 0x223022,
    accent: 0xffb300,
    mass: 1.30,
    maxHealth: 150,
    blurb: '3D Lifted 4x4 Assault Truck. Roll cage, all-terrain stance, twin guns.',
    params: { maxSpeed: 52, accel: 26, grip: 9.2 },
    modelType: 'trellis',
    trellisAsset: 'bloodhammer',
  },
};
// Aliases for procedural generator style keys
CAR_STYLES.muscle = CAR_STYLES.bloodhammer;
CAR_STYLES.interceptor = CAR_STYLES.razorback;
CAR_STYLES.hauler = CAR_STYLES.gutshot;

const CAR_ORDER = [
  'bloodhammer',
  'razorback',
  'gutshot',
  'sandviper',
  'warrig',
  'apc',
  'hotrod',
  'cyber',
  'monster',
  'hearse',
  'trophy',
  'halftrack',
  'dozer',
  'trellis_car',
  'trellis_truck',
  'trellis_jeep',
];

const DRIVE_BASE = {
  brakeDecel: 34,
  reverseAccel: 12,
  reverseMax: 13,
  lowSpeed: 1.5,
  rollDecel: 2.0,
  dragK: 0.0021,
  steerRate: 9,
  maxSteer: 0.6,
  steerSpeedScale: 22,
  wheelbase: 3.4,
  maxYawRate: 2.6,
  yawResponse: 9,
  nitroTop: 1.35,
  nitroAccel: 1.8,
  maxSpeedAbs: 90,
};

/** Creates the authoritative physics state record for one vehicle. */
function makeVehicleState(id, styleKey, isPlayer) {
  const cfg = CAR_STYLES[styleKey];
  const maxHealth = cfg.maxHealth || 100;
  return {
    id,
    styleKey,
    name: cfg.label,
    driverName: cfg.label,
    isPlayer,
    mass: cfg.mass,
    color: cfg.paint,
    accent: cfg.accent,
    params: Object.assign({}, DRIVE_BASE, cfg.params),
    halfLen: 3.1,
    halfWid: 1.4,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
    omega: 0,
    u: 0,
    px: 0,
    pz: 0,
    ph: 0,
    py: 0, // previous-step pose (render interpolation)
    steerCmd: 0,
    steerAngle: 0,
    gear: 'NEUTRAL',
    throttle: false,
    brake: false,
    health: maxHealth,
    maxHealth: maxHealth,
    wrecked: false,
    wreckTimer: 0,
    wreckIdx: null, // track sample where the car was destroyed (the rebuild counts back from here)
    frozen: false,
    // Loadout: nothing is owned at the start. Road pickups unlock each system.
    loadout: { gun: false, rockets: false, shield: false, blades: false, gear: false },
    ammo: 0,
    ammoMax: 400,
    rockets: 0,
    rocketMax: 12,
    shieldPts: 0,
    shieldMax: 120,
    smokeCharges: 0,
    oilCharges: 0,
    traction: 1, // grip multiplier, lowered by oil slicks (set by the game each step)
    slickLoss: 0,
    fireCool: 0,
    rocketCool: 0,
    turretYaw: 0,
    nitro: 1,
    nitroActive: false,
    nitroT: 0,
    nitroCooldown: 0,
    trackIdx: -1,
    corners: new Float64Array(8),
    airborne: false,
    vy: 0,
    surf: null,
    roughNow: false,
    wasRough: false,
    stallT: 0,
    trackLat: 0,
    lastGood: null,
    nanRecoveries: 0,
    impactTimer: 0,
    suspKick: 0,
    smokeAcc: 0,
    fireAcc: 0,
    dustAcc: 0,
    stuck: {
      timer: 0,
      recoverT: 0,
      cooldown: 0,
      attempts: 0,
      attemptWindow: 0,
      recoverSteer: 0,
      teleportRequest: false,
      recoveries: 0,
    },
    race: {
      lap: 0,
      nextGate: 1,
      raceDist: 0,
      lastS: 0,
      finished: false,
      finishTime: 0,
      finishPos: 0,
      penaltyS: 0, // wreck penalty seconds, added to finish time and to live standing
      wrecks: 0,
      prevGate: -1,
      prevSide: 0,
      wrongWay: false,
      lastGateTime: 0,
    },
    model: null,
    aiDriver: null,
    kills: 0,
  };
}

const GRAVITY = 28; // vertical acceleration used for airtime (u/s²)
const SURF_ROAD = { grip: 1, roll: 1, drag: 1 };
const SURF_ROUGH = { grip: 0.6, roll: 3, drag: 2 }; // dirt / broken road: less grip, more rolling and drag

const VehiclePhysics = {
  longitudinal(v) {
    return v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  },
  lateral(v) {
    return v.vx * Math.cos(v.heading) - v.vz * Math.sin(v.heading);
  },
  speed(v) {
    return Math.hypot(v.vx, v.vz);
  },

  /** Nitro: press to ignite when charged; burns ~4.5 s at full, does not recharge naturally (refill via pickups/drift), cooldown after. */
  updateNitro(v, inp, dt) {
    if (v.nitroCooldown > 0) v.nitroCooldown = Math.max(0, v.nitroCooldown - dt);
    if (v.nitroActive) {
      v.nitroT -= dt;
      v.nitro = Math.max(0, v.nitro - dt * 0.22);
      if (v.nitroT <= 0 || v.nitro <= 0 || v.wrecked) {
        v.nitroActive = false;
        v.nitroCooldown = 1.5;
      }
    } else {
      if (v.naturalRecharge) v.nitro = Math.min(1, v.nitro + dt * 0.05);
      if (inp?.nitro && !v.wrecked && v.nitroCooldown <= 0 && v.nitro >= 0.25) {
        v.nitroActive = true;
        v.nitroT = 3.0;
      }
    }
  },

  /**
   * One fixed physics step. Single authoritative pipeline:
   * drivetrain (longitudinal along f) → lateral grip (along r) → speed-dependent steering → yaw → position.
   * inp: { throttle, brake, steer∈[-1,1], nitro (press edge) }
   */
  step(v, inp, dt) {
    const P = v.params;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const live = !v.wrecked && !v.frozen;
    this.updateNitro(v, live ? inp : null, dt);

    const throttle = live && !!inp.throttle;
    const brake = live && !!inp.brake;
    const boost = live && v.nitroActive;
    const u = v.vx * sh + v.vz * ch; // authoritative longitudinal speed

    // ---- Drivetrain state machine ----
    let gear = 'NEUTRAL';
    let a = 0;
    if (brake) {
      if (u > P.lowSpeed) {
        gear = 'BRAKING';
        a = -P.brakeDecel;
      } else {
        gear = 'REVERSE';
        if (u > -P.reverseMax) a = -P.reverseAccel;
      }
    } else if (throttle) {
      gear = 'FORWARD';
      const top = P.maxSpeed * (boost ? P.nitroTop : 1);
      const acc = P.accel * (boost ? P.nitroAccel : 1);
      a = acc * clamp(1 - Math.max(u, 0) / top, 0, 1);
    }
    const S = v.surf || SURF_ROAD;
    const drag = -P.dragK * u * Math.abs(u) * S.drag;
    const roll = Math.abs(u) > 0.02 ? -Math.sign(u) * P.rollDecel * S.roll * (live ? 1 : 0.5) : 0;
    let nu = u + (a + drag + roll) * dt;
    // Zero-crossing rules: braking cannot flip direction; coasting stops at zero.
    if (u > 0 && nu < 0 && gear !== 'REVERSE') nu = 0;
    if (u < 0 && nu > 0 && gear !== 'FORWARD') nu = 0;
    const dU = nu - u;
    v.vx += sh * dU;
    v.vz += ch * dU;

    // ---- Tactical Handbrake & Combat Power-Slide (Key [C] only) ----
    const handbrake = live && !!inp.handbrake;
    const isDrifting = handbrake && Math.abs(u) > 10;
    v.isDrifting = isDrifting;
    if (isDrifting) {
      v.driftCharge = Math.min(1.0, (v.driftCharge || 0) + dt * 0.45);
    } else if (v.driftCharge > 0.25) {
      // Corner exit micro-nitro burst
      v.nitroActive = true;
      v.nitroTimer = Math.max(v.nitroTimer || 0, v.driftCharge * 1.2);
      v.driftCharge = 0;
    } else {
      v.driftCharge = 0;
    }

    // ---- Lateral grip (tire side force, decays sideways slip) ----
    const s = v.vx * ch - v.vz * sh;
    const grip = (live ? P.grip : 3.0) * (boost ? 0.7 : 1) * (isDrifting ? 0.42 : 1) * S.grip * (v.traction ?? 1);
    const dS = s * Math.exp(-grip * dt) - s;
    v.vx += ch * dS;
    v.vz += -sh * dS;

    // ---- Steering (speed-dependent) and yaw ----
    const steerT = live ? clamp(inp.steer || 0, -1, 1) : 0;
    v.steerCmd += (steerT - v.steerCmd) * Math.min(1, dt * P.steerRate);
    const speedF = 1 / (1 + Math.abs(u) / P.steerSpeedScale);
    const delta = v.steerCmd * P.maxSteer * (0.35 + 0.65 * speedF);
    v.steerAngle = delta;
    let wT = (u * Math.tan(delta)) / P.wheelbase; // bicycle model: sign flips naturally in reverse
    if (isDrifting && steerT !== 0) {
      wT += steerT * 1.8;
    }
    const wLim = Math.min(P.maxYawRate * (isDrifting ? 1.4 : 1), LAT_LIMIT / Math.max(Math.abs(u), 3));
    wT = clamp(wT, -wLim, wLim);
    v.omega += (wT - v.omega) * Math.min(1, dt * P.yawResponse);
    v.heading = wrapAngle(v.heading + v.omega * dt);

    // ---- Integrate position ----
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > P.maxSpeedAbs) {
      const k = P.maxSpeedAbs / sp;
      v.vx *= k;
      v.vz *= k;
    }
    v.u = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
    v.gear = gear;
    v.throttle = throttle;
    v.brake = brake;
    if (v.wrecked) v.gear = 'NEUTRAL';
  },

  /**
   * Places the car on the track surface with no transient: used at spawn, respawn and reset.
   * Clears airtime and sets the ground reference used by the takeoff test.
   */
  resetSurface(v, track) {
    const q = track.query(v.x, v.z, v.trackIdx);
    const idx = q.idx;
    const yFull = q.y;
    const lat = q.lat;
    // Vertical speed must match the ground the car is already on: vy = (v·t)·grade. Starting at 0 on a
    // slope would look like a sudden drop and cause a false launch.
    const vyGround = (v.vx * q.tx + v.vz * q.tz) * q.grade;
    v.trackIdx = idx;
    v.trackLat = lat;
    v.y = yFull;
    v.vy = vyGround;
    v.airborne = false;
    v.surf = track.rough[idx] ? SURF_ROUGH : SURF_ROAD;
    v.roughNow = track.rough[idx] === 1;
    v.wasRough = v.roughNow;
  },

  /**
   * Surface contact, once per fixed step (after collisions). Returns { takeoff, landed, idx, ground }.
   *  - Grade: gravity along the slope, a = −g · grade · (forward · track tangent).
   *  - Takeoff: a car following the ground at along-track speed u needs a vertical acceleration of
   *    u²·κᵥ (κᵥ = vertical profile curvature at its sample). If that is below −g the ground falls away
   *    faster than gravity can follow, so the car leaves the surface. Crests and kicker lips trigger it;
   *    concave dips (κᵥ > 0) never do. This is analytic: it does not difference noisy positions.
   *  - Airtime: ballistic flight with gravity until the car is falling at least as fast as the ground
   *    and has reached the surface. Landing impact = relative vertical speed at touchdown.
   *  - Surface type (rough or road) is read from the track for the next physics step.
   */
  surfaceStep(v, track, dt) {
    const q = track.query(v.x, v.z, v.trackIdx);
    const idx = q.idx;
    const grade = q.grade;
    const yFull = q.y;
    v.trackIdx = idx;
    v.trackLat = q.lat;
    v.surf = track.rough[idx] ? SURF_ROUGH : SURF_ROAD;
    v.roughNow = track.rough[idx] === 1;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const u = v.vx * q.tx + v.vz * q.tz; // along-track speed
    const dyg = u * grade; // ground vertical velocity under the car
    const aGround = u * u * track.vcurv[idx]; // vertical acceleration the ground imposes
    let takeoff = false;
    let landed = 0;
    if (!v.airborne) {
      const along = sh * q.tx + ch * q.tz;
      const acc = -GRAVITY * grade * along;
      v.vx += sh * acc * dt;
      v.vz += ch * acc * dt;
      if (aGround < -GRAVITY) {
        v.airborne = true;
        takeoff = true;
      } else {
        v.vy = dyg;
        v.y = yFull;
      }
    }
    if (v.airborne) {
      v.vy -= GRAVITY * dt;
      v.y += v.vy * dt;
      // Touchdown only where the ground can catch the car (u²κᵥ ≥ −g). Over a convex drop the car keeps
      // flying. The snap below only guards against numerical sinking; it cannot occur on a convex drop.
      if ((v.y <= yFull && v.vy <= dyg && aGround >= -GRAVITY) || v.y < yFull - 0.5) {
        landed = Math.max(0, dyg - v.vy);
        v.airborne = false;
        v.y = yFull;
        v.vy = dyg;
      }
    }
    return { takeoff, landed, idx, ground: yFull };
  },

  isValid(v) {
    return isNum(v.x) && isNum(v.z) && isNum(v.vx) && isNum(v.vz) && isNum(v.heading) && isNum(v.omega) && isNum(v.y);
  },
  snapshot(v) {
    v.lastGood = {
      x: v.x,
      z: v.z,
      y: v.y,
      heading: v.heading,
      vx: v.vx,
      vz: v.vz,
      omega: v.omega,
      steerCmd: v.steerCmd,
    };
  },
  /** Runtime guard: restores the last finite snapshot if any state became non-finite. */
  sanitize(v) {
    if (this.isValid(v)) return true;
    v.nanRecoveries++;
    const g = v.lastGood;
    if (g) Object.assign(v, g, { vx: 0, vz: 0, omega: 0 });
    else {
      v.vx = 0;
      v.vz = 0;
      v.omega = 0;
      if (!isNum(v.x)) v.x = 0;
      if (!isNum(v.z)) v.z = 0;
      if (!isNum(v.heading)) v.heading = 0;
      if (!isNum(v.y)) v.y = 0;
    }
    return false;
  },
};

/**
 * Ramming chip. Each contact event costs a small amount of hull: nothing below the threshold, then linear and
 * capped. Blades on the attacking car double the chip on the car it hits.
 */
const RAM = { threshold: 6, perUnit: 0.22, cap: 2.2, bladeMul: 2, cooldown: 0.6 };
function ramChip(impact, attackerHasBlades) {
  if (!(impact > RAM.threshold)) return 0;
  const base = clamp((impact - RAM.threshold) * RAM.perUnit, 0, RAM.cap);
  return attackerHasBlades ? base * RAM.bladeMul : base;
}

const CollisionSystem = {
  /** World-space OBB corners (XZ) into v.corners: [FR, FL, RL, RR]. */
  computeCorners(v) {
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const hw = v.halfWid;
    const hl = v.halfLen;
    const c = v.corners;
    const pts = [
      [hw, hl],
      [-hw, hl],
      [-hw, -hl],
      [hw, -hl],
    ];
    for (let k = 0; k < 4; k++) {
      const lx = pts[k][0];
      const lz = pts[k][1];
      c[k * 2] = v.x + lx * ch + lz * sh;
      c[k * 2 + 1] = v.z - lx * sh + lz * ch;
    }
  },

  /**
   * Core wall response. n = unit normal pointing from the wall INTO free space (toward vehicle).
   * Penetration is resolved first (moved along n). Only an approaching contact (v·n < 0) is reflected:
   *   v' = 0.90·v_t − e·v_n,  with v_n = (v·n)n and e = 0.35.
   * Resting/slow contacts only remove the approach component (no tangential bleed-off).
   */
  applyWallContact(v, nx, nz, pen) {
    if (pen > 0) {
      v.x += nx * pen;
      v.z += nz * pen;
    }
    const vn = v.vx * nx + v.vz * nz;
    if (vn >= 0) return { approach: 0, impact: false }; // already moving away: never reflect
    const vnx = vn * nx;
    const vnz = vn * nz;
    const tx = v.vx - vnx;
    const tz = v.vz - vnz;
    if (-vn >= WALL_APPROACH_MIN) {
      v.vx = WALL_TANGENT_RETAIN * tx - WALL_E * vnx;
      v.vz = WALL_TANGENT_RETAIN * tz - WALL_E * vnz;
      v.omega *= 0.6;
      return { approach: -vn, impact: true };
    }
    v.vx = tx;
    v.vz = tz;
    return { approach: -vn, impact: false };
  },

  /** Barrier guardrails: continuous track boundary tested at all four OBB corners. */
  resolveBarriers(v, track) {
    let maxImpact = 0;
    let cx = v.x;
    let cz = v.z;
    let hits = 0;
    for (let pass = 0; pass < 3; pass++) {
      let touched = false;
      this.computeCorners(v);
      for (let k = 0; k < 4; k++) {
        const px = v.corners[k * 2];
        const pz = v.corners[k * 2 + 1];
        const q = track.query(px, pz, v.trackIdx);
        v.trackIdx = q.idx;
        const lat = q.lat;
        if (Math.abs(lat) <= ROAD_HALF) continue;
        const sgn = lat > 0 ? -1 : 1;
        const nx = sgn * q.rx;
        const nz = sgn * q.rz; // into the road
        const pen = Math.min(Math.abs(lat) - ROAD_HALF, 2.5);
        const r = this.applyWallContact(v, nx, nz, pen);
        touched = true;
        hits++;
        cx = px;
        cz = pz;
        if (r.impact) {
          maxImpact = Math.max(maxImpact, r.approach);
          const dh = wrapAngle(q.hd - v.heading); // gentle heading correction toward the track
          v.heading = wrapAngle(v.heading + dh * 0.12);
        }
        this.computeCorners(v);
      }
      if (!touched) break;
    }
    return { impact: maxImpact, x: cx, z: cz, hits };
  },

  /** Circular static obstacles (rocks, barrels, logs). Circle vs OBB, same wall response. */
  resolveCircles(v, circles) {
    let maxImpact = 0;
    let hx = 0;
    let hz = 0;
    let hits = 0;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const dx = c.x - v.x;
      const dz = c.z - v.z;
      const lx = dx * ch - dz * sh;
      const lz = dx * sh + dz * ch; // circle centre in car-local (x=right, z=forward)
      const cxl = clamp(lx, -v.halfWid, v.halfWid);
      const czl = clamp(lz, -v.halfLen, v.halfLen);
      const ex = lx - cxl;
      const ez = lz - czl;
      const d2 = ex * ex + ez * ez;
      if (d2 >= c.r * c.r) continue;
      let nlx;
      let nlz;
      let pen;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
        nlx = -ex / d;
        nlz = -ez / d;
        pen = c.r - d;
      } else {
        const m = Math.hypot(lx, lz) || 1;
        nlx = -lx / m;
        nlz = -lz / m;
        pen = c.r + 0.2;
      }
      const nx = nlx * ch + nlz * sh;
      const nz = -nlx * sh + nlz * ch; // local → world
      const r = this.applyWallContact(v, nx, nz, Math.min(pen, 2.5));
      hits++;
      hx = c.x;
      hz = c.z;
      if (r.impact) maxImpact = Math.max(maxImpact, r.approach);
    }
    return { impact: maxImpact, x: hx, z: hz, hits };
  },

  /**
   * Car vs car: SAT on the four OBB axes. Returns null when separated.
   * Mass-aware penetration split, restitution impulse with a cap, light friction and bounded spin.
   */
  resolvePair(A, B) {
    const axes = [
      [Math.sin(A.heading), Math.cos(A.heading)],
      [Math.cos(A.heading), -Math.sin(A.heading)],
      [Math.sin(B.heading), Math.cos(B.heading)],
      [Math.cos(B.heading), -Math.sin(B.heading)],
    ];
    const Afx = axes[0][0];
    const Afz = axes[0][1];
    const Arx = axes[1][0];
    const Arz = axes[1][1];
    const Bfx = axes[2][0];
    const Bfz = axes[2][1];
    const Brx = axes[3][0];
    const Brz = axes[3][1];
    let minOv = Number.POSITIVE_INFINITY;
    let bnx = 0;
    let bnz = 0;
    for (let k = 0; k < 4; k++) {
      const ax = axes[k][0];
      const az = axes[k][1];
      const dC = (B.x - A.x) * ax + (B.z - A.z) * az;
      const rA = A.halfLen * Math.abs(Afx * ax + Afz * az) + A.halfWid * Math.abs(Arx * ax + Arz * az);
      const rB = B.halfLen * Math.abs(Bfx * ax + Bfz * az) + B.halfWid * Math.abs(Brx * ax + Brz * az);
      const ov = rA + rB - Math.abs(dC);
      if (!(ov > 0)) return null;
      if (ov < minOv) {
        minOv = ov;
        const sg = dC > 0 ? -1 : 1;
        bnx = sg * ax;
        bnz = sg * az;
      }
    }
    const mA = A.mass;
    const mB = B.mass;
    const wA = mB / (mA + mB);
    const wB = mA / (mA + mB);
    A.x += bnx * minOv * wA;
    A.z += bnz * minOv * wA;
    B.x -= bnx * minOv * wB;
    B.z -= bnz * minOv * wB;
    const rvx = A.vx - B.vx;
    const rvz = A.vz - B.vz;
    const vn = rvx * bnx + rvz * bnz;
    const mx = (A.x + B.x) * 0.5;
    const mz = (A.z + B.z) * 0.5;
    let impact = 0;
    if (vn < 0) {
      const e = 0.3;
      const j = Math.min((-(1 + e) * vn) / (1 / mA + 1 / mB), 45);
      A.vx += (bnx * j) / mA;
      A.vz += (bnz * j) / mA;
      B.vx -= (bnx * j) / mB;
      B.vz -= (bnz * j) / mB;
      impact = -vn;
      const tx = rvx - vn * bnx;
      const tz = rvz - vn * bnz;
      A.vx -= tx * 0.06;
      A.vz -= tz * 0.06;
      B.vx += tx * 0.06;
      B.vz += tz * 0.06;
      const tqA = (mx - A.x) * bnz - (mz - A.z) * bnx;
      const tqB = (mx - B.x) * bnz - (mz - B.z) * bnx;
      A.omega = clamp(A.omega + tqA * 0.05, -2.5, 2.5);
      B.omega = clamp(B.omega + tqB * 0.05, -2.5, 2.5);
    }
    return { impact, x: mx, z: mz, nx: bnx, nz: bnz, depth: minOv };
  },
};
