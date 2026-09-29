// Musique d'ambiance spatiale générative (Web Audio, aucun fichier externe)

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const CHORDS = [
  [38, 45, 50, 57, 62, 64, 69],
  [34, 41, 50, 53, 58, 62, 65],
  [36, 43, 48, 55, 60, 64, 67],
  [33, 40, 49, 52, 57, 61, 64],
  [31, 38, 50, 55, 59, 62, 66],
  [36, 43, 52, 55, 59, 64, 71],
];
const SPARKLE = [74, 76, 79, 81, 83, 86, 88, 91, 93];

export class AmbientMusic {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.chordIndex = 0;
    this.intensity = 0;
  }

  start() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Réverbération longue générée
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(7, 2.2);
    const wet = ctx.createGain(); wet.gain.value = 0.85;
    this.reverb.connect(wet).connect(this.master);

    // Écho stéréo pour les scintillements
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
    dl.delayTime.value = 0.61; dr.delayTime.value = 0.93;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const merger = ctx.createChannelMerger(2);
    this.delayIn.connect(dl); dl.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
    merger.connect(this.reverb);
    const dly = ctx.createGain(); dly.gain.value = 0.3;
    merger.connect(dly).connect(this.master);

    // Bus des nappes : filtre passe-bas qui respire
    this.padBus = ctx.createBiquadFilter();
    this.padBus.type = 'lowpass'; this.padBus.frequency.value = 900; this.padBus.Q.value = 0.7;
    const padGain = ctx.createGain(); padGain.gain.value = 0.5;
    this.padBus.connect(padGain);
    padGain.connect(this.master);
    padGain.connect(this.reverb);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.025;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 450;
    lfo.connect(lfoAmt).connect(this.padBus.frequency); lfo.start();

    // Drone grave continu
    this.drone = ctx.createGain(); this.drone.gain.value = 0.18;
    this.drone.connect(this.master); this.drone.connect(this.reverb);
    this.droneOsc = [0, 7].map((d) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = midi(26 + d); o.detune.value = d ? 4 : 0;
      o.connect(this.drone); o.start(); return o;
    });

    // Vent cosmique : bruit filtré, s'intensifie avec la vitesse
    const noise = ctx.createBufferSource();
    const nb = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    noise.buffer = nb; noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 1.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.02;
    noise.connect(this.windFilter).connect(this.windGain);
    this.windGain.connect(this.reverb); this.windGain.connect(this.master);
    noise.start();
    const wl = ctx.createOscillator(); wl.frequency.value = 0.04;
    const wla = ctx.createGain(); wla.gain.value = 250;
    wl.connect(wla).connect(this.windFilter.frequency); wl.start();

    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, ctx.currentTime, 3);
    this.nextChord();
    this.scheduleSparkle();
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  nextChord() {
    const ctx = this.ctx, now = ctx.currentTime;
    const chord = CHORDS[this.chordIndex % CHORDS.length];
    this.chordIndex += Math.random() < 0.7 ? 1 : 2;
    const dur = 20 + Math.random() * 8;
    chord.forEach((n, k) => {
      if (k > 0 && Math.random() < 0.2) return;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      const peak = (k === 0 ? 0.09 : 0.055) / (1 + k * 0.1);
      g.gain.linearRampToValueAtTime(peak, now + 6 + Math.random() * 3);
      g.gain.setValueAtTime(peak, now + dur - 2);
      g.gain.linearRampToValueAtTime(0, now + dur + 9);
      const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() * 2 - 1) * 0.7;
      g.connect(pan).connect(this.padBus);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = k < 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        const og = ctx.createGain(); og.gain.value = k < 2 ? 1 : 0.35;
        o.connect(og).connect(g);
        o.start(now); o.stop(now + dur + 10);
      }
    });
    this.chordTimer = setTimeout(() => this.nextChord(), (dur - 4) * 1000);
  }

  scheduleSparkle() {
    const ctx = this.ctx, now = ctx.currentTime;
    const count = Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const t = now + i * (0.3 + Math.random() * 0.5);
      const n = SPARKLE[Math.floor(Math.random() * SPARKLE.length)] - (Math.random() < 0.5 ? 12 : 0);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = midi(n) * 2.001;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2).connect(g);
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
      g.connect(pan); pan.connect(this.delayIn); pan.connect(this.reverb);
      o.start(t); o2.start(t); o.stop(t + 4.2); o2.stop(t + 4.2);
    }
    this.sparkleTimer = setTimeout(() => this.scheduleSparkle(), 2500 + Math.random() * 6000);
  }

  // Vitesse (β) → timbre plus brillant et vent plus présent
  setIntensity(beta) {
    if (!this.ctx) return;
    const k = Math.min(1, beta);
    if (Math.abs(k - this.intensity) < 0.005) return;
    this.intensity = k;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.02 + k * 0.09, t, 1.5);
    this.windFilter.Q.setTargetAtTime(1.5 + k * 4, t, 1.5);
    this.padBus.Q.setTargetAtTime(0.7 + k * 5, t, 2);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.8);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }
}
