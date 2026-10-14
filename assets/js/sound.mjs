// Segnale di lettura sintetizzato localmente: nessun file audio e nessuna rete.
let context = null;

export function prepareAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    context ||= new Ctx();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

export function playReadSound() {
  if (!prepareAudio() || !context || context.state === 'closed') return;
  try {
    const when = context.currentTime;
    for (const [offset, frequency] of [[0, 880], [0.075, 1175]]) {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      amp.gain.setValueAtTime(0.0001, when + offset);
      amp.gain.exponentialRampToValueAtTime(0.075, when + offset + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + offset + 0.070);
      osc.connect(amp);
      amp.connect(context.destination);
      osc.start(when + offset);
      osc.stop(when + offset + 0.078);
      osc.onended = () => { osc.disconnect(); amp.disconnect(); };
    }
  } catch (_) { /* Un errore audio non deve mai interrompere la lettura. */ }
}
