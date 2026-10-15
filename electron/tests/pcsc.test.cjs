'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PcscManager}=require('../pcsc-manager.cjs');
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
class FakeWinScardBridge extends EventEmitter {
 constructor(name='ACS ACR122U PICC Interface') {
  super();this.name=name;this.token=1;this.started=false;this.writes=0;
  this.memory=Buffer.alloc(148);this.memory.set([0xE1,0x10,0x12,0x00,0x03,0,0xFE]);
 }
 async start(){this.started=true;this.emit('event',{type:'readers',readers:[this.name]});}
 stop(){this.started=false;}
 async transmit(name,token,data){
  assert.equal(name,this.name);assert.equal(token,this.token);
  const cmd=Buffer.from(data);
  if(cmd[1]===0xCA)return Buffer.from([0x04,0xAA,0xBB,0xCC,0x90,0]);
  if(cmd[1]===0xB0){const pos=(cmd[3]-3)*4;return Buffer.concat([this.memory.subarray(pos,pos+cmd[4]),Buffer.from([0x90,0])]);}
  if(cmd[1]===0xD6){const pos=(cmd[3]-3)*4;cmd.subarray(5,9).copy(this.memory,pos);this.writes++;return Buffer.from([0x90,0]);}
  return Buffer.from([0x6A,0x81]);
 }
 insert(){this.emit('event',{type:'present',reader:this.name,token:this.token});}
 remove(){this.emit('event',{type:'removed',reader:this.name,token:this.token});this.token++;}
}
function fixture(name){const bridge=new FakeWinScardBridge(name);const events=[];const manager=new PcscManager(event=>events.push(event),bridge);return {bridge,events,manager};}
test('PCSC WinSCard bridge init, UID and NDEF, stop on request',async()=>{
 const m=fixture();await m.manager.init();assert.equal(m.manager.status().available,true);
 assert.equal(m.manager.status().readers.length,1);
 assert.equal(m.manager.startScan().ok,true);
 m.bridge.insert();await wait();
 const reads=m.events.filter(e=>e.type==='reading');assert.equal(reads.length,1);assert.equal(reads[0].uid,'04AABBCC');
 m.bridge.remove();m.manager.stopScan();m.bridge.insert();await wait();
 assert.equal(m.events.filter(e=>e.type==='reading').length,1);m.manager.shutdown();
});
test('PCSC NDEF Type 2 write, verify and cancel via bridge',async()=>{
 const m=fixture();await m.manager.init();
 assert.equal(m.manager.armWrite({kind:'text',value:'Ciao PC!'}).ok,true);
 assert.equal(m.manager.startScan().ok,false);
 m.bridge.insert();await wait();
 assert.equal(m.events.find(e=>e.type==='write-result')?.ok,true);
 assert.ok(m.bridge.writes>=2);
 assert.equal(m.manager.status().writing,false);
 m.bridge.remove();assert.equal(m.manager.armWrite({kind:'text',value:'Secondo'}).ok,true);
 assert.equal(m.manager.cancelWrite().ok,true);m.bridge.insert();await wait();
 assert.equal(m.events.filter(e=>e.type==='write-result').length,1);m.manager.shutdown();
});
test('Write refuses existing inserted tag until freshly presented',async()=>{
 const m=fixture();await m.manager.init();m.bridge.insert();await wait();
 assert.equal(m.manager.armWrite({kind:'url',value:'https://example.org'}).ok,true);
 await wait();assert.equal(m.bridge.writes,0);
 m.bridge.remove();m.bridge.insert();await wait();
 assert.ok(m.bridge.writes>0);m.manager.shutdown();
});
test('Reject unknown readers and unsafe URLs for writing',async()=>{
 const m=fixture('Generic PCSC Reader');await m.manager.init();
 assert.equal(m.manager.armWrite({kind:'text',value:'Test'}).ok,false);
 assert.equal(m.manager.armWrite({kind:'url',value:'javascript:alert(1)'}).ok,false);
 m.manager.startScan();m.bridge.insert();await wait();
 assert.equal(m.events.find(e=>e.type==='reading').uid,'04AABBCC');m.manager.shutdown();
});
test('Bridge error after startup disables scan rather than claiming online',async()=>{
 const m=fixture();await m.manager.init();m.bridge.emit('unavailable','Bridge terminato');
 assert.equal(m.manager.status().available,false);assert.equal(m.manager.startScan().ok,false);
 m.manager.shutdown();
});
