// "Solmar Common": the in-car radio. Every sound is synthesised in code
// with WebAudio — a low bulletin-bed drone, a plucked pentatonic loop, a
// two-note sting before each headline, and the headlines themselves on the
// HUD ticker (spoken aloud too, when the browser has a voice). No audio
// files, no copied music. The radio plays while driving and toggles with R.

export const HEADLINES = [
  'Good morning, Solmar \u2014 the canal bridges reopen after the night\u2019s storm checks.',
  'Bastion Civic denies the harbour ledger exists. The ledger disagrees.',
  'Citrus Quarter market sets a record for morning oranges.',
  'Glasspoint towers switch on their crowns for founders\u2019 week.',
  'The park pond ducks have returned. Nobody knows from where.',
  'Marina ferry times change with the tide \u2014 check the board before you board.',
  'South Market bakers raise the price of nothing and the quality of everything.',
  'The night buses run late again, and the drivers say the city looks better at 2 a.m.',
];

const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 783.99, 659.25];
// A 16-step loop of notes and rests, original and pentatonic.
const MELODY = [0, -1, 2, -1, 4, 3, 2, -1, 5, 4, 3, 2, 1, 2, -1, -1];
const HEADLINE_EVERY = 20; // seconds between headlines
const STING = [880.0, 1174.66];

export function createRadio() {
  let ctx = null;
  let master = null;
  let on = false;
  let headlineIndex = 0;
  let headlineTimer = 0;
  let nextNoteTime = 0;
  let noteStep = 0;
  let bedStarted = false;

  function ensureCtx() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      startBed();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function startBed() {
    if (bedStarted || !ctx) return;
    bedStarted = true;
    // A low drone: two sines a fifth apart, quiet under the melody.
    for (const [freq, gain] of [[55, 0.05], [82.41, 0.03]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(master);
      osc.start();
    }
    // A slow swell of filtered noise, like a room tone.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(master);
    noise.start();
  }

  function pluck(freq, when, vol = 0.12) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + 0.6);
  }

  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {
      // No voice available: the HUD ticker still carries the headline.
    }
  }

  function sting() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    pluck(STING[0], t, 0.16);
    pluck(STING[1], t + 0.18, 0.16);
    speak(HEADLINES[headlineIndex]);
  }

  return {
    toggle() {
      on = !on;
      if (on) {
        const ok = ensureCtx();
        if (ok && ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (master && ctx) master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3);
        headlineTimer = 0;
      } else {
        if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        try {
          if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        } catch {
          // No speech to cancel.
        }
      }
      return on;
    },

    isOn() {
      return on;
    },

    update(dt) {
      if (!on || !ctx) return;
      if (ctx.state !== 'running') return;
      headlineTimer += dt;
      if (headlineTimer >= HEADLINE_EVERY) {
        headlineTimer = 0;
        headlineIndex = (headlineIndex + 1) % HEADLINES.length;
        sting();
      }
      // Schedule plucked notes just ahead of the audio clock.
      if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.1;
      while (nextNoteTime < ctx.currentTime + 0.3) {
        const note = MELODY[noteStep % MELODY.length];
        if (note >= 0) pluck(NOTES[note], nextNoteTime);
        noteStep += 1;
        nextNoteTime += 0.42;
      }
    },

    getState() {
      return {
        on,
        headline: HEADLINES[headlineIndex],
        headlineIndex,
        audio: !!ctx,
        ctxState: ctx ? ctx.state : 'none',
        gain: master ? master.gain.value : 0,
      };
    },

    debug: {
      nextHeadline() {
        headlineIndex = (headlineIndex + 1) % HEADLINES.length;
        headlineTimer = 0;
        return HEADLINES[headlineIndex];
      },
    },
  };
}
