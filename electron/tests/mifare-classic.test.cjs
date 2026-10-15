'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {madCrc,madSectors,decodeAccess,readClassicTag,writeClassicTag,KEYS}=require('../mifare-classic.cjs');
const {classic1kAdapter}=require('../pcsc-apdu.cjs');

function classic({sectors=[1,2],access='7F078840',oldValue='Vecchio',known=true}={}) {
 const mem=Array.from({length:64},()=>Buffer.alloc(16));
 const mad=Buffer.alloc(32);mad[1]=1;
 for(const s of sectors){const i=2+(s-1)*2;mad[i]=3;mad[i+1]=0xE1;}
 mad[0]=madCrc(mad);mad.copy(mem[1]);mad.subarray(16).copy(mem[2]);
 mem[3]=Buffer.from('000000000000787788C1000000000000','hex');
 const last=Buffer.from(access,'hex');
 for(const s of sectors){mem[s*4+3].set(last,6);}
 const data=Buffer.from(oldValue,'utf8');
 const ndef=Buffer.concat([Buffer.from([0xD1,1,data.length+3,0x54,2,0x69,0x74]),data]);
 const bytes=Buffer.concat([Buffer.from([3,ndef.length]),ndef,Buffer.from([0xFE])]);
 for(let i=0;i<Math.ceil(bytes.length/16);i++)bytes.subarray(i*16,(i+1)*16).copy(mem[4+i+Math.floor(i/3)]);
 let auth=null;const written=[];let reads=0;
 return {
   mem,written,get reads(){return reads;},
   async authenticate(block,keyHex,type){
     const s=Math.floor(block/4);
     const wanted = s===0 ? KEYS.MAD : KEYS.NDEF;
     if(!known || type!=='A' || keyHex!==wanted)throw new Error('Autenticazione negata');
     auth=s;
   },
   async readBlock(block){
     assert.equal(Math.floor(block/4),auth,'authentication required');reads++;
     return Buffer.from(mem[block]);
   },
   async writeBlock(block,bytes){
     assert.equal(Math.floor(block/4),auth);assert.ok(block>=4&&block%4!==3);
     written.push(block);Buffer.from(bytes).copy(mem[block]);
   },
 };
}

