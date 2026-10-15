const {test}=require('node:test');
const assert=require('node:assert/strict');
const {encodeMessage,tlv,extractTlv,parseMessage,readCapability,readTag,writeTag,assertVerifiedNdef}=require('../ndef.cjs');
function tag(cap=144, readOnly=false) {
 const memory=Buffer.alloc(4+cap,0);
 memory[0]=0xE1;memory[1]=0x10;memory[2]=cap/8;memory[3]=readOnly?0x0F:0;
 memory[4]=0x03;memory[5]=0;memory[6]=0xFE;
 let writes=0;
 const reader={
  async read(page,length){const start=(page-3)*4;return Buffer.from(memory.subarray(start,start+length));},
  async write(page,bytes){const start=(page-3)*4;const data=Buffer.from(bytes);assert.equal(data.length,4);data.copy(memory,start);writes++;},
 };
 return {memory,reader,get writes(){return writes;}};
}
test('NDEF text e URL: round-trip con codifica ufficiale T/U',()=>{
 for(const data of [{kind:'text',value:'Ciao NFC! 😀'},{kind:'url',value:'https://www.example.com/path?a=1'}]){
  const encoded=encodeMessage(data);
  const parsed=parseMessage(encoded);
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].recordType,data.kind==='text'?'text':'url');
  assert.equal(Buffer.from(parsed[0].data).toString('utf8'),data.value);
 }
});
test('validazione URL non HTTP o vuoto',()=>{
 assert.throws(()=>encodeMessage({kind:'url',value:'javascript:alert(1)'}));
 assert.throws(()=>encodeMessage({kind:'text',value:'   '}));
 assert.throws(()=>encodeMessage({kind:'url',value:'bad-url'}));
});
test('NDEF Type 2: scrittura su pagine dati, CC intatto, read-back e record',async()=>{
 const t=tag(); const cc=Buffer.from(t.memory.subarray(0,4));
 const out=await writeTag(t.reader,{kind:'text',value:'Un test di scrittura NFC'});
 assert.ok(out.bytes>10);assert.deepEqual(t.memory.subarray(0,4),cc);
 assert.ok(t.writes>2);
 const record=await readTag(t.reader);
 assert.equal(record.supported,true);
 assert.equal(Buffer.from(record.records[0].data).toString('utf8'),'Un test di scrittura NFC');
});
test('URL su Type 2 e capacità massima tag',async()=>{
 const t=tag(48);
 const out=await writeTag(t.reader,{kind:'url',value:'https://www.a.it'});
 assert.ok(out.bytes<48);
 await assert.rejects(writeTag(t.reader,{kind:'text',value:'X'.repeat(60)}),/Tag troppo piccolo/);
});
test('CC invalido, sola lettura e TLV proprietario bloccano ogni scrittura',async()=>{
 const t=tag();t.memory[0]=0;
 await assert.rejects(writeTag(t.reader,{kind:'text',value:'X'}),/non riconosciuto/);assert.equal(t.writes,0);
 const r=tag(144,true);await assert.rejects(writeTag(r.reader,{kind:'text',value:'X'}),/sola lettura/);assert.equal(r.writes,0);
 const weird=tag();weird.memory[4]=0x01;
 await assert.rejects(writeTag(weird.reader,{kind:'text',value:'X'}),/non standard/);assert.equal(weird.writes,0);
});
test('Reader che non consente scrittura restituisce errore',async()=>{
 const t=tag();t.reader.write=async()=>{throw new Error('hardware denied');};
 await assert.rejects(writeTag(t.reader,{kind:'text',value:'Test'}),/hardware denied/);
});
test('TLV esteso e bounds',()=>{
 const bytes=Buffer.alloc(280,0x42);
 const encoded=tlv(bytes);const found=extractTlv(encoded);assert.deepEqual(found.bytes,bytes);
 assert.throws(()=>extractTlv(Buffer.from([0x03,0x12,0x41])),/supera/);
 assert.equal(readCapability(Buffer.from([0xe1,0x10,0x12,0])).capacity,144);
});

test('Fallback di sola lettura 16 byte dopo 6300 sulla pagina CC',async()=>{
 const cc=Buffer.from([0xE1,0x10,0x12,0x00]);
 const memory=Buffer.alloc(144);memory.set([0x03,0x00,0xFE]);
 const calls=[];
 const reader={
  async read(page,length){
   calls.push([page,length]);
   if(page===3&&length===4)throw new Error('Lettura pagina NDEF: il lettore ha risposto 6300.');
   if(page===3&&length===16)return Buffer.concat([cc,memory.subarray(0,12)]);
   return memory.subarray((page-4)*4,(page-4)*4+length);
  },
  async write(){throw new Error('Should not write in read-only probe');}
 };
 const result=await readTag(reader);
 assert.equal(result.supported,true);
 assert.deepEqual(calls[0],[3,4]);assert.deepEqual(calls[1],[3,16]);
});

// Version 1.8.3 - a tag is only verified when its NDEF payload decodes exactly.
test('Verifica NDEF confronta il testo letto, non soltanto i blocchi',()=>{
 const good=parseMessage(encodeMessage({kind:'text',value:'Nuovo dato'}));
 assert.equal(assertVerifiedNdef(good,{kind:'text',value:'Nuovo dato'}),true);
 assert.throws(()=>assertVerifiedNdef(good,{kind:'text',value:'Altro dato'}),/Verifica NDEF fallita/);
 assert.throws(()=>assertVerifiedNdef([],{kind:'text',value:'Nuovo dato'}),/Verifica NDEF fallita/);
 assert.throws(()=>assertVerifiedNdef(good,{kind:'url',value:'https://example.com'}),/Verifica NDEF fallita/);
});
test('NDEF malformato: un frame senza MB o ME non risulta leggibile',()=>{
 const frame=encodeMessage({kind:'text',value:'ciao'});
 const noMb=Buffer.from(frame);noMb[0]&=0x7F;
 assert.throws(()=>parseMessage(noMb),/MB/);
 const noMe=Buffer.from(frame);noMe[0]&=0xBF;
 assert.throws(()=>parseMessage(noMe),/ME/);
 const extra=Buffer.concat([frame,Buffer.from([0])]);
 assert.throws(()=>parseMessage(extra),/extra/);
});
