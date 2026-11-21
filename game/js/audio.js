// audio.js — synthesized sound for SHADOWLINE, no audio files.
// Every sound is built from WebAudio oscillators and filtered noise at run
// time: footsteps, coin clinks, shard chimes, alarm stings, guard barks and
// a low ambient drone that thickens while the alarm is up. The engine is
// created lazily on the first user gesture (browsers require that) and can
// be muted from the pause menu.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.droneNodes = null;
    this.alarmLevel = 0;
    this.lastStepTime = 0;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  /** Create the AudioContext on first user gesture. Safe to call often. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startDrone();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A low, slow ambient drone: two detuned sines + filtered noise. */
  startDrone() {
    if (!this.ctx || this.droneNodes) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(this.master);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55 * 1.5;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.4;
    osc1.connect(gain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(gain);
    // Slow breathing LFO on the drone gain.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.start();
    osc2.start();
    lfo.start();
    this.droneNodes = { gain, osc1, osc2, lfo };
  }

  /** The drone thickens and rises in pitch while the alarm is up. */
  setAlarmLevel(level) {
    this.alarmLevel = level;
    if (!this.droneNodes) return;
    const t = this.ctx.currentTime;
    this.droneNodes.gain.gain.setTargetAtTime(0.05 + level * 0.09, t, 0.4);
    this.droneNodes.osc1.frequency.setTargetAtTime(55 + level * 14, t, 0.5);
  }

  /** One-shot helper: an oscillator with an envelope. */
  blip(type, freqStart, freqEnd, duration, volume, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** Filtered noise burst: footsteps, cloth, coin clinks, whooshes. */
  noiseBurst(duration, volume, filterFreq, filterType = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + duration);
  }

  /** Player footstep: a soft thud, quieter while sneaking. */
  footstep(sneaking, dashing) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastStepTime < 90) return;
    this.lastStepTime = now;
    if (sneaking) {
      this.noiseBurst(0.06, 0.05, 500);
    } else if (dashing) {
      this.noiseBurst(0.14, 0.22, 900);
      this.blip('sine', 120, 70, 0.12, 0.14);
    } else {
      this.noiseBurst(0.08, 0.12, 700);
      this.blip('sine', 95, 60, 0.09, 0.1);
    }
  }

  /** Guard footstep, panned by how far left/right the guard is. */
  guardStep(distance, pan = 0) {
    if (!this.ctx) return;
    const volume = Math.max(0.02, 0.16 - distance / 2400);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner
      ? this.ctx.createStereoPanner()
      : null;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(88, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Coin clink: two bright metallic pings. */
  coinClink() {
    this.blip('triangle', 2400, 2100, 0.09, 0.16);
    this.blip('triangle', 3200, 2900, 0.12, 0.1, 0.05);
    this.noiseBurst(0.05, 0.08, 6000, 'highpass');
  }

  /** Coin thrown: a short whoosh as it leaves the hand. */
  coinThrow() {
    this.noiseBurst(0.18, 0.1, 2400, 'bandpass');
  }

  /** Dash: a cloth whoosh. */
  dash() {
    this.noiseBurst(0.22, 0.18, 1400, 'bandpass');
    this.blip('sine', 220, 90, 0.18, 0.1);
  }

  /** Shard pickup: a rising three-note chime. */
  shardPickup(count) {
    const base = 660 + (count % 5) * 40;
    this.blip('sine', base, base, 0.16, 0.16);
    this.blip('sine', base * 1.25, base * 1.25, 0.18, 0.14, 0.07);
    this.blip('sine', base * 1.5, base * 1.5, 0.28, 0.14, 0.14);
  }

  /** Guard grows suspicious: a short questioning two-note motif. */
  suspicious() {
    this.blip('triangle', 330, 330, 0.14, 0.12);
    this.blip('triangle', 392, 392, 0.18, 0.12, 0.12);
  }

  /** Guard spots you: a sharp alarm sting, two dissonant hits. */
  alarmSting() {
    this.blip('sawtooth', 220, 220, 0.22, 0.16);
    this.blip('sawtooth', 233, 233, 0.22, 0.16);
    this.blip('sawtooth', 440, 415, 0.3, 0.14, 0.16);
    this.noiseBurst(0.3, 0.1, 1200, 'highpass', 0.05);
  }

  /** Guard gives up searching: a falling, relieved phrase. */
  giveUp() {
    this.blip('triangle', 392, 330, 0.2, 0.08);
    this.blip('triangle', 330, 262, 0.26, 0.08, 0.16);
  }

  /** Level complete: a warm little arpeggio. */
  levelWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.blip('sine', f, f, 0.3, 0.14, i * 0.1));
    this.blip('sine', 1319, 1319, 0.5, 0.1, 0.42);
  }

  /** Caught: a low, final thud and a falling tone. */
  caught() {
    this.blip('sawtooth', 160, 40, 0.7, 0.2);
    this.noiseBurst(0.4, 0.2, 300);
  }

  /** UI click: a tiny tick. */
  uiClick() {
    this.blip('sine', 880, 660, 0.06, 0.08);
  }

  /** Exit door unlocked: a soft shimmer when all shards are taken. */
  exitUnlock() {
    this.blip('sine', 784, 784, 0.2, 0.1);
    this.blip('sine', 1175, 1175, 0.3, 0.1, 0.09);
  }

  /** Near-miss heartbeat: a quiet double-thump when a cone almost touches you. */
  heartbeat() {
    this.blip('sine', 70, 45, 0.12, 0.16);
    this.blip('sine', 65, 40, 0.12, 0.12, 0.16);
  }

  /**
   * A sparse music-box loop while playing: one note every ~0.9 s from a
   * minor pentatonic ladder, quieter while the alarm is up so the tension
   * comes from the drone instead. Call every frame; it schedules itself.
   */
  updateMusic(dt, alarm) {
    if (!this.ctx) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = alarm > 0.4 ? 1.4 : 0.85;
    const ladder = [440, 523, 587, 659, 784, 880];
    const note = ladder[this.musicStep % ladder.length];
    this.musicStep += 1;
    const volume = alarm > 0.4 ? 0.03 : 0.05;
    this.blip('sine', note, note, 0.7, volume);
    if (this.musicStep % 4 === 0) {
      this.blip('sine', note / 2, note / 2, 0.9, volume * 0.8);
    }
  }
}
