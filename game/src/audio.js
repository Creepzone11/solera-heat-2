// Sound, synthesised live with WebAudio: four radio stations (a bassline
// and a lead line per station, sequenced from a scale — no recordings, no
// copyrighted music), an engine hum that follows the speed, a two-tone
// police siren, and one-shot effects for shots, crashes and rewards.
// Nothing plays until the first user gesture creates the context.
import { RADIO } from './config.js';

function noteFreq(root, semitone) { return root * Math.pow(2, semitone / 12); }

export function createAudio() {
  const audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    stationIndex: 0, muted: false, sirenNodes: null, engineNodes: null,
    stepTimer: null, step: 0,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = 0.16;
      audio.musicGain.connect(audio.master);
      audio.sfxGain = audio.ctx.createGain();
      audio.sfxGain.gain.value = 0.5;
      audio.sfxGain.connect(audio.master);
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, gain, when) {
    if (!audio.ctx) return;
    const t = when || audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(audio.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, gain, lowpass) {
    if (!audio.ctx) return;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const g = audio.ctx.createGain();
    g.gain.value = gain || 0.4;
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.sfxGain);
    src.start();
  }

  /** The radio sequencer: one step per 16th note, bass on the beat, lead wandering the scale. */
  function startRadio() {
    if (!ensure() || audio.stepTimer) return;
    audio.step = 0;
    const station = RADIO[audio.stationIndex];
    const stepDur = 60 / station.bpm / 4;
    audio.stepTimer = window.setInterval(() => {
      if (!audio.ctx || audio.muted) return;
      const s = audio.step;
      const scale = station.scale;
      if (s % 4 === 0) {
        const bass = noteFreq(station.root / 2, scale[Math.floor(s / 4) % scale.length]);
        blip(bass, stepDur * 3.2, station.wave, 0.22, audio.ctx.currentTime);
      }
      if (s % 2 === 1) {
        const hat = audio.ctx.createOscillator();
        const g = audio.ctx.createGain();
        hat.type = 'square';
        hat.frequency.value = 6000;
        g.gain.setValueAtTime(0.03, audio.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.03);
        hat.connect(g);
        g.connect(audio.musicGain);
        hat.start();
        hat.stop(audio.ctx.currentTime + 0.04);
      }
      if (s % 8 === 4) {
        const lead = noteFreq(station.root * 2, scale[(s * 7) % scale.length] + 12);
        const osc = audio.ctx.createOscillator();
        const g = audio.ctx.createGain();
        osc.type = station.wave;
        osc.frequency.value = lead;
        g.gain.setValueAtTime(0.08, audio.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + stepDur * 3);
        osc.connect(g);
        g.connect(audio.musicGain);
        osc.start();
        osc.stop(audio.ctx.currentTime + stepDur * 3);
      }
      audio.step += 1;
    }, stepDur * 1000);
  }

  audio.start = function start() {
    if (!ensure()) return;
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    startRadio();
    startEngine();
  };

  function startEngine() {
    if (!audio.ctx || audio.engineNodes) return;
    const osc = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    g.gain.value = 0.0;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    osc.connect(filter);
    filter.connect(g);
    g.connect(audio.sfxGain);
    osc.start();
    audio.engineNodes = { osc, gain: g };
  }

  audio.setEngine = function setEngine(speed, maxSpeed) {
    if (!audio.engineNodes || !audio.ctx) return;
    const ratio = Math.abs(speed) / maxSpeed;
    audio.engineNodes.osc.frequency.value = 45 + ratio * 130;
    audio.engineNodes.gain.gain.value = audio.muted ? 0 : 0.02 + ratio * 0.05;
  };

  audio.nextStation = function nextStation() {
    audio.stationIndex = (audio.stationIndex + 1) % RADIO.length;
    return RADIO[audio.stationIndex].name;
  };

  audio.stationName = function stationName() { return RADIO[audio.stationIndex].name; };

  audio.siren = function siren(on) {
    if (!ensure()) return;
    if (on && !audio.sirenNodes) {
      const osc = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 700;
      g.gain.value = 0.05;
      const lfo = audio.ctx.createOscillator();
      const lfoGain = audio.ctx.createGain();
      lfo.frequency.value = 0.9;
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      g.connect(audio.sfxGain);
      osc.start();
      lfo.start();
      audio.sirenNodes = { osc, lfo, gain: g };
    } else if (!on && audio.sirenNodes) {
      try { audio.sirenNodes.osc.stop(); audio.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      audio.sirenNodes = null;
    }
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    return audio.muted;
  };

  audio.sfx = function sfx(name) {
    if (!ensure()) return;
    switch (name) {
      case 'shot': noiseBurst(0.12, 0.5, 3000); blip(180, 0.08, 'square', 0.25); break;
      case 'enemyShot': noiseBurst(0.1, 0.3, 2000); break;
      case 'crash': noiseBurst(0.3, 0.6, 500); blip(70, 0.25, 'sawtooth', 0.3); break;
      case 'explosion': noiseBurst(0.7, 0.8, 300); blip(50, 0.6, 'sawtooth', 0.4); break;
      case 'objective': blip(660, 0.12, 'sine', 0.25); window.setTimeout(() => blip(880, 0.18, 'sine', 0.25), 110); break;
      case 'reward': [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 120)); break;
      case 'job': blip(440, 0.15, 'triangle', 0.25); window.setTimeout(() => blip(587, 0.2, 'triangle', 0.25), 140); break;
      case 'fail': blip(220, 0.3, 'sawtooth', 0.25); window.setTimeout(() => blip(165, 0.4, 'sawtooth', 0.25), 160); break;
      case 'down': blip(330, 0.1, 'square', 0.2); break;
      case 'buy': blip(990, 0.12, 'sine', 0.3); break;
      default: blip(440, 0.1, 'sine', 0.2); break;
    }
  };

  return audio;
}
