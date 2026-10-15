'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkResponse,readUid,type2Adapter,isSupportedWriter}=require('../pcsc-apdu.cjs');

test('PC/SC APDU must end in 9000 (no silent write success)',()=>{
 assert.deepEqual(checkResponse(Buffer.from([1,2,0x90,0x00]),'test'),Buffer.from([1,2]));
 assert.throws(()=>checkResponse([0x63,0],'test'),/6300/);
 assert.throws(()=>checkResponse([0x90],'test'),/incompleta/);
});
test('Reads UID and bounded NTAG memory via pseudo APDUs',async()=>{
 const calls=[];
 const card={transmit:async bytes=>{calls.push(Buffer.from(bytes));const cmd=Buffer.from(bytes);if(cmd[1]===0xCA)return Buffer.from([0x04,0x11,0x22,0x33,0x90,0]);if(cmd[1]===0xB0)return Buffer.concat([Buffer.alloc(cmd[4],0x42),Buffer.from([0x90,0])]);return Buffer.from([0x90,0]);}};
 assert.equal(await readUid(card),'04112233');
 const reader=type2Adapter(card,'ACS ACR122U 0');
 assert.equal((await reader.read(4,16)).length,16);
 assert.deepEqual([...calls[0]],[0xFF,0xCA,0,0,0]);
 assert.deepEqual([...calls[1]],[0xFF,0xB0,0,4,16]);
 await reader.write(4,[1,2,3,4]);
 assert.deepEqual([...calls[2]],[0xFF,0xD6,0,4,4,1,2,3,4]);
 await assert.rejects(reader.write(3,[1,2,3,4]),/vietata/);
 await assert.rejects(reader.read(4,18),/multipla/);
});
test('Other reader models can use PC/SC UID but not NDEF writes',async()=>{
 assert.equal(isSupportedWriter('ACS ACR122U PICC Interface'),true);
 assert.equal(isSupportedWriter('Generic Smart Card Reader'),false);
 const generic=type2Adapter({transmit:async()=>[0x90,0]},'Generic Smart Card Reader');
 await assert.rejects(generic.write(4,[0,0,0,0]),/solo per/);
});
