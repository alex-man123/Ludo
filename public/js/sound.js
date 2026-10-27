// Efecte sonore scurte generate cu Web Audio (fără fișiere audio).

import { settings } from './settings.js';

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, duration, { type = 'sine', gain = 0.07, delay = 0, slideTo } = {}) {
  if (!settings.sound) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sound = {
  /** Creează contextul audio dinainte (la un clic al utilizatorului), nu în mijlocul unei mutări. */
  warmup() { if (settings.sound) audio(); },
  roll() { for (let i = 0; i < 5; i++) tone(180 + Math.random() * 120, 0.05, { type: 'square', gain: 0.025, delay: i * 0.09 }); },
  step() { tone(620, 0.06, { type: 'triangle', gain: 0.04 }); },
  enter() { tone(440, 0.12, { type: 'triangle', slideTo: 660 }); },
  capture() { tone(520, 0.25, { type: 'sawtooth', gain: 0.04, slideTo: 140 }); },
  finish() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.08 })); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.06, delay: i * 0.12 })); },
  turn() { tone(880, 0.08, { gain: 0.03 }); },
};
