/* ==========================================================================
   09 · GAME — renderer, fixed-step simulation (120 Hz, capped accumulator),
   interpolated rendering, race lifecycle, weapon routing, chase camera,
   menus, pause/results overlays, adaptive resolution, and diagnostics wiring.
   Keyboard-only play: no mouse input reaches the driving or weapon logic.
   ========================================================================== */
const RACE_RIVALS = 8;
const GEAR_LABEL = { FORWARD: 'DRIVE', BRAKING: 'BRAKE', REVERSE: 'REVERSE', NEUTRAL: 'NEUTRAL' };
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
};
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const BINDINGS_KEY = 'deathRace.bindings.v1';

class DeathRaceGame {
  /** Saved key bindings from localStorage; Escape is never accepted as a game binding. */
  static loadBindings() {
    try {
      const raw = JSON.parse(localStorage.getItem(BINDINGS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      const out = {};
      for (const a of ACTION_ORDER) {
        if (!Array.isArray(raw[a])) continue;
        const codes = raw[a].filter((c) => typeof c === 'string' && c && c !== 'Escape');
        if (codes.length) out[a] = codes;
      }
      return Object.keys(out).length ? out : null;
    } catch (err) {
      return null;
    }
  }

  saveBindings() {
    try {
      localStorage.setItem(BINDINGS_KEY, JSON.stringify(this.input.bindings));
    } catch (err) {
      /* storage unavailable: bindings last for this session only */
    }
  }

  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.canvas = this.$('gl');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pixelScale = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 1600);
    this.env = new EnvironmentBuilder(this.scene, this.renderer);
    this.particles = new ParticleSystem(this.scene);
    this.visuals = new WeaponVisuals(this.scene, this.particles);
    this.rockets = new RocketSim(14);
    this.smoke = new SmokeField(16);
    this.oil = new OilField(40);
    this.oil.attachScene(this.scene);
    this.pairCool = new Map(); // per-pair ram cooldowns (key = "idA:idB")
    this.lightingId = 'biome';
    this.smokePuffT = 0;
    this.blindAtFn = (x, z) => this.smoke.densityAt(x, z);
    this.accAssets = this.buildAccessoryAssets();
    this.audio = new AudioFx();
    this.audio.enabled = DeathRaceGame.loadSoundPref();
    this.countBeep = null;
    this.goBeep = false;
    this.nitroWas = false;
    this.hud = new HUD();
    this.input = new InputManager(window, DeathRaceGame.loadBindings());
    this.input.preventDefaults = false; // enabled only while RACE is active (see syncPreventDefaults)
    this.capture = null; // action currently waiting for a key in the Controls overlay
    this.diag = new SelfDiagnosticSuite();
    this.rng = mulberry32(90210);
    this.state = 'MENU'; // MENU | RACE | OVER
    this.paused = false;
    this.diagOpen = false;
    this.biomeId = 'industrial';
    this.playerStyle = 'bloodhammer';
    this.racers = [];
    this.player = null;
    this.track = null;
    this.race = null;
    this.pickups = null;
    this.traps = null;
    this.previewTrack = null;
    this.menuFocus = new THREE.Vector3();
    this._tv = new THREE.Vector3();
    this.edge = { nitro: false, secondary: false, smoke: false, oil: false };
    this.acc = 0;
    this.lastT = 0;
    this.shake = 0;
    this.recoverCD = 0;
    this.finishShown = false;
    this.frameTimes = new Float64Array(120);
    this.frameIdx = 0;
    this.fpsWindow = 0;
    this.fpsFrames = 0;
    this.fpsText = '--';
    this.adaptT = 0;
    this.camPos = new THREE.Vector3();
    this.camSnap = true;
    this._tv = new THREE.Vector3();
    this._tq = new THREE.Quaternion();
    this.fx = this.makeFx();
    this.weaponCtx = { vehicles: [], obstacles: [], track: null, fx: this.fx };
    this.chosenCharId = DeathRaceGame.loadDriverPref();
    this.chosenCharIndex = 0;
    this.menuStep = 1;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.minimapScale = 1;
    this.minimapCenterX = 0;
    this.minimapCenterZ = 0;
    this.minimapPath = null;
    this.zeroInput = {
      throttle: false,
      brake: false,
      steer: 0,
      nitro: false,
      fire: false,
      secondary: false,
      smoke: false,
      oil: false,
    };
  }

  static loadDriverPref() {
    try {
      const saved = localStorage.getItem('deathRace.driver');
      if (saved && typeof CHARACTERS !== 'undefined' && CHARACTERS.some((c) => c.id === saved)) return saved;
    } catch (e) {}
    return 'carla';
  }

  static loadSoundPref() {
    try {
      return localStorage.getItem('deathRace.sound') !== 'off';
    } catch (e) {
      return true; // storage blocked: default to sound on
    }
  }

  toggleSound() {
    this.audio.unlock();
    this.audio.setEnabled(!this.audio.enabled);
    try {
      localStorage.setItem('deathRace.sound', this.audio.enabled ? 'on' : 'off');
    } catch (e) {
      // storage blocked: the setting lasts for this page only
    }
    this.syncSoundButton();
  }

  syncSoundButton() {
    this.$('btnSound').textContent = `Sound: ${this.audio.enabled ? 'ON' : 'OFF'} (M)`;
  }

  /* ---------------------------------- boot --------------------------------- */
  boot() {
    this.resize();
    this.bindUI();
    this.buildDriverSelect();
    this.buildGarage();
    this.buildPreview();
    this.setMenuStep(1);
    this.runDiagnostics();
    TrellisCarLoader.init();
    TrellisCarLoader.onLoaded(() => {
      if (this.racers && this.racers.length) {
        this.upgradeRacersToTrellis();
      }
      if (this.state === 'MENU') {
        this.updateMenuCar();
      }
    });
    this.$('loading').classList.add('done');
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  buildDriverSelect() {
    if (typeof CHARACTERS === 'undefined') return;
    this.chosenCharIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === this.chosenCharId));
    this.renderPilotCarousel();
    this.renderPilotDots();

