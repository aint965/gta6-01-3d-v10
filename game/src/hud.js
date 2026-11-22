// The HUD for Palkon Auto: district and lighting readouts, a live minimap of
// Solmar, the controls footer, and the title screen. The minimap is a 2D
// canvas redrawn every frame from the same district and road data the city
// was built from, so it can never disagree with the world.

import { CITY } from './city.js';

const MAP_W = 200;
const MAP_H = 184;

export function createHUD(city) {
  const districtEl = document.getElementById('district');
  const presetEl = document.getElementById('preset');
  const coordsEl = document.getElementById('coords');
  const speedEl = document.getElementById('speed');
  const objectiveEl = document.getElementById('objective');
  const titleEl = document.getElementById('title');
  const helpEl = document.getElementById('help');
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const scaleX = MAP_W / (CITY.x1 - CITY.x0);
  const scaleZ = MAP_H / (CITY.z1 - CITY.z0);
  const toMapX = (x) => (x - CITY.x0) * scaleX;
  const toMapZ = (z) => (z - CITY.z0) * scaleZ;

  function districtAt(x, z) {
    for (const d of city.districts) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
    }
    return 'Solmar';
  }

  function drawMinimap(player, drive) {
    const g = mapCtx;
    g.clearRect(0, 0, MAP_W, MAP_H);
    g.fillStyle = '#101c26';
    g.fillRect(0, 0, MAP_W, MAP_H);
    // The sea, west of the city.
    g.fillStyle = '#1d5a66';
    g.fillRect(0, 0, toMapX(-1560), MAP_H);
    // District blocks.
    for (const d of city.districts) {
      g.fillStyle = d.color;
      g.globalAlpha = 0.55;
      g.fillRect(toMapX(d.x0), toMapZ(d.z0), (d.x1 - d.x0) * scaleX, (d.z1 - d.z0) * scaleZ);
    }
    g.globalAlpha = 1;
    // Roads.
    g.strokeStyle = 'rgba(20, 45, 56, 0.7)';
    g.lineWidth = 1;
    for (const x of [-1200, -960, -720, -480, -240, 0, 240, 480, 720, 960, 1200, 1440, 1680]) {
      g.beginPath();
      g.moveTo(toMapX(x), 0);
      g.lineTo(toMapX(x), MAP_H);
      g.stroke();
    }
    for (const z of [-1560, -1320, -1080, -840, -600, -360, -120, 120, 360, 600, 840, 1080, 1320, 1560]) {
      g.beginPath();
      g.moveTo(0, toMapZ(z));
      g.lineTo(MAP_W, toMapZ(z));
      g.stroke();
    }
    // The park.
    g.fillStyle = '#56856b';
    g.fillRect(toMapX(-1200), toMapZ(-1400), 400 * scaleX, 400 * scaleZ);
    if (drive) {
      // Traffic signals: green or red dots at their posts.
      for (const s of drive.signals ?? []) {
        g.fillStyle = s.state === 'green' ? '#3ddc6a' : '#ff5a4a';
        g.beginPath();
        g.arc(toMapX(s.x), toMapZ(s.z), 2.5, 0, Math.PI * 2);
        g.fill();
      }
      // Traffic cars, amber; parked cars, small grey.
      g.fillStyle = '#f2b13c';
      for (const c of drive.traffic ?? []) {
        g.fillRect(toMapX(c.x) - 1.5, toMapZ(c.z) - 1.5, 3, 3);
      }
      g.fillStyle = 'rgba(200, 205, 210, 0.7)';
      for (const c of drive.parked ?? []) {
        g.fillRect(toMapX(c.x) - 1, toMapZ(c.z) - 1, 2, 2);
      }
    }
    // The player: a dot with a heading wedge.
    const px = toMapX(player.x);
    const pz = toMapZ(player.z);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(px, pz, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, pz);
    g.lineTo(px + Math.sin(player.yaw) * 12, pz - Math.cos(player.yaw) * 12);
    g.stroke();
  }

  return {
    districtAt,
    showTitle() {
      titleEl.style.display = 'flex';
      helpEl.style.display = 'block';
    },
    hideTitle() {
      titleEl.style.display = 'none';
      helpEl.style.display = 'none';
    },
    update(player, presetLabel, drive) {
      districtEl.textContent = districtAt(player.x, player.z).toUpperCase();
      presetEl.textContent = presetLabel;
      coordsEl.textContent = `X ${Math.round(player.x)} · Z ${Math.round(player.z)}`;
      if (speedEl) {
        speedEl.textContent = drive && drive.mode === 'drive'
          ? `${Math.round(drive.speedKmh)} KM/H · ${drive.profile.toUpperCase()}`
          : 'ON FOOT';
      }
      if (objectiveEl) {
        objectiveEl.textContent = drive ? drive.objective : 'Explore Solmar';
      }
      drawMinimap(player, drive);
    },
  };
}