test('CRC8 MAD1 and sectors tagged 03E1',()=>{
 const buf=Buffer.alloc(32);buf[1]=1;buf.set([3,0xE1,3,0xE1],2);buf[0]=madCrc(buf);
 assert.deepEqual(madSectors(buf),[1,2]);
 buf[0]^=0xFF;assert.throws(()=>madSectors(buf),/CRC/);
});
test('MIFARE Classic access bits: NDEF 7F0788 and B-only 787788',()=>{
 const trailer=Buffer.alloc(16);trailer.set([0x7F,0x07,0x88],6);
 assert.deepEqual(decodeAccess(trailer),[0,0,0,3]);
 trailer.set([0x78,0x77,0x88],6);
 assert.deepEqual(decodeAccess(trailer),[4,4,4,3]);
 trailer[6]=0;assert.throws(()=>decodeAccess(trailer),/inconsistenti/);
});
test('Read NDEF via existing MAD without modifying blocks',async()=>{
 const tag=classic();const result=await readClassicTag(tag);
 assert.equal(result.supported,true);
 assert.equal(Buffer.from(result.records[0].data).toString(),'Vecchio');
 assert.deepEqual(tag.written,[]);
});
test('Write text to existing NDEF sectors, never MAD/trailer or UID, readback',async()=>{
 const tag=classic();const before=tag.mem.map(x=>Buffer.from(x));
 const result=await writeClassicTag(tag,{kind:'text',value:'Ciao da NFC Reader!'});
 assert.match(result.format,/Classic 1K/);
 assert.ok(tag.written.length>2);assert.ok(tag.written.every(x=>x>=4&&x%4!==3));
 assert.deepEqual(tag.mem[1],before[1]);assert.deepEqual(tag.mem[2],before[2]);assert.deepEqual(tag.mem[3],before[3]);
 assert.deepEqual(tag.mem[7],before[7]);assert.deepEqual(tag.mem[11],before[11]);
 const read=await readClassicTag(tag);
 assert.equal(Buffer.from(read.records[0].data).toString(),'Ciao da NFC Reader!');
});
test('Multi-block URL roundtrip on two NDEF sectors',async()=>{
 const tag=classic();const url='https://example.org/doc/test/long-path/with-query?k=versione&v=2';
 await writeClassicTag(tag,{kind:'url',value:url});
 const read=await readClassicTag(tag);assert.equal(Buffer.from(read.records[0].data).toString(),url);
 assert.ok(tag.written.some(x=>x>=8));
});
test('No MAD, wrong CRC, protected authentication, no free space: zero writes',async()=>{
 const bad=classic();bad.mem[1][0]^=1;
 await assert.rejects(writeClassicTag(bad,{kind:'text',value:'ABC'}),/CRC/);assert.equal(bad.written.length,0);
 const no=classic({sectors:[]});
 await assert.rejects(writeClassicTag(no,{kind:'text',value:'ABC'}),/senza settori NDEF/);assert.equal(no.written.length,0);
 const locked=classic({known:false});
 await assert.rejects(writeClassicTag(locked,{kind:'text',value:'ABC'}),/Autenticazione/);assert.equal(locked.written.length,0);
 const big=classic({sectors:[1]});
 await assert.rejects(writeClassicTag(big,{kind:'text',value:'X'.repeat(120)}),/disponibili/);assert.equal(big.written.length,0);
});
test('Writer fails closed on readonly data access; no write APDU',async()=>{
 const t=classic();t.mem[7].set([0x7F,0x07,0x8F],6); // data blocks 010: no writes permitted
 await assert.rejects(writeClassicTag(t,{kind:'text',value:'hi'}));assert.equal(t.written.length,0);
});
test('APDU Classic auth and bounds; refuses MAD and sector trailer writes',async()=>{
 const apdus=[];
 const card={transmit:async cmd=>{cmd=Buffer.from(cmd);apdus.push(cmd);if(cmd[1]===0xB0)return Buffer.concat([Buffer.alloc(16),Buffer.from([0x90,0])]);return Buffer.from([0x90,0]);}};
 const reader=classic1kAdapter(card,'ACS ACR122U PICC Interface 0');
 await reader.authenticate(4,KEYS.NDEF,'A');
 assert.equal(apdus[0].toString('hex').toUpperCase(),'FF82000006D3F7D3F7D3F7');
 assert.equal(apdus[1].toString('hex').toUpperCase(),'FF860000050100046000');
 await reader.readBlock(4);assert.equal(apdus[2].toString('hex').toUpperCase(),'FFB0000410');
 await reader.writeBlock(4,Buffer.alloc(16));assert.equal(apdus[3][4],16);
 for(const n of [0,1,2,3,7,63])await assert.rejects(reader.writeBlock(n,Buffer.alloc(16)),/Vietata/);
});

test('GPB Classic NDEF non standard: nessuna scrittura, ma diagnosi in lettura',async()=>{
 const wrong=classic();wrong.mem[7][9]=0x00;
 const reading=await readClassicTag(wrong);
 assert.match(reading.formatWarning,/GPB 0x00/);
 assert.equal(Buffer.from(reading.records[0].data).toString(),'Vecchio');
 await assert.rejects(writeClassicTag(wrong,{kind:'text',value:'Nuovo'}),/Formattazione Classic NDEF non standard/);
 assert.deepEqual(wrong.written,[]);
 const madWrong=classic();madWrong.mem[3][9]=0x00;
 await assert.rejects(writeClassicTag(madWrong,{kind:'text',value:'Nuovo'}),/MAD.*GPB/);
 assert.deepEqual(madWrong.written,[]);
});
test('TLV NDEF vuoto: il lettore distingue assenza contenuto e UID',async()=>{
 const tag=classic();tag.mem[4].fill(0);tag.mem[4].set([0x03,0x00,0xFE]);
 const data=await readClassicTag(tag);
 assert.equal(data.records.length,0);
 assert.match(data.reason,/vuoto.*lunghezza 0/);
});
test('Scrittura Classic ritorna record decodificati verificati',async()=>{
 const tag=classic();const out=await writeClassicTag(tag,{kind:'text',value:'NFC verificato'});
 assert.equal(out.verifiedRecords.length,1);
 assert.equal(Buffer.from(out.verifiedRecords[0].data).toString(),'NFC verificato');
});
