// One reusable audio context, unlocked from a tap. No audio files or downloads.
let context = null;
const activeNodes = new Set();
export const SOUND_PATTERNS = Object.freeze({
  success: [[0, 1046.5, 0.07, 'sine'], [0.065, 1396.9, 0.10, 'sine']],
  duplicate: [[0, 554.4, 0.09, 'sine'], [0.17, 554.4, 0.09, 'sine']],
  error: [[0, 293.7, 0.17, 'triangle'], [0.16, 196, 0.20, 'triangle']],
});

export function prepareAudio() {
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return false;
    if (!context || context.state === 'closed') context = new Audio();
    if (context.state === 'suspended' || context.state === 'interrupted') context.resume().catch(() => {});
    return true;
  } catch (_) { return false; }
}

export function playSound(kind = 'success', volume = 60) {
  if (!prepareAudio() || !context || context.state !== 'running') return false;
  const pattern = SOUND_PATTERNS[kind];
  const level = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
  if (!pattern || !level) return false;
  try {
    // Rapid reads replace the previous tone instead of accumulating oscillators.
    for (const node of activeNodes) { try { node.stop(); } catch (_) {} }
    activeNodes.clear();
    const now = context.currentTime + 0.008;
    for (const [offset, frequency, duration, type] of pattern) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + offset;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16 * level, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      activeNodes.add(oscillator);
      oscillator.onended = () => { activeNodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.015);
    }
    return true;
  } catch (_) { return false; } // Audio failure is never an NFC failure.
}
