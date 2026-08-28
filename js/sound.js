let enabled = true;
let context;

function tone(frequency, duration, { type = "triangle", volume = 0.035, delay = 0 } = {}) {
  if (!enabled) return;
  try {
    context ||= new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch { /* Audio is optional (e.g. unavailable before a user gesture). */ }
}

export const sound = {
  get enabled() { return enabled; },
  toggle() { enabled = !enabled; return enabled; },
  card() { tone(410, 0.07); },
  flip() { tone(520, 0.09, { type: "sine" }); },
  stock() { tone(350, 0.075); },
  foundation() { tone(600, 0.12); tone(760, 0.16, { delay: 0.08 }); },
  invalid() { tone(150, 0.12, { type: "sine" }); },
  clear() { tone(523, 0.12); tone(659, 0.14, { delay: 0.12 }); tone(784, 0.26, { delay: 0.25 }); },
  click() { tone(330, 0.05); },
};