    // Compatibility fallback for tests
    const grid = this.$('charGrid');
    if (grid) {
      grid.innerHTML = '';
      for (const ch of CHARACTERS) {
        const card = document.createElement('div');
        card.className = `char-card${ch.id === this.chosenCharId ? ' sel' : ''}`;
        card.dataset.charId = ch.id;
        card.innerHTML = `<img src="${esc(ch.poster)}" alt="${esc(ch.name)}" onerror="this.style.display='none'"><b>${esc(ch.name)}</b><small>${esc(ch.title)}</small>`;
        grid.appendChild(card);
      }
    }
  }

  renderPilotDots() {
    const dotsWrap = this.$('pilotDots');
    if (!dotsWrap || typeof CHARACTERS === 'undefined') return;
    dotsWrap.innerHTML = '';
    for (let i = 0; i < CHARACTERS.length; i++) {
      const d = document.createElement('div');
      d.className = `dot${i === this.chosenCharIndex ? ' active' : ''}`;
      d.title = CHARACTERS[i].name;
      d.onclick = () => {
        this.chosenCharIndex = i;
        this.chosenCharId = CHARACTERS[i].id;
        try { localStorage.setItem('deathRace.driver', this.chosenCharId); } catch (e) {}
        this.renderPilotCarousel();
        this.updatePilotDots();
      };
      dotsWrap.appendChild(d);
    }
  }

  updatePilotDots() {
    const dots = document.querySelectorAll('#pilotDots .dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === this.chosenCharIndex));
  }

  renderPilotCarousel() {
    const container = this.$('pilotCarouselCards');
    if (!container || typeof CHARACTERS === 'undefined') return;
    container.innerHTML = '';
    const N = CHARACTERS.length;
    const prevIdx = (this.chosenCharIndex - 1 + N) % N;
    const currIdx = this.chosenCharIndex;
    const nextIdx = (this.chosenCharIndex + 1) % N;

    const prev = CHARACTERS[prevIdx];
    const curr = CHARACTERS[currIdx];
    const next = CHARACTERS[nextIdx];

    // Card 1: Prev Pilot (Left)
    const cardPrev = document.createElement('div');
    cardPrev.className = 'char-slide prev';
    cardPrev.innerHTML = `
      <img class="char-poster" src="${esc(prev.poster)}" alt="${esc(prev.name)}" onerror="this.style.display='none'">
      <div class="char-info">
        <span class="char-badge">PREVIOUS PILOT</span>
        <div class="char-name">${esc(prev.name)}</div>
        <div class="char-title">${esc(prev.title)}</div>
        <div class="char-specialty">${esc(prev.specialty)}</div>
      </div>
    `;
    cardPrev.onclick = () => this.shiftPilot(-1);
    container.appendChild(cardPrev);

    // Card 2: Active / Featured Pilot (Center)
    const cardCurr = document.createElement('div');
    cardCurr.className = 'char-slide active';
    cardCurr.innerHTML = `
      <img class="char-poster" src="${esc(curr.poster)}" alt="${esc(curr.name)}" onerror="this.style.display='none'">
      <div class="char-info">
        <span class="char-badge">SELECTED PILOT // ACTIVE</span>
        <div class="char-name">${esc(curr.name)}</div>
        <div class="char-title">${esc(curr.title)}</div>
        <div class="char-quote">"${esc(curr.quote || '')}"</div>
        <div class="char-specialty">PERK: ${esc(curr.specialty || '')}</div>
        <div class="char-bio">${esc(curr.bio || '')}</div>
      </div>
    `;
    container.appendChild(cardCurr);

    // Card 3: Next Pilot (Right)
    const cardNext = document.createElement('div');
    cardNext.className = 'char-slide next';
    cardNext.innerHTML = `
      <img class="char-poster" src="${esc(next.poster)}" alt="${esc(next.name)}" onerror="this.style.display='none'">
      <div class="char-info">
        <span class="char-badge">NEXT PILOT</span>
        <div class="char-name">${esc(next.name)}</div>
        <div class="char-title">${esc(next.title)}</div>
        <div class="char-specialty">${esc(next.specialty)}</div>
      </div>
    `;
    cardNext.onclick = () => this.shiftPilot(1);
    container.appendChild(cardNext);

    this.updatePilotDots();
  }

  shiftPilot(dir) {
    if (typeof CHARACTERS === 'undefined') return;
    const N = CHARACTERS.length;
    this.chosenCharIndex = (this.chosenCharIndex + dir + N) % N;
    this.chosenCharId = CHARACTERS[this.chosenCharIndex].id;
    try { localStorage.setItem('deathRace.driver', this.chosenCharId); } catch (e) {}
    this.renderPilotCarousel();
  }

  setMenuStep(step) {
    this.menuStep = clamp(step, 1, 3);
    const panels = [
      { id: 'stagePilot', step: 1 },
      { id: 'stageTrack', step: 2 },
      { id: 'stageVehicle', step: 3 },
    ];
    for (const p of panels) {
      const el = this.$(p.id);
      if (el) el.classList.toggle('hidden', p.step !== this.menuStep);
    }
    document.querySelectorAll('#wizardNav .wizard-tab').forEach((tab) => {
      tab.classList.toggle('active', parseInt(tab.dataset.step) === this.menuStep);
    });

    if (this.menuStep === 1) {
      this.renderPilotCarousel();
    } else if (this.menuStep === 2) {
      this.updateTrackWeatherSummary();
      this.buildPreview();
    } else if (this.menuStep === 3) {
      this.updateVehicleStatsDossier();
      this.updateMenuCar();
    }
  }

  updateTrackWeatherSummary() {
    const biomeNames = {
      industrial: 'INDUSTRIAL WASTELAND',
      desert: 'SCORCHED DESERT CANYON',
      forest: 'DARK PINE FOREST',
      riverside: 'RIVER SIDE DRIVE',
      brazil: 'HIGH STREETS OF BRAZIL',
      mumbai: 'MUMBAI AFTER THE FALL',
    };
    const lightNames = {
      biome: 'BIOME DEFAULT',
      day: 'CLEAR BLUE DAY',
      sunset: 'GOLDEN SUNSET',
      night: 'NIGHT · DARK STREETS',
      storm: 'STORM DUSK',
    };
    const bName = biomeNames[this.biomeId] || this.biomeId.toUpperCase();
    const lName = lightNames[this.lightingId] || (this.lightingId ? this.lightingId.toUpperCase() : 'BIOME DEFAULT');
    const bEl = this.$('selectedBiomeName');
    if (bEl) bEl.textContent = bName;
    const lEl = this.$('selectedWeatherName');
    if (lEl) lEl.textContent = lName;

    const envFric = this.biomeId === 'desert' ? 'LOOSE SAND / ASPHALT (0.92)' : this.biomeId === 'forest' ? 'WET ASPHALT / MIST (0.96)' : 'HIGH GRIP ASPHALT (1.00)';
    const envVis = this.lightingId === 'night' ? 'HEADLIGHT VISIBILITY (35m)' : this.lightingId === 'storm' ? 'HAZY / FOGGY (60%)' : 'OPTIMAL SIGHTLINES (100%)';
    const envLux = this.lightingId === 'night' ? 'LUNAR 0.18 LUX' : this.lightingId === 'sunset' ? 'AMBER DUSK 1.4 LUX' : 'FULL SUN 2.7 LUX';
    const fricEl = this.$('envTraction');
    if (fricEl) fricEl.textContent = envFric;
    const visEl = this.$('envVisibility');
    if (visEl) visEl.textContent = envVis;
    const radEl = this.$('envRadiance');
    if (radEl) radEl.textContent = envLux;
  }

  updateVehicleStatsDossier() {
    const c = CAR_STYLES[this.playerStyle];
    if (!c) return;
    const titleEl = this.$('dossierTitle');
    if (titleEl) titleEl.textContent = c.label;
    const badgeEl = this.$('dossierBadge');
    if (badgeEl) {
      badgeEl.textContent = c.badge;
      badgeEl.className = 'car-card-badge ' + (c.badge === '3D MODEL' ? 'badge-3d' : 'badge-classic');
    }
    const blurbEl = this.$('dossierBlurb');
    if (blurbEl) blurbEl.textContent = c.blurb;
    const wmEl = this.$('previewWatermark');
    if (wmEl) wmEl.textContent = c.label;

    const speedPct = Math.min(100, Math.round((c.params.maxSpeed / 65) * 100));
    const accelPct = Math.min(100, Math.round((c.params.accel / 35) * 100));
    const armorPct = Math.min(100, Math.round((c.maxHealth / 290) * 100));
    const gripPct = Math.min(100, Math.round((c.params.grip / 1.5) * 100));
    const massPct = Math.min(100, Math.round((c.mass / 2.2) * 100));

    const sVal = this.$('statSpeedVal'); if (sVal) sVal.textContent = `${c.params.maxSpeed} u/s (${Math.round(c.params.maxSpeed * 3.6)} km/h)`;
    const sBar = this.$('statSpeedBar'); if (sBar) sBar.style.width = speedPct + '%';
    const aVal = this.$('statAccelVal'); if (aVal) aVal.textContent = `${c.params.accel} u/s²`;
    const aBar = this.$('statAccelBar'); if (aBar) aBar.style.width = accelPct + '%';
    const hVal = this.$('statArmorVal'); if (hVal) hVal.textContent = `${c.maxHealth} HP (${c.maxHealth >= 200 ? 'HEAVY TANK' : c.maxHealth >= 130 ? 'MEDIUM COMBAT' : 'LIGHT APEX'})`;
    const hBar = this.$('statArmorBar'); if (hBar) hBar.style.width = armorPct + '%';
    const gVal = this.$('statGripVal'); if (gVal) gVal.textContent = c.params.grip >= 1.2 ? 'HIGH STABILITY' : c.params.grip >= 1.0 ? 'BALANCED APEX' : 'DRIFT SPEC';
    const gBar = this.$('statGripBar'); if (gBar) gBar.style.width = gripPct + '%';
    const mVal = this.$('statMassVal'); if (mVal) mVal.textContent = c.mass >= 1.8 ? 'TITAN CRUSHER' : c.mass >= 1.2 ? 'HEAVY BATTERING' : 'LIGHT PURSUIT';
    const mBar = this.$('statMassBar'); if (mBar) mBar.style.width = massPct + '%';
  }

  shiftCar(dir) {
    const idx = CAR_ORDER.indexOf(this.playerStyle);
    const nextIdx = (idx + dir + CAR_ORDER.length) % CAR_ORDER.length;
    this.selectCar(CAR_ORDER[nextIdx]);
  }

  selectCar(key) {
    if (CAR_STYLES[key]) {
      this.playerStyle = key;
      const g = this.$('garage');
      if (g) {
        g.querySelectorAll('.biome-card').forEach((o) => o.classList.toggle('sel', o.dataset.style === key));
        const selBtn = g.querySelector(`.biome-card[data-style="${key}"]`);
        if (selBtn && selBtn.scrollIntoView) selBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      this.updateVehicleStatsDossier();
      if (this.state === 'MENU') this.updateMenuCar();
    }
  }

  bindUI() {
    document
      .querySelectorAll('.biome-card[data-biome]')
      .forEach((b) => b.addEventListener('click', () => this.setBiome(b.dataset.biome)));
    document
      .querySelectorAll('.light-card[data-light]')
      .forEach((b) => b.addEventListener('click', () => this.setLighting(b.dataset.light)));

    // Wizard Nav Tabs
    document.querySelectorAll('#wizardNav .wizard-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.setMenuStep(parseInt(tab.dataset.step)));
    });

    // Step Nav Buttons
    const btnPrev = this.$('btnPilotPrev');
    if (btnPrev) btnPrev.addEventListener('click', () => this.shiftPilot(-1));
    const btnNext = this.$('btnPilotNext');
    if (btnNext) btnNext.addEventListener('click', () => this.shiftPilot(1));
    const btnNextTrack = this.$('btnNextToTrack');
    if (btnNextTrack) btnNextTrack.addEventListener('click', () => this.setMenuStep(2));
    const btnBackPilot = this.$('btnBackToPilot');
    if (btnBackPilot) btnBackPilot.addEventListener('click', () => this.setMenuStep(1));
    const btnNextVeh = this.$('btnNextToVehicle');
    if (btnNextVeh) btnNextVeh.addEventListener('click', () => this.setMenuStep(3));
    const btnBackTrack = this.$('btnBackToTrack');
    if (btnBackTrack) btnBackTrack.addEventListener('click', () => this.setMenuStep(2));

    this.$('btnPlay').onclick = () => this.startRace();
    this.$('btnSound').onclick = () => this.toggleSound();
    this.syncSoundButton();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !this.capture) this.toggleSound();
      if (this.state === 'MENU' && !this.capture && !this.diagOpen && this.$('keys').classList.contains('hidden')) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          if (this.menuStep === 1) this.shiftPilot(-1);
          else if (this.menuStep === 3) this.shiftCar(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          if (this.menuStep === 1) this.shiftPilot(1);
          else if (this.menuStep === 3) this.shiftCar(1);
        } else if (e.code === 'Enter') {
          if (this.menuStep === 1) this.setMenuStep(2);
          else if (this.menuStep === 2) this.setMenuStep(3);
          else if (this.menuStep === 3) this.startRace();
        } else if (e.code === 'Escape' || e.code === 'Backspace') {
          if (this.menuStep === 3) this.setMenuStep(2);
          else if (this.menuStep === 2) this.setMenuStep(1);
        }
      }
    });
    this.$('btnDiagMenu').onclick = () => this.toggleDiag(true);
    this.$('btnKeys').onclick = () => this.openKeys();
    this.$('btnKeysBack').onclick = () => this.closeKeys();
    this.$('btnPresetDefault').onclick = () => this.applyPreset(null, 'Default layout restored (WASD + arrows).');
    this.$('btnPresetArrows').onclick = () => this.applyPreset(ARROW_PRESET, 'Arrow-key layout applied.');
    // Key capture: runs in the capture phase so the captured key never reaches the driving input.
    window.addEventListener('keydown', (e) => this.onCaptureKey(e), true);
    this.$('btnResume').onclick = () => this.setPaused(false);
    this.$('btnRestartP').onclick = () => {
      this.setPaused(false);
      this.startRace();
    };
    this.$('btnMenuP').onclick = () => this.toMenu();
    this.$('btnRestartR').onclick = () => this.startRace();
    this.$('btnMenuR').onclick = () => this.toMenu();
    this.$('btnRunDiag').onclick = () => this.runDiagnostics();
    this.$('btnCloseDiag').onclick = () => this.toggleDiag(false);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
      this.input.onBlur();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  buildGarage() {
    const g = this.$('garage');
    if (!g) return;
    g.innerHTML = '';
    for (const key of CAR_ORDER) {
      const c = CAR_STYLES[key];
      const b = document.createElement('button');
      b.className = `biome-card${key === this.playerStyle ? ' sel' : ''}`;
      b.dataset.style = key;
      const is3D = c.badge === '3D MODEL';
      const badgeClass = is3D ? 'badge-3d' : 'badge-classic';
      const speedPct = Math.round((c.params.maxSpeed / 65) * 100);
      const accelPct = Math.round((c.params.accel / 35) * 100);
      const armorPct = Math.round((c.maxHealth / 240) * 100);

      b.innerHTML = `
        <div class="sw" style="background:#${c.paint.toString(16).padStart(6, '0')};border:2px solid #${c.accent.toString(16).padStart(6, '0')}"></div>
        <b>${esc(c.label)} <span class="car-card-badge ${badgeClass}">${c.badge}</span></b>
        <small>${esc(c.blurb)}</small>
        <div style="margin-top:6px;padding-top:4px;border-top:1px solid #282828">
          <div class="stat-row"><span>SPD (${c.params.maxSpeed})</span><div class="stat-bar"><div class="stat-fill" style="width:${speedPct}%;background:#00d2ff"></div></div></div>
          <div class="stat-row"><span>ACC (${c.params.accel})</span><div class="stat-bar"><div class="stat-fill" style="width:${accelPct}%;background:#ffb300"></div></div></div>
          <div class="stat-row"><span>ARM (${c.maxHealth} HP)</span><div class="stat-bar"><div class="stat-fill" style="width:${armorPct}%;background:#ff3b1f"></div></div></div>
        </div>
      `;
      b.addEventListener('click', () => {
        this.selectCar(key);
      });
      g.appendChild(b);
    }
    this.updateVehicleStatsDossier();
  }

  setBiome(id) {
    this.biomeId = id;
    document
      .querySelectorAll('.biome-card[data-biome]')
      .forEach((b) => b.classList.toggle('sel', b.dataset.biome === id));
    this.updateTrackWeatherSummary();
    if (this.state === 'MENU') this.buildPreview();
  }

  setLighting(id) {
    this.lightingId = id;
    document.querySelectorAll('.light-card[data-light]').forEach((b) => b.classList.toggle('sel', b.dataset.light === id));
    this.updateTrackWeatherSummary();
    if (this.state === 'MENU') this.buildPreview();
  }

  buildPreview() {
    if (!this.previewTrack) this.previewTrack = new Track(20250);
    this.env.build(this.biomeId, this.previewTrack, 20250, this.lightingId);
    this.menuFocus.set(this.previewTrack.cx[300], this.previewTrack.cy[300] + 2, this.previewTrack.cz[300]);
    this.updateMenuCar();
  }

  updateMenuCar() {
    if (this.menuCar) {
      this.menuCar.root.removeFromParent();
      if (this.menuCar.paintMat && this.menuCar.paintMat.dispose) this.menuCar.paintMat.dispose();
      this.menuCar = null;
    }
    if (this.state !== 'MENU' || !this.menuFocus) return;
    this.menuCar = TrellisCarLoader.has(this.playerStyle)
      ? TrellisCarLoader.build(this.playerStyle)
      : ProceduralDeathCarBuilder.build(this.playerStyle);
    this.attachAccessories({ model: this.menuCar });
    const q = this.previewTrack ? this.previewTrack.query(this.menuFocus.x, this.menuFocus.z) : null;
    const groundY = q ? this.previewTrack.heightAt(q.idx, 0) : this.menuFocus.y - 2;
    this.menuCar.root.position.set(this.menuFocus.x, groundY, this.menuFocus.z);
    this.scene.add(this.menuCar.root);
  }

  upgradeRacersToTrellis() {
    for (const v of this.racers) {
      if (v.model && !v.model.isTrellisModel && TrellisCarLoader.has(v.styleKey)) {
        const oldRoot = v.model.root;
        this.scene.remove(oldRoot);
        if (v.model.paintMat && v.model.paintMat.dispose) v.model.paintMat.dispose();
        v.model = TrellisCarLoader.build(v.styleKey);
        this.attachAccessories(v);
        v.model.root.position.set(v.x, v.y, v.z);
        v.model.root.rotation.y = v.heading;
        this.scene.add(v.model.root);
      }
    }
  }

  /* --------------------------------- frame --------------------------------- */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.recordFrame(dt);

    if (this.input.consumePress('debug')) this.toggleDiag(!this.diagOpen);
    if (this.state === 'RACE') {
      if (this.input.consumePress('pause')) this.setPaused(!this.paused);
      if (this.paused) {
        this.input.clearPresses();
        this.acc = 0;
      } else {
        if (this.input.consumePress('recover')) this.playerRecover();
        if (this.input.consumePress('nitro')) this.edge.nitro = true;
        if (this.input.consumePress('secondary')) this.edge.secondary = true;
        if (this.input.consumePress('smoke')) this.edge.smoke = true;
        if (this.input.consumePress('oil')) this.edge.oil = true;
        this.acc += dt;
        let steps = 0;
        while (this.acc >= PHYS_DT && steps < MAX_PHYS_STEPS && this.state === 'RACE') {
          this.physicsStep(PHYS_DT);
          this.acc -= PHYS_DT;
          steps++;
        }
        if (steps >= MAX_PHYS_STEPS) this.acc = 0;
      }
    } else {
      this.input.clearPresses();
      this.acc = 0;
    }

    const alpha = this.state === 'RACE' ? this.acc / PHYS_DT : 1;
    if (this.state === 'MENU') this.updateMenuCamera(now);
    else if (this.player) this.updateVehicleVisuals(dt, alpha);
    if (this.state !== 'MENU') this.updateCamera(dt, alpha);
    this.updateEnvironmentVisuals(dt);
    this.updateHUD(dt);
    this.renderer.render(this.scene, this.camera);
    this.updatePerfWindow(dt);
  }

  recordFrame(dt) {
    this.frameTimes[this.frameIdx] = dt * 1000;
    this.frameIdx = (this.frameIdx + 1) % this.frameTimes.length;
    this.fpsWindow += dt;
    this.fpsFrames++;
    if (this.fpsWindow >= 0.5) {
      this.fpsText = `${Math.round(this.fpsFrames / this.fpsWindow)} fps`;
      this.$('fps').textContent =
        `${this.fpsText} · ${this.frameAvg().toFixed(1)} ms · px ${(this.renderer.getPixelRatio()).toFixed(2)}`;
      this.fpsWindow = 0;
      this.fpsFrames = 0;
    }
    // Adaptive resolution for integrated GPUs: only while racing, judged on a 2 s window.
    if (this.state === 'RACE') {
      this.adaptT += dt;
      if (this.adaptT >= 2) {
        this.adaptT = 0;
        const ms = this.frameAvg();
        if (ms > 22 && this.pixelScale > 0.6) {
          this.pixelScale = Math.round((this.pixelScale - 0.1) * 10) / 10;
          this.resize();
        } else if (ms < 13 && this.pixelScale < 1) {
          this.pixelScale = Math.round((this.pixelScale + 0.1) * 10) / 10;
          this.resize();
        }
      }
    }
  }
  frameAvg() {
    let s = 0;
    let n = 0;
    for (const t of this.frameTimes)
      if (t > 0) {
        s += t;
        n++;
      }
    return n ? s / n : 0;
  }
  frameP95() {
    const a = Array.from(this.frameTimes)
      .filter((t) => t > 0)
      .sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(Math.max(0.5, dpr * this.pixelScale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setScale(this.renderer.domElement.height, this.camera.fov);
  }

  updatePerfWindow(dt) {
    this._perfT = (this._perfT || 0) + dt;
    if (this._perfT < 0.5) return;
    this._perfT = 0;
    const info = this.renderer.info;
    if (this.diagOpen) {
      this.$('perf').textContent =
        `Performance: ${this.fpsText} · frame avg ${this.frameAvg().toFixed(2)} ms · p95 ${this.frameP95().toFixed(2)} ms · draw calls ${info.render.calls} · triangles ${info.render.triangles} · geometries ${info.memory.geometries} · textures ${info.memory.textures} · pixel scale ${this.pixelScale.toFixed(1)} (adaptive, integrated-GPU target)`;
    }
  }

  /* --------------------------- fixed-step simulation ----------------------- */
  physicsStep(dt) {
    const R = this.racers;
    const tr = this.track;
    const race = this.race;
    const env = this.env;
    const racing = race.phase === 'RACING' || race.phase === 'FINISHING';
    const ctx = this.weaponCtx;
    ctx.obstacles = env.obstacles;
    ctx.track = tr;
    ctx.vehicles = R;
    ctx.audio = this.audio;
    const nitroEdge = this.edge.nitro;
    const secEdge = this.edge.secondary;
    const smokeEdge = this.edge.smoke;
    const oilEdge = this.edge.oil;
    this.edge.nitro = false;
    this.edge.secondary = false;
    this.edge.smoke = false;
    this.edge.oil = false;

    // (1) snapshot previous pose; cooldown timers
    for (const v of R) {
      v.px = v.x;
      v.pz = v.z;
      v.ph = v.heading;
      v.py = v.y;
      v.fireCool = Math.max(0, v.fireCool - dt);
      v.rocketCool = Math.max(0, v.rocketCool - dt);
    }
    // (1b) hazards: smoke clouds drift and thin, oil sets each car's traction, ram cooldowns tick down, road traps check collision
    this.smoke.update(dt);
    this.oil.update(dt);
    if (this.traps) this.traps.update(dt, R, this.particles, this.audio, this.hud, this);
    for (const [k, t] of this.pairCool) {
      if (t - dt <= 0) this.pairCool.delete(k);
      else this.pairCool.set(k, t - dt);
    }
    for (const v of R) this.oil.applyTo(v, dt);

    // (2) intent: player from keyboard, AI from its driver; then weapons
    for (const v of R) {
      let inp;
      if (v.isPlayer) {
        const c = this.input.controls();
        const live = this.race.phase === 'RACING' && !v.race.finished && !v.wrecked;
        inp = {
          throttle: live && c.throttle,
          brake: live && c.brake,
          steer: live ? c.steer : 0,
          nitro: live && nitroEdge,
          handbrake: live && c.handbrake,
          fire: live && c.fire,
          secondary: live && secEdge,
          smoke: live && smokeEdge,
          oil: live && oilEdge,
        };

        // Auto-track nearest rival within a ±32° forward cone (up to 90m)
        let lockTarget = null;
        let bestLockScore = Number.POSITIVE_INFINITY;
        for (const o of R) {
          if (o === v || o.wrecked) continue;
          const dx = o.x - v.x;
          const dz = o.z - v.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 90 || dist < 1) continue;
          const relYaw = wrapAngle(Math.atan2(dx, dz) - v.heading);
          if (Math.abs(relYaw) > 0.56) continue; // ~32 deg cone
          const score = dist + Math.abs(relYaw) * 25;
          if (score < bestLockScore) {
            bestLockScore = score;
            lockTarget = { car: o, relYaw, dist };
          }
        }
        v.lockTarget = lockTarget;
        WeaponSystem.slewTurret(v, lockTarget ? lockTarget.relYaw : 0, dt);
      } else {
        inp = v.aiDriver.update(dt, { vehicles: R, racing, blindAt: this.blindAtFn, traps: this.traps ? this.traps.traps : null });
      }
      v.frameInput = inp;
      if (inp.fire && !v.wrecked) WeaponSystem.fireMachineGun(v, ctx);
      if (inp.secondary && WeaponSystem.canLaunchRocket(v)) this.launchRocket(v);
      if (inp.smoke && !v.wrecked) this.deploySmoke(v);
      if (inp.oil && !v.wrecked) this.deployOil(v);
    }

    // (3) drivetrain, grip, steering and integration
    for (const v of R) VehiclePhysics.step(v, v.frameInput, dt);
    const pl = this.player;
    const boosting = !!(pl && pl.nitroActive);
    if (boosting && !this.nitroWas) this.audio.nitro();
    this.nitroWas = boosting;

    // (4) collisions: barriers, obstacles, then car-to-car, then one barrier re-check
    for (const v of R) {
      const r = CollisionSystem.resolveBarriers(v, tr);
      this.onWallContact(v, r);
      const o = CollisionSystem.resolveCircles(v, env.obstacles);
      if (o.impact > 8) this.damage(v, (o.impact - 8) * 0.9);
    }
    for (let a = 0; a < R.length; a++) {
      for (let b = a + 1; b < R.length; b++) {
        const c = CollisionSystem.resolvePair(R[a], R[b]);
        if (c && c.impact > RAM.threshold) this.onCarContact(R[a], R[b], c);
      }
    }
    for (const v of R) {
      const r = CollisionSystem.resolveBarriers(v, tr);
      this.onWallContact(v, r);
    }

    // (5) sanitize, snap to road surface, refresh last-good snapshot
    for (const v of R) {
      if (!VehiclePhysics.sanitize(v)) {
        v.px = v.x;
        v.pz = v.z;
        v.py = v.y;
        v.ph = v.heading;
      }
      const surf = VehiclePhysics.surfaceStep(v, tr, dt);
      if (surf.takeoff && v.isPlayer) this.hud.message('AIRBORNE', 1.2);
      if (surf.landed > 6) {
        this.damage(v, (surf.landed - 6) * 2.2);
        this.audio.crash(v.x, v.z, clamp(surf.landed / 20, 0.3, 1.2));
        if (v.isPlayer) {
          this.shake = Math.max(this.shake, 0.4);
          this.hud.message(`HARD LANDING · ${surf.landed.toFixed(0)} u/s`, 1.6);
        }
        this.particles.sparksAt(v.x, v.y + 0.4, v.z, 10, 1.0);
      }
      VehiclePhysics.snapshot(v);
    }

    // (6) race progress (gates, laps), phase machine, standings
    for (const v of R) {
      const lapBefore = v.race.lap;
      const k = this.race.processVehicle(v, v.px, v.pz);
      if (v.isPlayer && v.race.lap !== lapBefore) {
        const lapTime = this.race.time - v.race.lastLapClock;
        this.hud.message(`LAP ${v.race.lap} · ${formatTime(lapTime)}`, 2.6);
        v.race.lastLapClock = this.race.time;
      }
      if (v.isPlayer && k === 0 && v.race.finished && !this.finishShown) {
        this.finishShown = true;
        this.hud.message(`FINISHED — ${ORDINAL[v.race.finishPos] || `${v.race.finishPos}th`}`, 4);
      }
    }
    this.race.step(dt, R);

    // (7) wrecks, teleports and stall failsafe
    for (const v of R) this.updateRecovery(v, dt);

    // (8) pickups and rockets
    for (const e of this.pickups.update(dt, R)) {
      if (e.vehicle.isPlayer) {
        this.hud.pickup(PICKUP_INFO[e.type].label);
        this.audio.pickup();
      }
    }
    this.rockets.update(dt, ctx);

    if (this.race.phase === 'OVER') this.endRace();
  }

  launchRocket(v) {
    const m = WeaponSystem.muzzleOrigin(v);
    const r = this.rockets.spawn(v, m.x, m.z, m.yaw);
    if (!r) return;
    v.rockets--;
    v.rocketCool = WEAPON.rocketCooldown;
    this.visuals.muzzle(v);
    this.audio.rocket(m.x, m.z, v.isPlayer);
    this.particles.puff(m.x, v.y + 1.0, m.z, v.vx * 0.2, 0.4, v.vz * 0.2, 1.4, 0.8, 0.6, 0.6, 0.6, 0.4);
  }

  damage(v, amt, attacker = null) {
    const shieldBefore = v.shieldPts;
    if (WeaponSystem.applyDamage(v, amt)) this.onDestroyed(v, attacker);
    if (v.isPlayer && shieldBefore > 0 && v.shieldPts < shieldBefore) this.audio.shield();
  }

  onWallContact(v, r) {
    if (!r || !(r.impact > 0)) return;
    const f = clamp(r.impact / 22, 0.25, 1.4);
    this.audio.scrape(r.x, r.z, f);
    this.particles.sparksAt(r.x, v.y + 0.5, r.z, Math.round(4 + 8 * f), f);
    if (v.isPlayer) this.shake = Math.max(this.shake, 0.25 * f);
    if (r.impact > 8) this.damage(v, (r.impact - 8) * 0.9);
  }

  /** Ramming: a small hull chip per contact event, charged at most once per pair per cooldown window. */
  onCarContact(A, B, c) {
    this.particles.sparksAt(
      c.x,
      A.y + 0.7,
      c.z,
      Math.round(6 + 6 * clamp(c.impact / 20, 0, 1)),
      clamp(c.impact / 20, 0.3, 1.3),
    );
    if (A.isPlayer || B.isPlayer) this.shake = Math.max(this.shake, 0.3);
    const key = A.id < B.id ? `${A.id}:${B.id}` : `${B.id}:${A.id}`;
    if (this.pairCool.has(key)) return;
    this.pairCool.set(key, RAM.cooldown);
    this.audio.crash(c.x, c.z, clamp(c.impact / 20, 0.3, 1.2));
    const toB = ramChip(c.impact, A.loadout.blades);
    const toA = ramChip(c.impact, B.loadout.blades);
    if (toB > 0) this.damage(B, toB, A);
    if (toA > 0) this.damage(A, toA, B);
  }

  /** Smoke canister out of the back: a drifting cloud that blinds anyone who drives into it. */
  deploySmoke(v) {
    if (!v.loadout.gear) {
      if (v.isPlayer) this.hud.message('LOCKED · PICK UP NEON GEAR', 1.4);
      return;
    }
    if (v.smokeCharges <= 0) {
      if (v.isPlayer) this.hud.message('NO SMOKE LEFT', 1.2);
      return;
    }
    v.smokeCharges--;
    const x = v.x - Math.sin(v.heading) * 5;
    const z = v.z - Math.cos(v.heading) * 5;
    this.smoke.spawn(x, z, v.vx * 0.3, v.vz * 0.3);
    this.audio.smoke(x, z);
    this.particles.puff(x, v.y + 1.0, z, 0, 0.4, 0, 1.4, 0.8, 0.6, 0.6, 0.6, 0.4);
    if (v.isPlayer) this.hud.message(`SMOKE SCREEN · ${v.smokeCharges} LEFT`, 1.2);
  }

  /** Oil slick dropped behind the car, set onto the road surface. */
  deployOil(v) {
    if (!v.loadout.gear) {
      if (v.isPlayer) this.hud.message('LOCKED · PICK UP NEON GEAR', 1.4);
      return;
    }
    if (v.oilCharges <= 0) {
      if (v.isPlayer) this.hud.message('NO OIL LEFT', 1.2);
      return;
    }
    v.oilCharges--;
    const x = v.x - Math.sin(v.heading) * 4.5;
    const z = v.z - Math.cos(v.heading) * 4.5;
    const q = this.track.query(x, z);
    const ground = this.track.poseAt(q.idx, q.lat).y;
    this.oil.spawn(x, z, ground);
    this.audio.oil(x, z);
    if (v.isPlayer) this.hud.message(`OIL SLICK · ${v.oilCharges} LEFT`, 1.2);
  }

  /** Shared accessory assets (built once, attached to each car when it is placed on the grid). */
  buildAccessoryAssets() {
    return {
      shieldGeo: new THREE.SphereGeometry(1, 18, 12),
      shieldMat: new THREE.MeshBasicMaterial({ color: 0x3ab0ff, transparent: true, opacity: 0.2, depthWrite: false }),
      gearGeo: new THREE.BoxGeometry(0.12, 0.08, 5.4),
      gearMat: new THREE.MeshBasicMaterial({ color: 0x39ff88 }),
      bladeGeo: new THREE.BoxGeometry(0.1, 0.55, 2.6),
      bladeMat: new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.9, roughness: 0.2 }),
    };
  }

  /** Adds the shield bubble, neon gear and crossed blades to a car. Each is shown only once unlocked. */
  attachAccessories(v) {
    const A = this.accAssets;
    const m = v.model;
    const shield = new THREE.Mesh(A.shieldGeo, A.shieldMat);
    shield.scale.set(2.5, 1.6, 3.6);
    shield.position.set(0, 1.2, 0);
    shield.name = 'shield_bubble';
    shield.visible = false;
    m.tilt.add(shield);
    m.shieldMesh = shield;
    const gear = new THREE.Group();
    gear.name = 'neon_gear';
    for (const x of [-1.25, 1.25]) {
      const strip = new THREE.Mesh(A.gearGeo, A.gearMat);
      strip.position.set(x, 0.25, 0);
      gear.add(strip);
    }
    gear.visible = false;
    m.tilt.add(gear);
    m.gearGroup = gear;
    const blades = new THREE.Group();
    blades.name = 'crossed_blades';
    for (const x of [-1.05, 1.05]) {
      const b = new THREE.Mesh(A.bladeGeo, A.bladeMat);
      b.position.set(x, 0.7, 3.2);
      b.rotation.y = -Math.sign(x) * 0.35;
      blades.add(b);
    }
    blades.visible = false;
    m.tilt.add(blades);
    m.bladeGroup = blades;
  }

  /** Wreck countdown and automatic respawn for AI; teleport requests; stall failsafe for all. */
  updateRecovery(v, dt) {
    if (v.wrecked) {
      v.wreckTimer = Math.max(0, v.wreckTimer - dt);
      if (!v.isPlayer && v.wreckTimer <= 0) this.rebuildWrecked(v);
      return;
    }
    if (v.stuck.teleportRequest) {
      v.stuck.teleportRequest = false;
      this.respawnVehicle(v, false);
      return;
    }
    const pinned =
      !v.race.finished &&
      VehiclePhysics.speed(v) < 1.0 &&
      Math.abs(v.trackLat) > ROAD_HALF - 1.5 &&
      (v.frameInput.throttle || v.frameInput.brake);
    v.stallT = pinned ? v.stallT + dt : 0;
    if (v.stallT > 3) {
      v.stallT = 0;
      this.respawnVehicle(v, false);
      if (v.isPlayer) this.hud.message('STALLED AGAINST BARRIER — RECOVERED', 2.4);
    }
  }

  respawnVehicle(v, repair) {
    RaceManager.safeRespawn(v, this.track, this.racers);
    if (repair || v.wrecked) {
      v.wrecked = false;
      v.wreckTimer = 0;
      v.health = WEAPON.respawnHealth;
      v.nitroActive = false;
      v.throttle = false;
      v.brake = false;
    }
    v.stallT = 0;
    v.frameInput = this.zeroInput;
    VehiclePhysics.resetSurface(v, this.track);
    v.px = v.x;
    v.pz = v.z;
    v.py = v.y;
    v.ph = v.heading;
  }

  /** HUD line for a wrecked car: the rebuild countdown first, then the rule. */
  wreckText(p) {
    if (p.wreckTimer > 0) return `WRECKED — REBUILD IN ${Math.ceil(p.wreckTimer)} S`;
    return `WRECKED — PRESS R TO REBUILD ${WRECK_PENALTY.backM} M BACK`;
  }

  /**
   * Rebuild after a wreck: placed WRECK_PENALTY.backM of track arc behind the wreck site (not behind where the
   * coasting car stopped), repaired, at rest.
   * Used for AI when the wreck timer ends and for the player on R.
   */
  rebuildWrecked(v) {
    RaceManager.recoverBehind(v, this.track, this.racers, WRECK_PENALTY.backM, v.wreckIdx);
    v.wrecked = false;
    v.wreckTimer = 0;
    v.health = WEAPON.respawnHealth;
    v.nitroActive = false;
    v.throttle = false;
    v.brake = false;
    v.stallT = 0;
    v.frameInput = this.zeroInput;
    v.px = v.x;
    v.pz = v.z;
    v.py = v.y;
    v.ph = v.heading;
    VehiclePhysics.snapshot(v);
  }

  playerRecover() {
    const p = this.player;
    if (!p || this.race.phase !== 'RACING' || p.race.finished || this.recoverCD > 0) return;
    if (p.wrecked && p.wreckTimer > 0) return; // a wreck must wait out its rebuild timer
    this.recoverCD = 0.6;
    const wasWrecked = p.wrecked;
    if (wasWrecked) {
      this.rebuildWrecked(p);
    } else {
      RaceManager.recoverBehind(p, this.track, this.racers, 50);
      p.frameInput = this.zeroInput;
      p.stallT = 0;
      p.px = p.x;
      p.pz = p.z;
      p.py = p.y;
      p.ph = p.heading;
      VehiclePhysics.snapshot(p);
    }
    this.hud.wreck(false);
    this.hud.message(
      wasWrecked ? `REBUILT — ${WRECK_PENALTY.backM} M BACK ON THE TRACK` : 'RECOVERED — 50 M BACK ON THE TRACK',
      2,
    );
  }

  onDestroyed(v, attacker = null) {
    this.particles.fireAt(v.x, v.y + 1.0, v.z);
    this.particles.sparksAt(v.x, v.y + 1.0, v.z, 22, 1.5);
    this.visuals.explosion(v.x, v.z, 7);
    this.audio.explosion(v.x, v.z, 9, v.isPlayer);
    this.detachArmor(v, 3);
    const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
    this.shake = Math.max(this.shake, 0.9 * clamp(1 - d / 80, 0, 1));
    v.wreckIdx = this.track.query(v.x, v.z, v.trackIdx).idx; // the rebuild counts back from the wreck site
    const penalised = RaceManager.applyWreckPenalty(v);

    const killerName = attacker ? (attacker.isPlayer ? 'YOU' : attacker.name) : null;
    const victimName = v.isPlayer ? 'YOU' : v.name;

    if (killerName && killerName !== victimName) {
      this.hud.addKillfeed(killerName, victimName, attacker.isPlayer);
      if (attacker.isPlayer) {
        this.hud.message(`ELIMINATED ${victimName.toUpperCase()} — +500 PTS`, 3.0);
        this.hud.pickup(`ELIMINATED ${victimName.toUpperCase()} (+500 PTS)`);
      }
    } else {
      this.hud.addKillfeed('TRACK HAZARD', victimName, false);
    }

    if (v.isPlayer) {
      this.hud.wreck(true, this.wreckText(v));
      this.hud.message(penalised ? `HULL DESTROYED — +${WRECK_PENALTY.seconds} S PENALTY` : 'HULL DESTROYED', 2.4);
    }
  }

  detachArmor(v, n) {
    if (!v.model) return;
    v.model.root.updateMatrixWorld(true);
    for (let k = 0; k < n; k++) {
      const m = ProceduralDeathCarBuilder.detachPlate(v.model, this.rng);
      if (!m) break;
      const c = m.clone();
      c.visible = true;
      m.getWorldPosition(this._tv);
      m.getWorldQuaternion(this._tq);
      c.quaternion.copy(this._tq);
      const a = this.rng() * TAU;
      const s = 4 + this.rng() * 5;
      this.particles.spawnDebris(
        c,
        this._tv.clone(),
        new THREE.Vector3(Math.cos(a) * s * 0.5, 5 + this.rng() * 4, Math.sin(a) * s * 0.5),
      );
    }
  }

  makeFx() {
    return {
      tracer: (x0, y0, z0, x1, y1, z1) => this.visuals.tracer(x0, y0, z0, x1, y1, z1),
      muzzle: (v) => {
        this.visuals.muzzle(v);
        this.audio.gun(v.x, v.z, v.isPlayer);
      },
      impact: (x, z, kind) => {
        this.particles.sparksAt(x, this.groundAt(x, z) + 0.9, z, kind === 'vehicle' ? 10 : 5, 0.8);
        if (kind === 'vehicle') this.audio.impact(x, z, 0.6);
      },
      onHit: (v, dmg, f, destroyed, attacker = null) => {
        if (destroyed) {
          this.onDestroyed(v, attacker);
          return;
        }
        this.particles.sparksAt(v.x, v.y + 1.0, v.z, 8, 1.0);
        if (f > 0.6) this.detachArmor(v, 1); // rocket splash tears off armour
        if (v.isPlayer) this.shake = Math.max(this.shake, 0.35 * f + 0.1);
      },
      explosion: (x, z, R) => {
        const y = this.groundAt(x, z);
        this.visuals.explosion(x, z, R);
        this.audio.explosion(x, z, R);
        this.particles.fireAt(x, y + 0.5, z);
        this.particles.sparksAt(x, y + 0.6, z, 20, 1.5);
        this.shakeAt(x, z, 1.1);
      },
      rocketTrail: (x, z) =>
        this.particles.puff(x, this.groundAt(x, z) + 1.2, z, 0, 0.6, 0, 1.6, 0.9, 0.55, 0.55, 0.55, 0.35),
    };
  }

  shakeAt(x, z, amt) {
    if (!this.player) return;
    const d = Math.hypot(x - this.player.x, z - this.player.z);
    this.shake = Math.max(this.shake, amt * clamp(1 - d / 70, 0, 1));
  }

  groundAt(x, z) {
    if (!this.track) return 0;
    const q = this.track.query(x, z);
    return this.track.heightAt(q.idx, clamp(q.lat, -ROAD_HALF - 3, ROAD_HALF + 3));
  }

  /* ----------------------------- race lifecycle ---------------------------- */
  startRace() {
    this.audio.unlock();
    this.audio.pause(false);
    this.clearRaceObjects();
    this.countBeep = null;
    this.goBeep = false;
    this.nitroWas = false;
    this.raceSeed = (Math.random() * 1e9) | 0;
    this.track = new Track(this.raceSeed);
    this.env.build(this.biomeId, this.track, this.raceSeed, this.lightingId);
    this.pickups = new PickupSystem(this.track, this.scene);
    this.traps = new RoadTrapSystem(this.track, this.scene);

    const playerChar =
      (typeof CHARACTERS !== 'undefined' ? CHARACTERS.find((c) => c.id === this.chosenCharId) : null) ||
      (typeof CHARACTERS !== 'undefined' ? CHARACTERS[0] : { name: 'Player Driver' });
    const rivalPool = typeof CHARACTERS !== 'undefined' ? CHARACTERS.filter((c) => c.id !== playerChar.id) : [];
    const shuffledRivals = [...rivalPool].sort(() => Math.random() - 0.5);

    const order = CAR_ORDER.indexOf(this.playerStyle);
    const styles = [this.playerStyle];
    for (let k = 1; k <= RACE_RIVALS; k++) styles.push(CAR_ORDER[(order + k) % CAR_ORDER.length]);
    this.racers = styles.map((style, k) => {
      const v = makeVehicleState(k + 1, style, k === 0);
      const driver = k === 0 ? playerChar : shuffledRivals[(k - 1) % shuffledRivals.length] || { name: `Rival ${k}` };
      v.driver = driver;
      v.name = driver.name;
      v.displayName = k === 0 ? `YOU (${driver.name})` : driver.name;
      const slot = this.track.gridSlot(k);
      v.x = slot.x;
      v.y = slot.y;
      v.z = slot.z;
      v.heading = slot.hd;
      v.trackIdx = slot.idx;
      v.race.lastS = slot.idx * this.track.ds;
      v.race.nextGate = 1;
      v.race.prevGate = -1;
      v.race.lap = 0;
      v.race.raceDist = 0;
      v.race.lastLapClock = 0;
      v.model = TrellisCarLoader.has(style)
        ? TrellisCarLoader.build(style)
        : ProceduralDeathCarBuilder.build(style);
      this.attachAccessories(v);
      this.scene.add(v.model.root);
      v.aiDriver = k === 0 ? null : new AIDriver(v, this.track, (this.raceSeed + k * 7919) | 0, 0.9 + k * 0.05);
      v.frameInput = this.zeroInput;
      v.stallT = 0;
      v.trackLat = 0;
      v.turretYaw = 0;
      VehiclePhysics.resetSurface(v, this.track);
      v.px = v.x;
      v.pz = v.z;
      v.ph = v.heading;
      v.py = v.y;
      VehiclePhysics.snapshot(v);
      return v;
    });
    this.player = this.racers[0];
    this.race = new RaceManager(this.track, this.racers);
    this.weaponCtx.vehicles = this.racers;
    this.weaponCtx.obstacles = this.env.obstacles;
    this.weaponCtx.track = this.track;
    this.visuals.reset();
    this.rockets.clear();
    this.smoke.reset();
    this.oil.reset();
    this.pairCool.clear();
    this.particles.clear();
    this.edge = { nitro: false, secondary: false, smoke: false, oil: false };
    this.state = 'RACE';
    this.paused = false;
    this.acc = 0;
    this.shake = 0;
    this.finishShown = false;
    this.syncPreventDefaults();
    this.camSnap = true;
    this.recoverCD = 0;
    this.input.clearPresses();
    if (document.activeElement?.blur) document.activeElement.blur();
    this.setOverlay(null);
    this.hud.visible(true);
    this.hud.wreck(false);
    this.hud.txt('biomeTag', BIOMES[this.biomeId].label);
    this.hud.txt('vehTag', `${CAR_STYLES[this.playerStyle].label} · ${playerChar.name}`);
    this.hud.message('', 0);
    this.initMinimap();
  }

  endRace() {
    this.state = 'OVER';
    this.paused = false;
    this.syncPreventDefaults();
    const list = this.race.rank(this.racers);
    const rows = list
      .map((v) => {
        const res = v.race.finished ? formatTime(v.race.finishTime + v.race.penaltyS) : 'DNF';
        const displayName = v.displayName || (v.isPlayer ? `YOU (${v.name})` : v.name);
        return (
          `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 4px;border-bottom:1px solid #2a2a2a;${v.isPlayer ? 'color:#ffb300' : ''}">` +
          `<span>${v.race.position}. ${esc(displayName)} · ${esc(CAR_STYLES[v.styleKey].label)}</span><span>${res} · laps ${Math.min(v.race.lap, LAPS_TO_FINISH)}/${LAPS_TO_FINISH}</span></div>`
        );
      })
      .join('');
    const p = this.player;
    this.$('resTitle').textContent = p.race.finished
      ? `${ORDINAL[p.race.finishPos] || `${p.race.finishPos}th`} PLACE`
      : 'RACE OVER';
    this.$('resultsBody').innerHTML =
      `${rows}<div style="margin-top:10px;color:#aaa;font-size:13px">Race time ${formatTime(this.race.time)}${p.race.penaltyS > 0 ? ` · wreck penalty +${p.race.penaltyS.toFixed(0)} s (${p.race.wrecks} wreck${p.race.wrecks === 1 ? '' : 's'})` : ''} · biome ${esc(BIOMES[this.biomeId].label)} · track seed ${this.raceSeed}</div>`;
    this.hud.visible(false);
    this.hud.wreck(false);
    this.setOverlay('results');
  }

  clearRaceObjects() {
    if (this.menuCar) {
      this.menuCar.root.removeFromParent();
      if (this.menuCar.paintMat && this.menuCar.paintMat.dispose) this.menuCar.paintMat.dispose();
      this.menuCar = null;
    }
    for (const v of this.racers) {
      if (v.model) {
        v.model.root.removeFromParent();
        if (v.model.paintMat && v.model.paintMat.dispose) v.model.paintMat.dispose();
        v.model = null;
      }
    }
    if (this.pickups) {
      this.pickups.dispose();
      this.pickups = null;
    }
    if (this.traps) {
      this.traps.dispose();
      this.traps = null;
    }
    this.racers = [];
    this.player = null;
    this.race = null;
    this.oil.reset();
    this.smoke.reset();
    this.audio.stopEngines();
    this.particles.clear();
  }

  toMenu() {
    this.clearRaceObjects();
    this.state = 'MENU';
    this.paused = false;
    this.audio.pause(false);
    this.syncPreventDefaults();
    this.hud.visible(false);
    this.hud.wreck(false);
    this.setOverlay('menu');
    this.renderCtrlSummary();
    this.buildPreview();
    this.updateDiagButton();
    this.setMenuStep(this.menuStep || 1);
  }

  setPaused(on) {
    if (this.state !== 'RACE') return;
    this.paused = on;
    this.audio.pause(on);
    this.setOverlay(on ? 'pause' : null);
  }
  autoPause() {
    if (this.state === 'RACE' && !this.paused) this.setPaused(true);
  }

  setOverlay(which) {
    this.$('menu').classList.toggle('hidden', which !== 'menu');
    this.$('pause').classList.toggle('hidden', which !== 'pause');
    this.$('results').classList.toggle('hidden', which !== 'results');
    this.$('keys').classList.toggle('hidden', which !== 'keys');
  }

  /** Default browser key actions (scrolling, Space-to-click, arrows) are suppressed only during a race. */
  syncPreventDefaults() {
    this.input.preventDefaults = this.state === 'RACE';
  }

  /* ------------------------------- controls UI ------------------------------ */
  renderCtrlSummary() {
    const rows = ACTION_ORDER.map(
      (a) =>
        `<div><span>${esc(ACTION_LABELS[a])}</span><kbd>${esc(this.input.bindings[a].map(keyLabel).join(' / '))}</kbd></div>`,
    );
    rows.push('<div><span>Pause</span><kbd>Esc</kbd></div>');
    this.$('ctrlSummary').innerHTML = rows.join('');
  }

  openKeys() {
    this.capture = null;
    this.renderKeyRows('Choose Change next to an action, then press the new key.');
    this.setOverlay('keys');
  }

  closeKeys() {
    this.capture = null;
    this.setOverlay('menu');
    this.renderCtrlSummary();
  }

  renderKeyRows(status) {
    const tb = this.$('keyRows');
    tb.innerHTML = `${ACTION_ORDER.map(
      (a) => `<tr>
        <td>${esc(ACTION_LABELS[a])}</td>
        <td><kbd>${esc(this.input.bindings[a].map(keyLabel).join(' / '))}</kbd></td>
        <td style="text-align:right"><button class="btn alt" data-act="${a}" style="padding:6px 12px">${this.capture === a ? 'Press a key…' : 'Change'}</button></td>
      </tr>`,
    ).join(
      '',
    )}<tr><td>Pause / resume</td><td><kbd>Esc</kbd></td><td style="text-align:right;color:#777;font-size:12px">fixed</td></tr>`;
    tb.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = () => {
        this.capture = b.dataset.act;
        this.renderKeyRows(`Press the new key for “${ACTION_LABELS[this.capture]}”. Esc cancels.`);
      };
    });
    this.$('keyStatus').textContent = status;
  }

  onCaptureKey(e) {
    if (this.$('keys').classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!this.capture) {
      if (e.code === 'Escape') this.closeKeys();
      return;
    }
    if (e.code === 'Escape') {
      this.capture = null;
      this.renderKeyRows('Change cancelled.');
      return;
    }
    const action = this.capture;
    const owner = this.input.codeToAction.get(e.code);
    const prev = this.input.bindings[action][0];
    if (!this.input.assign(action, e.code)) {
      this.renderKeyRows('That key cannot be used.');
      return;
    }
    this.capture = null;
    this.saveBindings();
    const swapped = owner && owner !== action ? ` ${ACTION_LABELS[owner]} moved to ${keyLabel(prev)}.` : '';
    this.renderKeyRows(`${ACTION_LABELS[action]} is now ${keyLabel(e.code)}.${swapped}`);
  }

  applyPreset(preset, text) {
    this.capture = null;
    this.input.setBindings(preset);
    this.saveBindings();
    this.renderKeyRows(text);
  }

  toggleDiag(on) {
    this.diagOpen = on;
    this.$('diag').classList.toggle('hidden', !on);
    if (on) this.renderDiag();
  }

  /* -------------------------------- visuals -------------------------------- */
  updateVehicleVisuals(dt, alpha) {
    const desert = this.biomeId === 'desert';
    for (const v of this.racers) {
      const m = v.model;
      if (!m) continue;
      m.turretNode.visible = !!v.loadout.gun;
      for (const pod of m.rocketPods) pod.visible = !!v.loadout.rockets;
      m.shieldMesh.visible = v.shieldPts > 0;
      m.gearGroup.visible = !!v.loadout.gear;
      m.bladeGroup.visible = !!v.loadout.blades;
      const x = lerp(v.px, v.x, alpha);
      const y = lerp(v.py, v.y, alpha);
      const z = lerp(v.pz, v.z, alpha);
      const h = lerpAngle(v.ph, v.heading, alpha);
      m.root.position.set(x, y, z);
      m.root.rotation.y = h;
      const roll = v.wrecked ? 0.28 : clamp(v.omega * v.u * 0.0035, -0.09, 0.09); // +omega = left turn: lean right (outward)
      m.tilt.rotation.z = roll;
      m.tilt.rotation.x = v.wrecked ? 0.08 : v.nitroActive ? -0.035 : 0;
      m.turretNode.rotation.y = v.turretYaw;
      const spin = (v.u * dt) / 0.62;
      for (const w of m.wheels) {
        w.spin.rotation.x += spin;
        if (w.front) w.steer.rotation.y = v.steerAngle;
      }
      ProceduralDeathCarBuilder.updateDamage(m, clamp(v.health / v.maxHealth, 0, 1));

      if ((v.health < 40 && !v.wrecked) || v.wrecked) {
        v.smokeAcc += dt;
        if (v.smokeAcc > 0.09) {
          v.smokeAcc = 0;
          this.particles.puff(x, y + 1.6, z, 0, 2.6, 0, 2.2, 1.7, 0.13, 0.12, 0.11, 0.5);
        }
      }
      if (v.nitroActive) {
        for (const a of m.anchors) {
          if (!a || Math.random() > 0.5) continue;
          a.getWorldPosition(this._tv);
          this.particles.puff(this._tv.x, this._tv.y, this._tv.z, 0, 0.3, 0, 0.9, 0.22, 0.45, 0.75, 1.0, 0.55);
        }
      }
      if (desert && !v.wrecked && Math.abs(v.u) > 8) {
        v.dustAcc += dt;
        if (v.dustAcc > 0.06) {
          v.dustAcc = 0;
          const bx = x - Math.sin(h) * 3.2;
          const bz = z - Math.cos(h) * 3.2;
          this.particles.puff(
            bx,
            y + 0.3,
            bz,
            -Math.sin(h) * 2,
            0.8,
            -Math.cos(h) * 2,
            2.8,
            1.6,
            0.78,
            0.64,
            0.42,
            0.32,
          );
        }
      }
    }
  }

  updateCamera(dt, alpha) {
    const p = this.player;
    if (!p) return;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    const z = lerp(p.pz, p.z, alpha);
    const h = lerpAngle(p.ph, p.heading, alpha);
    const sp = Math.abs(p.u);
    const back = 9.5 + clamp(sp / 12, 0, 2.5);
    const dx = x - Math.sin(h) * back;
    const dz = z - Math.cos(h) * back;
    const dy = y + 4.1 + clamp(sp / 40, 0, 1.2);
    if (this.camSnap) {
      this.camPos.set(dx, dy, dz);
      this.camSnap = false;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      this.camPos.x += (dx - this.camPos.x) * k;
      this.camPos.y += (dy - this.camPos.y) * k;
      this.camPos.z += (dz - this.camPos.z) * k;
    }
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * 0.7;
      this.camPos.x += (Math.random() - 0.5) * s;
      this.camPos.y += (Math.random() - 0.5) * s * 0.6;
      this.camPos.z += (Math.random() - 0.5) * s;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(x + Math.sin(h) * 8, y + 1.3, z + Math.cos(h) * 8);
    const fov = 68 + clamp(sp / 50, 0, 1) * 10;
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateMenuCamera(now) {
    const t = now * 0.00005;
    const f = this.menuFocus;
    this.camera.position.set(f.x + Math.cos(t * 4) * 26, f.y + 9, f.z + Math.sin(t * 4) * 26);
    this.camera.lookAt(f.x, f.y + 0.8, f.z);
    if (this.menuCar && this.menuCar.root) {
      this.menuCar.root.rotation.y = now * 0.0008;
    }
  }

  /** Engines, tyre squeal, listener position and countdown cues. Runs once per frame. */
  updateAudio() {
    const A = this.audio;
    if (!A.ctx) return;
    if (this.state !== 'RACE' || !this.player || !this.race) {
      A.stopEngines();
      return;
    }
    A.setListener(this.player.x, this.player.z);
    A.updateEngines(this.racers);
    A.updateSkid(this.player);
    if (this.race.phase === 'COUNTDOWN') {
      const n = Math.max(1, Math.ceil(this.race.countdown - 0.6));
      if (n !== this.countBeep) {
        this.countBeep = n;
        A.beep(false);
      }
    } else if (this.race.goFlash > 0 && !this.goBeep) {
      this.goBeep = true;
      A.beep(true);
    }
  }

  updateEnvironmentVisuals(dt) {
    this.updateAudio();
    const cam = this.camera.position;
    if (this.env.skyMesh) this.env.skyMesh.position.copy(cam);
    if (this.player) this.env.updateSunFollow(this.player.x, this.player.y, this.player.z);
    this.env.updateEmitters(dt, this.particles);
    this.particles.update(dt, this.player ? this.player.y - 1.5 : 0);
    this.env.weather.update(dt, this.camera.position);
    this.visuals.update(dt, this.rockets, this.camera);
    this.oil.syncVisuals();
    if (this.player && this.state === 'RACE') {
      this.env.setHeadlight(this.player.x, this.player.y, this.player.z, this.player.heading);
    }
    this.smokePuffT -= dt;
    if (this.smokePuffT <= 0) {
      this.smokePuffT = 0.25;
      this.smoke.forEach((x, z, f) =>
        this.particles.puff(x, 2.5 + f * 3, z, 0.3, 0.8, 0.3, 2.4 + f * 4, 1.2, 0.34, 0.34, 0.36, 0.2 + 0.15 * (1 - f)),
      );
    }
    if (this.pickups) {
      this.clock = (this.clock || 0) + dt;
      this.pickups.animate(this.clock);
    }
    if (this.traps) {
      this.traps.animate(this.clock || 0);
    }
  }

  initMinimap() {
    this.minimapCanvas = this.$('minimapCanvas');
    if (!this.minimapCanvas || !this.track) return;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    const tr = this.track;
    const N = tr.N;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i += 4) {
      const x = tr.cx[i], z = tr.cz[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;
    const pad = 16;
    const avail = 160 - pad * 2;
    this.minimapScale = Math.min(avail / spanX, avail / spanZ);
    this.minimapCenterX = (minX + maxX) * 0.5;
    this.minimapCenterZ = (minZ + maxZ) * 0.5;

    const path = new Path2D();
    const toX = (x) => 80 + (x - this.minimapCenterX) * this.minimapScale;
    const toZ = (z) => 80 + (z - this.minimapCenterZ) * this.minimapScale;
    path.moveTo(toX(tr.cx[0]), toZ(tr.cz[0]));
    for (let i = 1; i < N; i++) {
      path.lineTo(toX(tr.cx[i]), toZ(tr.cz[i]));
    }
    path.closePath();
    this.minimapPath = path;
  }

  renderMinimap() {
    const ctx = this.minimapCtx;
    if (!ctx || !this.minimapPath || !this.player) return;
    ctx.clearRect(0, 0, 160, 160);

    // Track circuit outline
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(50, 55, 65, 0.85)';
    ctx.lineWidth = 7;
    ctx.stroke(this.minimapPath);

    ctx.strokeStyle = 'rgba(175, 185, 200, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke(this.minimapPath);

    const toX = (x) => 80 + (x - this.minimapCenterX) * this.minimapScale;
    const toZ = (z) => 80 + (z - this.minimapCenterZ) * this.minimapScale;

    // Active Road Traps on minimap
    if (this.traps && this.traps.traps) {
      for (const tr of this.traps.traps) {
        if (!tr.active) continue;
        const tx = toX(tr.x);
        const tz = toZ(tr.z);
        ctx.fillStyle = tr.type === 'mine' ? '#ff3b1f' : tr.type === 'spikes' ? '#ffb300' : '#ff7700';
        ctx.fillRect(tx - 1.5, tz - 1.5, 3, 3);
      }
    }

    // Rival blips
    for (const v of this.racers) {
      if (v.isPlayer) continue;
      const rx = toX(v.x);
      const rz = toZ(v.z);
      ctx.fillStyle = v.wrecked ? '#666666' : '#ff3b1f';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, rz, 3.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Player cyan arrowhead
    const p = this.player;
    const px = toX(p.x);
    const pz = toZ(p.z);
    const h = p.heading;
    const sin = Math.sin(h);
    const cos = Math.cos(h);

    const tipX = px + sin * 7;
    const tipY = pz + cos * 7;
    const blX = px - sin * 5 - cos * 5;
    const blY = pz - cos * 5 + sin * 5;
    const brX = px - sin * 5 + cos * 5;
    const brY = pz - cos * 5 - sin * 5;

    ctx.fillStyle = '#00f0ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(blX, blY);
    ctx.lineTo(px - sin * 2, pz - cos * 2);
    ctx.lineTo(brX, brY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Tactical screen-space overlay:
   *  • 3D projected floating rival health/shield bars
   *  • Target auto-lock red diamond bracket
   *  • Incoming homing missile proximity warning banner
   *  • Hit-confirm crosshair tick flash
   *  • Combat power-slide drift charge bar
   */
  renderTacticalOverlay() {
    const c = this.$('tacCanvas');
    if (!c || !this.player || this.state !== 'RACE') {
      if (c && c.width) {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
      }
      return;
    }
    if (c.width !== innerWidth || c.height !== innerHeight) {
      c.width = innerWidth;
      c.height = innerHeight;
    }
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);

    const p = this.player;
    const proj = this._tv;

    // 1. Floating Rival Health & Shield Bars + Turret Lock-On Reticle
    for (const v of this.racers) {
      if (v.isPlayer || v.wrecked) continue;
      const dist = Math.hypot(v.x - p.x, v.z - p.z);
      if (dist > 110) continue;

      proj.set(v.x, v.y + 2.8, v.z).project(this.camera);
      if (proj.z > 1 || proj.z < -1) continue;

      const sx = (proj.x * 0.5 + 0.5) * c.width;
      const sy = (-proj.y * 0.5 + 0.5) * c.height;
      if (sx < -40 || sx > c.width + 40 || sy < -40 || sy > c.height + 40) continue;

      const scale = clamp(1 - dist / 120, 0.45, 1);
      const bw = 68 * scale;
      const bh = 6 * scale;

      // Driver Name & Position
      g.font = `700 ${Math.round(11 * scale)}px Impact, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#ffe9a6';
      g.shadowColor = '#000';
      g.shadowBlur = 4;
      g.fillText(`P${v.race.position} ${v.name}`, sx, sy - 8);
      g.shadowBlur = 0;

      // Health Bar Background & Fill
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillRect(sx - bw / 2 - 1, sy - 4, bw + 2, bh + 2);
      const hpFrac = clamp(v.health / v.maxHealth, 0, 1);
      g.fillStyle = hpFrac > 0.5 ? '#5cff8a' : hpFrac > 0.25 ? '#ffb300' : '#ff3b1f';
      g.fillRect(sx - bw / 2, sy - 3, bw * hpFrac, bh);

      // Shield bar if present
      if (v.shieldPts > 0) {
        const shFrac = clamp(v.shieldPts / (v.shieldMax || 80), 0, 1);
        g.fillStyle = '#00d2ff';
        g.fillRect(sx - bw / 2, sy - 4 - 3 * scale, bw * shFrac, 2 * scale);
      }

      // Turret Auto-Lock Diamond Bracket
      if (p.lockTarget && p.lockTarget.car === v && p.loadout?.gun) {
        const lockY = sy + 18 * scale;
        const r = 16 * scale;
        g.strokeStyle = '#ff3b1f';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, lockY - r);
        g.lineTo(sx + r, lockY);
        g.lineTo(sx, lockY + r);
        g.lineTo(sx - r, lockY);
        g.closePath();
        g.stroke();
      }
    }

    // 2. Incoming Homing Rocket Threat Warning
    let closestThreat = Number.POSITIVE_INFINITY;
    for (const r of this.rockets.items) {
      if (r.owner === p) continue;
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      if (d < 65 && d < closestThreat) closestThreat = d;
    }
    if (closestThreat < 65 && Math.floor(performance.now() / 120) % 2 === 0) {
      g.font = '800 24px Impact, "Arial Narrow", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#ff3b1f';
      g.shadowColor = '#000';
      g.shadowBlur = 8;
      g.fillText(`[!] INCOMING MISSILE · ${Math.round(closestThreat)}M [!]`, c.width / 2, c.height * 0.18);
      g.shadowBlur = 0;
    }

    // 3. Hit-Confirm Crosshair Tick
    if (p.hitConfirm > 0) {
      p.hitConfirm = Math.max(0, p.hitConfirm - 0.016);
      const cx = c.width / 2;
      const cy = c.height / 2;
      const sz = 8;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - sz, cy - sz); g.lineTo(cx - 3, cy - 3);
      g.moveTo(cx + sz, cy - sz); g.lineTo(cx + 3, cy - 3);
      g.moveTo(cx - sz, cy + sz); g.lineTo(cx - 3, cy + 3);
      g.moveTo(cx + sz, cy + sz); g.lineTo(cx + 3, cy + 3);
      g.stroke();
    }

    // 4. Power-Slide Drift Charge Indicator
    if (p.isDrifting || (p.driftCharge || 0) > 0) {
      const dw = 140;
      const dh = 8;
      const dx = c.width / 2 - dw / 2;
      const dy = c.height * 0.82;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(dx - 2, dy - 2, dw + 4, dh + 4);
      g.fillStyle = '#ffb300';
      g.fillRect(dx, dy, dw * (p.driftCharge || 0), dh);
      g.font = '700 11px Impact, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText('POWER-SLIDE DRIFT (C)', c.width / 2, dy - 4);
    }
  }

  updateHUD(dt) {
    const h = this.hud;
    if (this.state === 'RACE' && this.player && this.race) {
      const p = this.player;
      h.txt('spd', String(Math.round(Math.abs(p.u) * KPH_PER_UNIT)));
      h.setGear(GEAR_LABEL[p.gear] || 'NEUTRAL');
      h.txt('lap', `${Math.min(p.race.lap + 1, LAPS_TO_FINISH)}/${LAPS_TO_FINISH}`);
      h.txt('pos', `${p.race.position || 1}/${this.racers.length}`);
      const cleared = (p.race.nextGate - 1 + GATE_COUNT) % GATE_COUNT;
      h.txt('cp', `${cleared}/${GATE_COUNT}`);
      h.txt('time', formatTime(this.race.time));
      const hullPct = Math.min(100, Math.max(0, Math.round((p.health / (p.maxHealth || 100)) * 100)));
      h.txt('healthTxt', String(hullPct));
      h.css('healthFill', `${clamp(p.health / (p.maxHealth || 100), 0, 1) * 100}%`);
      h.txt('ammoTxt', String(Math.round(p.ammo)));
      h.css('ammoFill', `${clamp(p.ammo / p.ammoMax, 0, 1) * 100}%`);
      h.txt('rocketTxt', String(p.rockets));
      h.css('rocketFill', `${clamp(p.rockets / p.rocketMax, 0, 1) * 100}%`);
      h.txt('nitroTxt', String(Math.round(p.nitro * 100)));
      h.css('nitroFill', `${clamp(p.nitro, 0, 1) * 100}%`);
      const L = p.loadout;
      for (const k of ['gun', 'rockets', 'shield', 'blades', 'gear']) this.$(`ld-${k}`).classList.toggle('locked', !L[k]);
      this.$('shieldTxt').textContent = String(Math.round(p.shieldPts));
      this.$('shieldFill').style.width = `${clamp(p.shieldPts / p.shieldMax, 0, 1) * 100}%`;
      this.$('smokeTxt').textContent = String(p.smokeCharges);
      this.$('oilTxt').textContent = String(p.oilCharges);
      this.$('gripTxt').textContent = p.traction < 0.99 ? 'OIL SLICK · GRIP LOST' : '';
      h.e.wrong.classList.toggle('hidden', !p.race.wrongWay);
      if (this.race.phase === 'COUNTDOWN') h.countdownText(String(Math.max(1, Math.ceil(this.race.countdown - 0.6))));
      else h.countdownText(this.race.goFlash > 0 ? 'GO!' : '');
      if (p.wrecked) h.wreck(true, this.wreckText(p));
      else if (!h.e.wreck.classList.contains('hidden')) h.wreck(false);
      if (this.recoverCD > 0) this.recoverCD = Math.max(0, this.recoverCD - dt);
      this.renderMinimap();
      this.renderTacticalOverlay();
    } else {
      this.renderTacticalOverlay();
    }
    const blind =
      this.state === 'RACE' && this.player ? this.smoke.densityAt(this.camera.position.x, this.camera.position.z) : 0;
    this.$('blind').style.opacity = String(clamp(blind, 0, 1) * 0.94);
    h.tick(dt);
  }

  /* --------------------------------- diagnostics --------------------------- */
  runDiagnostics() {
    if (this.state === 'RACE' && !this.paused) {
      this.hud.message('PAUSE THE RACE TO RUN DIAGNOSTICS', 2);
      return;
    }
    this.diag.run();
    this.renderDiag();
    this.updateDiagButton();
  }

  updateDiagButton() {
    const s = this.diag.summary();
    this.$('btnDiagMenu').textContent = s.total ? `Diagnostics · ${s.p}/${s.total} PASS` : 'Diagnostics';
  }

  renderDiag() {
    const rows = this.$('diagRows');
    const res = this.diag.results;
    if (!res.length) {
      rows.innerHTML = '<tr><td>Not run yet.</td></tr>';
      this.$('diagSummary').textContent = '';
      return;
    }
    const colour = { PASS: '#6fe07d', FAIL: '#ff6b6b', ERROR: '#ffb84d' };
    rows.innerHTML = res
      .map(
        (r) => `<tr>
        <td style="color:${colour[r.status]};font-weight:700;white-space:nowrap">${r.status}</td>
        <td><b>${esc(r.id)}</b><br><span style="color:#aaa">${esc(r.title)}</span></td>
        <td>${esc(r.value)}<br><span style="color:#777">${esc(r.detail)}</span>${r.corrected ? '<br><span style="color:#ffb84d">passed only after the bounded retry on a fresh fixture</span>' : ''}</td>
      </tr>`,
      )
      .join('');
    const s = this.diag.summary();
    const retried = res.filter((r) => r.attempts > 1).length;
    this.$('diagSummary').innerHTML =
      `<b>${s.p} PASS · ${s.f} FAIL · ${s.e} ERROR</b> of ${s.total} executed in ${Math.round(this.diag.elapsed || 0)} ms. Retries used: ${retried}. Browser-level checks (frame pacing, draw calls) are reported in the performance line, not counted as diagnostic passes.`;
  }
}

/* ------------------------------- startup ---------------------------------- */
(function bootstrap() {
  const showError = (err) => {
    const box = document.getElementById('errBox');
    box.style.display = 'block';
    box.textContent = `Death Race failed to start:\n${String(err?.stack || err)}`;
    const ld = document.getElementById('loading');
    if (ld) ld.classList.add('done');
  };
  try {
    if (!document.createElement('canvas').getContext('webgl2'))
      throw new Error('WebGL2 is required (use a current Chrome, Edge or Firefox with hardware acceleration enabled).');
    window.DR = new DeathRaceGame();
    window.DR.boot();
  } catch (err) {
    showError(err);
  }
})();
