// The missions of Palkon Auto, all eight of the story.
// Mara Venn, a coastal courier, uncovers a private security racket run by
// Bastion Civic and its broker, Silas Rook. The dock ledger, Oren's witness
// statement, the payment chain, the authenticated archive, relay
// attestations and the master agreement complete a public, independently
// mirrored archive; the finale broadcasts all eight entries, then free
// exploration resumes.
// This module is the mission state machine: ordered unlocks, a saved
// evidence log, cash rewards, timed operations, mission boundaries, an
// escort follower, cargo the player can drop and lose, a required vehicle
// with integrity, and Mara's health. It draws only the objective beacon,
// the dropped cargo and Oren into the shared dynamic mesh; the HUD text,
// the minimap outline and the dossier overlay are driven from its state
// by main.js and hud.js. No DOM is touched here, so the logic runs the
// same in the game and in a scripted test.

import { drawPersonAt } from './people.js';
import { TILE } from './mesh.js';

const SAVE_KEY = 'palkon-auto-save-v1';
const RECOVERY = { x: -1000, z: -1010 }; // the civic park, where Mara recovers
const HEALTH_MAX = 100;
const TRAFFIC_HIT_DAMAGE = 34;
const TRAFFIC_HIT_RADIUS = 2.6;
const HIT_INVULNERABLE = 1.0;
const VAN_HIT_SPEED = 12;
const VAN_HIT_DAMAGE = 25;
const OUTSIDE_GRACE = 5;
const OREN_LOST_DIST = 80;
const OREN_LOST_TIME = 15;
const CARGO_LOST_DIST = 30;
const CASH_PENALTY = 100;
const FINALE_ENTRY_TIME = 3; // seconds each evidence entry stays on screen

