'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {WinScardBridge,defaultExePath}=require('../winscard-bridge.cjs');
class FakeProcess extends EventEmitter {
 constructor(){super();this.stdout=new PassThrough();this.stderr=new PassThrough();this.stdin=new PassThrough();this.stdin.setEncoding('utf8');this.sent='';this.stdin.on('data',part=>{this.sent+=part;});}
 emitLine(str){this.stdout.write(str+'\n');}
 kill(){this.emit('exit',0,null);}
}
const b64=text=>Buffer.from(text).toString('base64');
test('Standalone helper path resolves from resources when packaged',()=>{
 assert.equal(defaultExePath(true,'C:\\Temp\\Electron').includes('pcsc'),true);
});
test('Protocol initialization, device enumeration, insertion, reply and removal',async()=>{
 const child=new FakeProcess();const bridge=new WinScardBridge({platform:'win32',exePath:'X',existsFn:()=>true,spawnFn:()=>child});
 const events=[];bridge.on('event',e=>events.push(e));
 const start=bridge.start();child.emitLine('READY');await start;
 child.emitLine('READERS\t'+b64('ACS ACR122U PICC Interface'));
 child.emitLine('PRESENT\t'+b64('ACS ACR122U PICC Interface')+'\t1');
 assert.equal(events[0].readers.length,1);assert.equal(events[1].token,1);
 const request=bridge.transmit('ACS ACR122U PICC Interface',1,[0xFF,0xCA,0,0,0]);
 assert.match(child.sent,/TRANSMIT\t1\t/);
 child.emitLine('REPLY\t1\tOK\t04AABBCC9000');
 assert.deepEqual(await request,Buffer.from('04AABBCC9000','hex'));
 child.emitLine('REMOVED\t'+b64('ACS ACR122U PICC Interface')+'\t1');
 assert.equal(events[2].type,'removed');bridge.stop();
});
test('APDU transport errors, whitelist, missing helper, and no Windows checks',async()=>{
 const bridge=new WinScardBridge({platform:'linux',exePath:'X',existsFn:()=>true});
 await assert.rejects(bridge.start(),/richiede Windows/);
 const missing=new WinScardBridge({platform:'win32',exePath:'not-exists',existsFn:()=>false});
 await assert.rejects(missing.start(),/mancante/);
 const child=new FakeProcess();const run=new WinScardBridge({platform:'win32',exePath:'X',existsFn:()=>true,spawnFn:()=>child});
 const start=run.start();child.emitLine('READY');await start;
 await assert.rejects(run.transmit('Reader',1,[0x00,0xA4,0,0,0]),/non consentito/);
 const request=run.transmit('Reader',1,[0xFF,0xB0,0,4,4]);
 child.emitLine('REPLY\t1\tERR\t'+b64('Tag rimosso'));
 await assert.rejects(request,/Tag rimosso/);
 run.stop();
});
test('FATAL protocol produces a meaningful Windows Smart Card error',async()=>{
 const child=new FakeProcess();const run=new WinScardBridge({platform:'win32',exePath:'X',existsFn:()=>true,spawnFn:()=>child});
 const start=run.start();child.emitLine('FATAL\t'+b64('Servizio Smart Card inattivo'));
 await assert.rejects(start,/Servizio Smart Card inattivo/);run.stop();
});
