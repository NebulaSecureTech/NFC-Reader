'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PcscManager}=require('../pcsc-manager.cjs');
const {madCrc,KEYS}=require('../mifare-classic.cjs');
const {encodeMessage,tlv}=require('../ndef.cjs');
const wait=()=>new Promise(resolve=>setTimeout(resolve,160));
class ClassicPcscBridge extends EventEmitter {
 constructor({ndef=true,readOnly=false}={}) {
  super();this.name='ACS ACR122U PICC Interface 0';this.atr='3B8F8001804F0CA000000306030001000000006A';
  this.token=1;this.load='';this.authorized=-1;this.writes=[];
  this.blocks=Array.from({length:64},()=>Buffer.alloc(16));
  const mad=Buffer.alloc(32);mad[1]=1;if(ndef){mad.set([3,0xE1,3,0xE1],2);}mad[0]=madCrc(mad);
  mad.copy(this.blocks[1]);mad.subarray(16).copy(this.blocks[2]);
  this.blocks[3].set(Buffer.from('787788C1','hex'),6);
  for(const sector of [1,2])this.blocks[4*sector+3].set(Buffer.from(readOnly?'7F078F40':'7F078840','hex'),6);
  const payload=tlv(encodeMessage({kind:'text',value:'Prima lettura'}));payload.subarray(0,16).copy(this.blocks[4]);payload.subarray(16).copy(this.blocks[5]);
 }
 async start(){this.emit('event',{type:'readers',readers:[this.name]});}
 stop(){}
 insert(){this.emit('event',{type:'present',reader:this.name,token:this.token,atr:this.atr});}
 remove(){this.emit('event',{type:'removed',reader:this.name,token:this.token});this.token++;this.load='';this.authorized=-1;}
 async transmit(reader,token,buf){
  assert.equal(reader,this.name);assert.equal(token,this.token);
  const cmd=Buffer.from(buf);const ok=Buffer.from([0x90,0]),fail=Buffer.from([0x63,0]);
  if(cmd[1]===0xCA)return Buffer.from([4,5,6,7,0x90,0]);
  if(cmd[1]===0x82){this.load=cmd.subarray(5).toString('hex').toUpperCase();return ok;}
  if(cmd[1]===0x86){
   const sector=Math.floor(cmd[7]/4);
   if((sector===0&&this.load===KEYS.MAD)||(sector!==0&&this.load===KEYS.NDEF)){
    if(cmd[8]!==0x60)return fail;
    this.authorized=sector;return ok;
   }
   return fail;
  }
  if(cmd[1]===0xB0){
   const block=cmd[3];if(this.authorized!==Math.floor(block/4))return fail;
   return Buffer.concat([this.blocks[block],ok]);
  }
  if(cmd[1]===0xD6){
   const block=cmd[3];assert.equal(this.authorized,Math.floor(block/4));
   assert.ok(block>=4&&block%4!==3);
   this.writes.push(block);cmd.subarray(5).copy(this.blocks[block]);return ok;
  }
  return fail;
 }
}
test('Electron manager + WinSCard protocol writes MIFARE Classic 1K NDEF after read',async()=>{
 const bridge=new ClassicPcscBridge();const events=[];
 const mgr=new PcscManager(event=>events.push(event),bridge);await mgr.init();
 assert.equal(mgr.startScan().ok,true);
 bridge.insert();await wait();
 const read=events.find(e=>e.type==='reading');assert.equal(read.uid,'04050607');
 assert.equal(read.records[0].recordType,'text');assert.equal(Buffer.from(read.records[0].data).toString(),'Prima lettura');
 bridge.remove();mgr.stopScan();
 assert.equal(mgr.armWrite({kind:'text',value:'Ciao dal desktop'}).ok,true);
 bridge.insert();await wait();
 const res=events.find(e=>e.type==='write-result');
 assert.ok(res,res?.message||'No result');assert.equal(res.ok,true,res.message);
 assert.deepEqual([...new Set(bridge.writes)], [4,5]);
 const content=Buffer.concat([bridge.blocks[4],bridge.blocks[5]]);
 assert.ok(content.includes(Buffer.from('Ciao dal desktop')));
 mgr.shutdown();
});
test('Electron manager refuses Classic with no NDEF MAD (zero writes)',async()=>{
 const bridge=new ClassicPcscBridge({ndef:false});const events=[];
 const mgr=new PcscManager(e=>events.push(e),bridge);await mgr.init();
 assert.equal(mgr.armWrite({kind:'text',value:'Test'}).ok,true);
 bridge.insert();await wait();
 const error=events.find(e=>e.type==='write-result');assert.ok(error);assert.equal(error.ok,false);
 assert.match(error.message,/senza settori NDEF/);
 assert.deepEqual(bridge.writes,[]);mgr.shutdown();
});

test('Nuova presentazione legge davvero l’NDEF scritto dopo la scrittura',async()=>{
 const bridge=new ClassicPcscBridge();const events=[];
 const mgr=new PcscManager(e=>events.push(e),bridge);await mgr.init();
 assert.equal(mgr.armWrite({kind:'text',value:'Contenuto aggiornato'}).ok,true);
 bridge.insert();await wait();
 const result=events.find(e=>e.type==='write-result');
 assert.equal(result.ok,true,result.message);
 assert.equal(Buffer.from(result.verifiedRecords[0].data).toString(),'Contenuto aggiornato');
 bridge.remove();assert.equal(mgr.startScan().ok,true);
 bridge.insert();await wait();
 const read=events.find(e=>e.type==='reading');assert.ok(read);
 assert.equal(Buffer.from(read.records[0].data).toString(),'Contenuto aggiornato');
 mgr.shutdown();
});