export const MISSION_DEFS = [
  {
    id: 1,
    title: 'A Receipt for Sunshine',
    brief: 'A routine courier job: pick up a delivery receipt in Canal Ward and take it to Neri\u2019s archive in South Market. The first receipt names the broker, Silas Rook.',
    reward: 150,
    timeLimit: 300,
    area: { x0: -600, z0: -600, x1: 600, z1: 1000 },
    steps: [
      { kind: 'collect', x: 0, z: -300, r: 6, label: 'Collect the delivery receipt',
        evidence: { name: 'Delivery receipt', text: 'Receipt for a sunshine delivery \u2014 signed for by broker Silas Rook.' } },
      { kind: 'deliver', x: 0, z: 600, r: 6, label: 'Deliver the receipt to Neri\u2019s archive' },
    ],
  },
  {
    id: 2,
    title: 'Salt Ledger',
    brief: 'The dock ledger is waiting on the harbour road in Pearl Marina. Bring it to the park archive before Bastion Civic\u2019s men find it first.',
    reward: 250,
    timeLimit: 240,
    area: { x0: -1440, z0: -1400, x1: -600, z1: 900 },
    steps: [
      { kind: 'collect', x: -1260, z: 100, r: 6, label: 'Collect the dock ledger',
        evidence: { name: 'Dock ledger', text: 'The salt ledger: every crate Bastion Civic moved through the harbour, in Rook\u2019s hand.' } },
      { kind: 'deliver', x: -1000, z: -1080, r: 6, label: 'Deliver the ledger to the park archive' },
    ],
  },
  {
    id: 3,
    title: 'After the Shutters',
    brief: 'Oren has a witness statement about Bastion Civic\u2019s trucks running after dark. Collect it at the South Market plaza, then walk Oren to the civic park \u2014 stay close, or he is lost.',
    reward: 350,
    timeLimit: 480,
    area: { x0: -1440, z0: -1400, x1: 600, z1: 1000 },
    steps: [
      { kind: 'collect', x: 0, z: 780, r: 6, label: 'Collect Oren\u2019s witness statement',
        evidence: { name: 'Witness statement', text: 'Oren\u2019s statement: Bastion Civic\u2019s trucks ran the shutters after dark.' } },
      { kind: 'escort', x: -1000, z: -1080, r: 10, label: 'Escort Oren to the civic park' },
    ],
  },
  {
    id: 4,
    title: 'Glass Debt',
    brief: 'The payment chain is in a Glasspoint office. Take the courier van, drive it to the office, bring the chain back in the van \u2014 and bring the van back in one piece.',
    reward: 500,
    timeLimit: 420,
    area: { x0: -600, z0: -1728, x1: 1920, z1: 1000 },
    steps: [
      { kind: 'reach', x: 1200, z: -1080, r: 12, label: 'Drive the courier van to the Glasspoint office', requireVehicle: 'van' },
      { kind: 'collect', x: 1200, z: -1080, r: 6, label: 'Collect the payment chain',
        evidence: { name: 'Payment chain', text: 'The payment chain: Bastion Civic paid Rook through three shell firms.' } },
      { kind: 'reach', x: 240, z: 600, r: 12, label: 'Drive the van back to the South Market drop', requireVehicle: 'van' },
      { kind: 'deliver', x: 240, z: 600, r: 6, label: 'Deliver the payment chain' },
    ],
  },
  {
    id: 5,
    title: 'The Long Way Home',
    brief: 'The archive has to be mirrored before Bastion Civic can bury it. Carry the relay package through four drop points across the city \u2014 South Market, Citrus Quarter, Glasspoint, then the north road \u2014 and bring it to the park archive.',
    reward: 600,
    timeLimit: 660,
    area: { x0: -1440, z0: -1728, x1: 1920, z1: 1728 },
    steps: [
      { kind: 'relay', x: 480, z: 360, r: 6, label: 'Relay stop 1 of 4 \u2014 South Market',
        evidence: { name: 'Relay route', text: 'The relay route: four drops across Solmar, mirroring the archive before Bastion Civic could bury it.' } },
      { kind: 'relay', x: 1200, z: 600, r: 6, label: 'Relay stop 2 of 4 \u2014 Citrus Quarter' },
      { kind: 'relay', x: 1200, z: -360, r: 6, label: 'Relay stop 3 of 4 \u2014 Glasspoint' },
      { kind: 'relay', x: 0, z: -1080, r: 6, label: 'Relay stop 4 of 4 \u2014 the north road' },
      { kind: 'deliver', x: -1000, z: -1080, r: 6, label: 'Deliver the relay package to the park archive' },
    ],
  },
  {
    id: 6,
    title: 'Unbought Ground',
    brief: 'The authenticated archive sits in the Citrus Quarter records hall. Fetch it and bring it to the park archive \u2014 Bastion Civic cannot buy what is already public record.',
    reward: 700,
    timeLimit: 600,
    area: { x0: -1440, z0: -1728, x1: 1920, z1: 1728 },
    steps: [
      { kind: 'collect', x: 1440, z: 1080, r: 6, label: 'Collect the authenticated archive',
        evidence: { name: 'Authenticated archive', text: 'The authenticated archive: every Bastion Civic contract, stamped and sealed by the city records hall.' } },
      { kind: 'deliver', x: -1000, z: -1080, r: 6, label: 'Deliver the archive to the park archive' },
    ],
  },
  {
    id: 7,
    title: 'Open Contract',
    brief: 'The relay attestations need witnesses in four districts before they count. Carry them from the west market to the marina, across Old Solmar, and up to the Glasspoint road \u2014 then bring them to Neri\u2019s archive.',
    reward: 800,
    timeLimit: 780,
    area: { x0: -1440, z0: -1728, x1: 1920, z1: 1728 },
    steps: [
      { kind: 'relay', x: -720, z: 840, r: 6, label: 'Relay stop 1 of 4 \u2014 the west market',
        evidence: { name: 'Relay attestations', text: 'Relay attestations: four witnesses in four districts, each swearing the archive is real.' } },
      { kind: 'relay', x: -1200, z: 360, r: 6, label: 'Relay stop 2 of 4 \u2014 Pearl Marina' },
      { kind: 'relay', x: -720, z: -840, r: 6, label: 'Relay stop 3 of 4 \u2014 Old Solmar' },
      { kind: 'relay', x: 480, z: -840, r: 6, label: 'Relay stop 4 of 4 \u2014 the Glasspoint road' },
      { kind: 'deliver', x: 0, z: 600, r: 6, label: 'Deliver the attestations to Neri\u2019s archive' },
    ],
  },
  {
    id: 8,
    title: 'Everyone Gets the Morning',
    brief: 'The master agreement is in Bastion Civic\u2019s own Glasspoint office. Bring it to the park archive \u2014 and then the whole city hears it.',
    reward: 1000,
    timeLimit: 600,
    area: { x0: -1440, z0: -1728, x1: 1920, z1: 1728 },
    steps: [
      { kind: 'collect', x: 1680, z: -1080, r: 6, label: 'Collect the master agreement',
        evidence: { name: 'Master agreement', text: 'The master agreement: Bastion Civic\u2019s own contract, signed by Silas Rook, tying the racket together.' } },
      { kind: 'deliver', x: -1000, z: -1080, r: 6, label: 'Deliver the agreement to the park archive' },
    ],
  },
];

