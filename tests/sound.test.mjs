import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/js/sound.mjs', import.meta.url),'utf8').replaceAll('export ', '');
function setup(withAudio=true) {
  const notes = []; let contexts=0;
  class Audio {
    constructor() { contexts++; this.state='running'; this.currentTime=1; this.destination={}; }
    resume() { this.state='running'; return Promise.resolve(); }
    createOscillator() {
      const note = {};
      return {frequency:{setValueAtTime(value){note.frequency=value;}},set type(value){note.type=value;},
        connect(){},disconnect(){},start(time){note.start=time; notes.push(note);},stop(time){note.stop=time;}};
    }
    createGain() { return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}; }
  }
  const context = vm.createContext(withAudio? {AudioContext:Audio} : {});
  vm.runInContext(source,context);
  return {run: code=>vm.runInContext(code,context), notes, contexts:()=>contexts};
}

test('tre pattern acustici differenti', () => {
  const s=setup();
  const signatures=[];
  for(const name of ['success','duplicate','error']) {
    assert.equal(s.run(`playSound('${name}', 65)`),true);
    signatures.push(s.notes.slice(-2).map(n=>n.frequency).join(','));
  }
  assert.equal(new Set(signatures).size,3);
});
test('nessun audio con volume zero', () => {
  const s=setup();
  assert.equal(s.run("playSound('success', 0)"),false);
  assert.equal(s.notes.length,0);
});
test('un solo AudioContext riutilizzato', () => {
  const s=setup();
  s.run("prepareAudio(); playSound('success'); playSound('error');");
  assert.equal(s.contexts(),1);
});
test('assenza AudioContext non genera eccezioni', () => {
  const s=setup(false);
  assert.equal(s.run("playSound('error')"),false);
});
test('pattern non riconosciuto non genera suoni', () => {
  const s=setup();
  assert.equal(s.run("playSound('unknown')"),false);
  assert.equal(s.notes.length,0);
});