const ARROWS = ['\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196'];

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createMissions(world) {
  const state = {
    cash: 0,
    health: HEALTH_MAX,
    completed: [],
    evidence: [],
    unlocked: 1,
    active: null,
    carrying: null,
    dropped: null,
    oren: { active: false, x: 0, z: 780, angle: 0, phase: 0 },
    invulnerable: 0,
    vanHitCooldown: 0,
    // The finale: after mission 8, every evidence entry is broadcast on
    // screen, one by one, then free exploration resumes.
    finale: { active: false, index: 0, timer: 0, shown: 0, done: false },
  };

  function load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1) return;
      state.cash = saved.cash | 0;
      state.completed = Array.isArray(saved.completed) ? saved.completed : [];
      state.evidence = Array.isArray(saved.evidence) ? saved.evidence : [];
      state.unlocked = Math.max(1, Math.min(8, saved.unlocked | 0 || 1));
    } catch {
      // A corrupt or missing save starts fresh; the game never depends on it.
    }
  }

  function save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        cash: state.cash,
        completed: state.completed,
        evidence: state.evidence,
        unlocked: state.unlocked,
      }));
    } catch {
      // Storage full or unavailable: the session keeps playing unsaved.
    }
  }

  function logEvidence(item, missionId) {
    if (!state.evidence.some((e) => e.name === item.name)) {
      state.evidence.push({ mission: missionId, name: item.name, text: item.text });
    }
  }

  function currentStep() {
    if (!state.active) return null;
    return state.active.def.steps[state.active.stepIndex] ?? null;
  }

  function advanceStep() {
    state.active.stepIndex += 1;
    if (state.active.stepIndex >= state.active.def.steps.length) {
      completeMission();
    }
  }

  function completeMission() {
    const def = state.active.def;
    state.cash += def.reward;
    if (!state.completed.includes(def.id)) state.completed.push(def.id);
    state.unlocked = Math.max(state.unlocked, Math.min(8, def.id + 1));
    const reward = def.reward;
    state.active = null;
    state.carrying = null;
    state.dropped = null;
    state.oren.active = false;
    save();
    world.onEvent(`MISSION COMPLETE \u2014 ${def.title} \u00b7 +$${reward}`);
    if (def.id === 8) startFinale();
  }

  function startFinale() {
    state.finale.active = true;
    state.finale.index = 0;
    state.finale.timer = FINALE_ENTRY_TIME;
    state.finale.shown = 0;
    state.finale.done = false;
    world.onEvent('THE ARCHIVE IS PUBLIC \u2014 the broadcast begins');
  }

  function failMission(reason) {
    const def = state.active ? state.active.def : null;
    state.active = null;
    state.carrying = null;
    state.dropped = null;
    state.oren.active = false;
    // A failed run tows the courier van back to its spot, so a retry never
    // starts with a wrecked van stranded far away; its integrity is reset
    // when the mission starts again.
    if (def && def.id === 4) {
      const van = world.getVan();
      if (van) { van.x = 480; van.z = 300; van.angle = Math.PI; van.speed = 0; }
    }
    save();
    world.onEvent(`MISSION FAILED \u2014 ${def ? `${def.title}: ` : ''}${reason}`);
  }

  function recoverToPark() {
    state.cash = Math.max(0, state.cash - CASH_PENALTY);
    state.health = HEALTH_MAX;
    world.player.x = RECOVERY.x;
    world.player.z = RECOVERY.z;
    world.player.yaw = 0;
    save();
    world.onEvent(`Mara was hurt \u2014 recovered at the civic park \u00b7 -$${CASH_PENALTY}`);
  }

  function damagePlayer(amount) {
    if (state.invulnerable > 0) return false;
    state.health -= amount;
    state.invulnerable = HIT_INVULNERABLE;
    if (state.health <= 0) {
      state.health = 0;
      if (state.active) failMission('Mara was hurt');
      recoverToPark();
      return true;
    }
    return false;
  }

  load();

  return {
    state,
    defs: MISSION_DEFS,

    start(id, opts = {}) {
      const def = MISSION_DEFS.find((m) => m.id === id);
      if (!def) return false;
      if (state.active) return false;
      if (state.finale.active) return false;
      if (!opts.force && id > state.unlocked) return false;
      if (id === 4 && !world.getVan()) return false;
      state.active = {
        def,
        stepIndex: 0,
        timeLeft: def.timeLimit,
        outsideTimer: 0,
        // The boundary clock starts now if Mara is already inside the
        // area — otherwise the first update after a start-then-teleport
        // would never arm it.
        entered: world.player.x >= def.area.x0 && world.player.x <= def.area.x1
          && world.player.z >= def.area.z0 && world.player.z <= def.area.z1,
        orenLostTimer: 0,
        vanIntegrity: 100,
      };
      state.carrying = null;
      state.dropped = null;
      state.oren.active = false;
      world.onEvent(`Mission started \u2014 ${def.title} \u00b7 ${fmtTime(def.timeLimit)} on the clock`);
      return true;
    },

    /** Q: collect, deliver, or pick dropped cargo back up. */
    interact() {
      if (!state.active) return false;
      const step = currentStep();
      if (!step) return false;
      // Picking dropped cargo back up always works, whatever the step is.
      if (state.dropped && dist(world.player.x, world.player.z, state.dropped.x, state.dropped.z) < 6) {
        state.carrying = state.dropped.evidence;
        state.dropped = null;
        world.onEvent(`Picked the ${state.carrying.name} back up`);
        return true;
      }
      const d = dist(world.player.x, world.player.z, step.x, step.z);
      if (step.kind === 'collect' && d < step.r) {
        logEvidence(step.evidence, state.active.def.id);
        state.carrying = step.evidence;
        if (state.active.def.id === 3) {
          state.oren.active = true;
          state.oren.x = step.x;
          state.oren.z = step.z;
        }
        advanceStep();
        return true;
      }
      // A relay stop: Q activates the drop. The first stop of a relay
      // mission logs its evidence and picks up the relay package, which
      // the final deliver step hands in; later stops only advance.
      if (step.kind === 'relay' && d < step.r) {
        if (step.evidence) {
          logEvidence(step.evidence, state.active.def.id);
          state.carrying = step.evidence;
        }
        const total = state.active.def.steps.filter((s) => s.kind === 'relay').length;
        const done = state.active.def.steps.slice(0, state.active.stepIndex + 1)
          .filter((s) => s.kind === 'relay').length;
        world.onEvent(`Relay stop ${done} of ${total} \u2014 ${step.label.split('\u2014 ')[1] ?? ''}`);
        advanceStep();
        return true;
      }
      if (step.kind === 'deliver' && state.carrying && d < step.r) {
        state.carrying = null;
        advanceStep();
        return true;
      }
      return false;
    },

    /** X: put the carried evidence down. Walk more than 30 away and it is lost. */
    dropCargo() {
      if (!state.active || !state.carrying) return false;
      state.dropped = { x: world.player.x, z: world.player.z, evidence: state.carrying };
      state.carrying = null;
      world.onEvent('Cargo dropped \u2014 pick it back up, or it is lost');
      return true;
    },

    /** A hard collision while driving the mission van. */
    vehicleHit(car, speed) {
      if (!state.active || state.active.def.id !== 4) return;
      if (car !== world.getVan()) return;
      if (Math.abs(speed) <= VAN_HIT_SPEED) return;
      if (state.vanHitCooldown > 0) return;
      state.vanHitCooldown = 1;
      state.active.vanIntegrity -= VAN_HIT_DAMAGE;
      world.onEvent(`The courier van took a hard hit \u00b7 integrity ${Math.max(0, state.active.vanIntegrity)}%`);
      if (state.active.vanIntegrity <= 0) {
        failMission('The courier van was destroyed');
      }
    },

    update(dt) {
      if (state.invulnerable > 0) state.invulnerable -= dt;
      if (state.vanHitCooldown > 0) state.vanHitCooldown -= dt;
      // A traffic car that runs Mara down on foot hurts her, mission or not.
      if (world.getMode() === 'foot' && world.traffic) {
        for (const car of world.traffic.cars) {
          if (dist(world.player.x, world.player.z, car.x, car.z) < TRAFFIC_HIT_RADIUS) {
            damagePlayer(TRAFFIC_HIT_DAMAGE);
            break;
          }
        }
      }
      // The finale runs on its own clock: each evidence entry stays on
      // screen for FINALE_ENTRY_TIME, then the next one shows. When the
      // last entry has shown, the broadcast ends and free exploration
      // resumes with all eight missions complete.
      if (state.finale.active) {
        const f = state.finale;
        f.timer -= dt;
        if (f.timer <= 0) {
          f.shown += 1;
          f.index += 1;
          if (f.index >= state.evidence.length) {
            f.active = false;
            f.done = true;
            save();
            world.onEvent('BROADCAST COMPLETE \u2014 all eight entries are public \u00b7 free exploration resumes');
          } else {
            f.timer = FINALE_ENTRY_TIME;
          }
        }
      }
      if (!state.active) return;
      const a = state.active;
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        failMission('Time ran out');
        return;
      }
      // The mission boundary: five seconds outside it fails the operation.
      // The clock only starts once Mara has entered the area — the trip
      // there is not part of the operation, and mission 2's area does not
      // include the spawn.
      const area = a.def.area;
      const inside = world.player.x >= area.x0 && world.player.x <= area.x1
        && world.player.z >= area.z0 && world.player.z <= area.z1;
      if (inside) { a.outsideTimer = 0; a.entered = true; }
      else if (a.entered) {
        a.outsideTimer += dt;
        if (a.outsideTimer > OUTSIDE_GRACE) {
          failMission('Left the mission area');
          return;
        }
      }
      // Dropped cargo: walk away and it is gone for good.
      if (state.dropped && dist(world.player.x, world.player.z, state.dropped.x, state.dropped.z) > CARGO_LOST_DIST) {
        state.dropped = null;
        failMission('Evidence lost');
        return;
      }
      // Oren follows Mara during the escort; lose him and the mission fails.
      if (state.oren.active) {
        const o = state.oren;
        const d = dist(o.x, o.z, world.player.x, world.player.z);
        if (d > 4) {
          const speed = d > 30 ? 12 : 8;
          const stepLen = Math.min(speed * dt, d - 2);
          const nx = o.x + ((world.player.x - o.x) / d) * stepLen;
          const nz = o.z + ((world.player.z - o.z) / d) * stepLen;
          if (!world.collide(nx, o.z)) o.x = nx;
          if (!world.collide(o.x, nz)) o.z = nz;
          o.angle = Math.atan2(world.player.x - o.x, world.player.z - o.z);
          o.phase += dt * 8;
        }
        if (d > OREN_LOST_DIST) {
          a.orenLostTimer += dt;
          if (a.orenLostTimer > OREN_LOST_TIME) {
            failMission('Oren was lost');
            return;
          }
        } else {
          a.orenLostTimer = 0;
        }
      }
      // Reach steps complete on their own: arrive in the van, or on foot.
      const step = currentStep();
      if (step && step.kind === 'reach') {
        const d = dist(world.player.x, world.player.z, step.x, step.z);
        const inVehicle = step.requireVehicle === 'van'
          ? world.getMode() === 'drive' && world.getPlayerCar() === world.getVan()
          : true;
        const px = world.getMode() === 'drive' && world.getPlayerCar()
          ? world.getPlayerCar().x : world.player.x;
        const pz = world.getMode() === 'drive' && world.getPlayerCar()
          ? world.getPlayerCar().z : world.player.z;
        const vd = dist(px, pz, step.x, step.z);
        if (inVehicle && vd < step.r) advanceStep();
        else if (d < step.r && !step.requireVehicle) advanceStep();
      }
      // The escort completes when Mara reaches the safe point and Oren is close behind.
      if (step && step.kind === 'escort') {
        const d = dist(world.player.x, world.player.z, step.x, step.z);
        const od = dist(state.oren.x, state.oren.z, step.x, step.z);
        if (d < step.r && od < 30) advanceStep();
      }
    },

    /** The HUD objective line: timer, compass arrow, distance, warnings. */
    getObjectiveText() {
      if (state.finale.active) {
        const f = state.finale;
        const entry = state.evidence[f.index];
        if (!entry) return 'BROADCAST \u2014 the archive is public';
        return `BROADCAST ${f.index + 1} of ${state.evidence.length} \u2014 ${entry.name}`;
      }
      if (!state.active) return null;
      const step = currentStep();
      if (!step) return null;
      const px = world.player.x;
      const pz = world.player.z;
      const dx = step.x - px;
      const dz = step.z - pz;
      const d = Math.hypot(dx, dz);
      const worldAngle = Math.atan2(dx, -dz);
      let rel = worldAngle - world.player.yaw;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      const arrow = ARROWS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
      const parts = [`${fmtTime(state.active.timeLeft)}`, `${arrow} ${Math.round(d)}m`, step.label];
      if (state.carrying) parts.push(`carrying the ${state.carrying.name}`);
      if (state.active.outsideTimer > 0) parts.push('OUTSIDE THE AREA \u2014 return!');
      if (state.oren.active) {
        const od = dist(state.oren.x, state.oren.z, px, pz);
        parts.push(`Oren ${Math.round(od)}m behind`);
      }
      return parts.join(' \u00b7 ');
    },

    /** The finale broadcast, for the on-screen overlay. */
    getFinale() {
      const f = state.finale;
      if (!f.active) return null;
      return {
        active: true,
        index: f.index,
        total: state.evidence.length,
        entry: state.evidence[f.index] ?? null,
        shown: f.shown,
        done: f.done,
      };
    },

    /** Mission area + current target, for the minimap. */
    getMinimapInfo() {
      if (!state.active) return null;
      const step = currentStep();
      if (!step) return null;
      return { area: state.active.def.area, target: { x: step.x, z: step.z } };
    },

    /** Everything the dossier overlay shows. */
    getDossier() {
      return {
        cash: state.cash,
        health: state.health,
        evidence: state.evidence.map((e) => ({ mission: e.mission, name: e.name, text: e.text })),
        evidenceTotal: 8,
        unlocked: state.unlocked,
        activeId: state.active ? state.active.def.id : null,
        missions: MISSION_DEFS.map((def) => ({
          id: def.id,
          title: def.title,
          brief: def.brief,
          reward: def.reward,
          status: state.completed.includes(def.id)
            ? 'done'
            : state.active && state.active.def.id === def.id
              ? 'active'
              : def.id <= state.unlocked ? 'available' : 'locked',
        })),
      };
    },

    /** The beacon, Oren and dropped cargo, drawn into the dynamic mesh. */
    drawInto(builder, time) {
      if (state.active) {
        const step = currentStep();
        if (step) {
          const pulse = 26 + 4 * Math.sin(time * 2);
          builder.addBox(step.x, pulse / 2, step.z, 1.4, pulse, 1.4, {
            tile: TILE.lampGlow, tileTop: TILE.lampGlow,
            color: [1.0, 0.8, 0.3], gloss: 0.1, emissive: 1,
          });
          builder.addBox(step.x, 0.15, step.z, 9, 0.3, 9, {
            tile: TILE.lampGlow, color: [1.0, 0.8, 0.3], gloss: 0.1, emissive: 0.8,
          });
        }
      }
      if (state.dropped) {
        builder.addBox(state.dropped.x, 0.8, state.dropped.z, 2.2, 1.6, 1.6, {
          tile: TILE.wood, color: [0.95, 0.75, 0.2], gloss: 0.4, emissive: 0.4,
        });
      }
      if (state.oren.active) {
        const o = state.oren;
        // Oren, in a coral shirt so he reads as a person, not a pedestrian.
        drawPersonAt(builder, o.x, o.z, o.angle, [0.85, 0.35, 0.28], [0.72, 0.52, 0.38], o.phase);
        // A small gold diamond above him, so the escort is visible at a glance.
        builder.addBox(o.x, 2.9, o.z, 0.7, 0.7, 0.7, {
          tile: TILE.lampGlow, color: [1.0, 0.8, 0.3], gloss: 0.1, emissive: 1,
        });
      }
    },

    debug: {
      resetSave() {
        try {
          if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
        } catch { /* the game never depends on storage */ }
        state.cash = 0;
        state.health = HEALTH_MAX;
        state.completed = [];
        state.evidence = [];
        state.unlocked = 1;
        state.active = null;
        state.carrying = null;
        state.dropped = null;
        state.oren.active = false;
        state.invulnerable = 0;
      },
      setTimeLeft(seconds) {
        if (state.active) state.active.timeLeft = seconds;
      },
      setHealth(n) {
        state.health = n;
      },
      damagePlayer(n) {
        state.invulnerable = 0;
        damagePlayer(n);
      },
      damageVehicle(n) {
        if (state.active && state.active.def.id === 4) {
          state.active.vanIntegrity -= n;
          if (state.active.vanIntegrity <= 0) failMission('The courier van was destroyed');
        }
      },
      /** Complete the whole story at once (verification shots only): every
       * mission done, every evidence entry logged, then the finale starts. */
      completeAll() {
        state.active = null;
        state.carrying = null;
        state.dropped = null;
        state.oren.active = false;
        state.completed = [];
        state.evidence = [];
        state.cash = 0;
        for (const def of MISSION_DEFS) {
          if (!state.completed.includes(def.id)) state.completed.push(def.id);
          state.cash += def.reward;
          for (const step of def.steps) {
            if (step.evidence) logEvidence(step.evidence, def.id);
          }
        }
        state.unlocked = 8;
        save();
        startFinale();
      },
    },
  };
}
