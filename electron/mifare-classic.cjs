'use strict';
/**
 * Conservative NDEF-on-MIFARE-Classic-1K support for PC/SC ACR122U.
 * Supports ALREADY NDEF formatted cards with valid MAD1 and NFC Forum AID 03 E1.
 * Writes ONLY existing NDEF data blocks (never manufacturer, MAD, trailers, keys).
 * No sector-key brute force, no card cloning, no access-control sector editing.
 */
const {encodeMessage,tlv,extractTlv,parseMessage,assertVerifiedNdef}=require('./ndef.cjs');

const KEYS=Object.freeze({
  MAD:'A0A1A2A3A4A5', NDEF:'D3F7D3F7D3F7', DEFAULT:'FFFFFFFFFFFF',
});

function madCrc(data) {
  if(!Buffer.isBuffer(data)||data.length!==32)throw new Error('Directory MAD1 non valida.');
  // MIFARE-MAD CRC8: polynomial 0x1D, preset 0xC7 (NXP AN10787 / libfreefare).
  let crc=0xC7;
  for(let i=1;i<32;i++){
    crc^=data[i];
    for(let j=0;j<8;j++)crc=(crc&0x80)?((crc<<1)^0x1D)&0xFF:(crc<<1)&0xFF;
  }
  return crc;
}
function madSectors(mad) {
  if(!Buffer.isBuffer(mad)||mad.length!==32||mad[0]!==madCrc(mad))
    throw new Error('Directory MAD1 assente o CRC non valido: tag Classic non identificato come NDEF. Nessuna scrittura eseguita.');
  const sectors=[];
  for(let s=1;s<=15;s++) {
    const i=2+(s-1)*2;
    if(mad[i]===0x03&&mad[i+1]===0xE1)sectors.push(s);
  }
  if(!sectors.length) throw new Error('MIFARE Classic 1K senza settori NDEF nella directory MAD. La scheda va prima formattata NDEF con uno strumento dedicato; nessuna modifica effettuata.');
  if(sectors.some((s,i)=>i>0&&s!==sectors[i-1]+1))throw new Error('Settori NDEF non contigui: scrittura bloccata per sicurezza.');
  return sectors;
}
function decodeAccess(trailer) {
  if(!Buffer.isBuffer(trailer)||trailer.length!==16)throw new Error('Trailer settore non disponibile.');
  const b6=trailer[6],b7=trailer[7],b8=trailer[8];
  const rules=[];
  for(let i=0;i<4;i++){
    const c1=(b7>>(4+i))&1, c2=(b8>>i)&1, c3=(b8>>(4+i))&1;
    if(((b6>>i)&1)!==(c1^1) || ((b6>>(4+i))&1)!==(c2^1) || ((b7>>i)&1)!==(c3^1))
      throw new Error('Bit di accesso MIFARE inconsistenti: scrittura bloccata.');
    rules.push((c1<<2)|(c2<<1)|c3);
  }
  return rules;
}
function writableWith(rule,keyType) {
  return rule===0 || (keyType==='B'&&[4,6,3].includes(rule));
  // 000 A/B; 100,110,011 only B. 010,001,101,111 cannot be written.
}
function blocksForSectors(sectors){return sectors.flatMap(s=>[s*4,s*4+1,s*4+2]);}
async function authenticateAny(reader, block, candidates) {
  let last;
  for(const [keyName,type] of candidates){
    try{await reader.authenticate(block,KEYS[keyName],type);return {keyName,type};}
    catch(e){last=e;}
  }
  throw new Error(`Autenticazione settore ${Math.floor(block/4)} non riuscita con le chiavi NDEF pubbliche. ${last?.message||''}`.trim());
}
async function discoverClassic(reader,{forWrite=false}={}) {
  // Authenticate sector zero strictly for reading; never modify it.
  await authenticateAny(reader,1,[['MAD','A'],['DEFAULT','A']]);
  const a=Buffer.from(await reader.readBlock(1));
  const b=Buffer.from(await reader.readBlock(2));
  let madGpb=null;
  try {madGpb=Buffer.from(await reader.readBlock(3))[9];}
  catch(err){if(forWrite)throw new Error('GPB MAD non leggibile: impossibile confermare la formattazione NDEF. Nessuna scrittura eseguita.');}
  const mad=Buffer.concat([a,b]);
  const sectors=madSectors(mad);
  const blocks=blocksForSectors(sectors);
  const dataBlocks=[];
  const sectorAccess=new Map();
  const readKeys=new Map();
  const formatWarnings=[];
  if(madGpb!==null && ((madGpb&0x80)===0 || (madGpb&0x03)!==1)) {
    formatWarnings.push(`MAD: GPB 0x${madGpb.toString(16).padStart(2,'0').toUpperCase()} non conforme a MAD1.`);
  }
  for(const sector of sectors){
    const first=sector*4;
    const credential=await authenticateAny(reader,first,[['NDEF','A'],['DEFAULT','A'],['DEFAULT','B']]);
    readKeys.set(sector,credential);
    let trailer=null;
    try {trailer=Buffer.from(await reader.readBlock(first+3));}
    catch(err){if(forWrite)throw new Error(`Settore ${sector}: trailer non leggibile, impossibile verificare GPB e ACL. Nessuna scrittura eseguita.`);}
    if(trailer){
      const gpb=trailer[9];
      if(gpb!==0x40)formatWarnings.push(`Settore ${sector}: GPB 0x${gpb.toString(16).padStart(2,'0').toUpperCase()} non conforme al profilo NDEF scrivibile 0x40.`);
      if(forWrite)sectorAccess.set(sector,decodeAccess(trailer));
    }
    for(let b=first;b<first+3;b++)dataBlocks.push(Buffer.from(await reader.readBlock(b)));
  }
  const area=Buffer.concat(dataBlocks);
  return {sectors,blocks,area,sectorAccess,readKeys,capacity:area.length,formatWarnings};
}
async function readClassicTag(reader) {
  const layout=await discoverClassic(reader);
  const raw=extractTlv(layout.area);
  const records=raw && raw.bytes.length ? parseMessage(raw.bytes) : [];
  const reason=!raw ? `Settori ${layout.sectors.join(', ')}: TLV NDEF non trovato.`
    : !raw.bytes.length ? 'TLV NDEF presente, ma vuoto (lunghezza 0): nessun testo salvato nella memoria NDEF.' : '';
  const formatWarning=layout.formatWarnings.join(' ');
  return {supported:true,capacity:layout.capacity,records,reason,formatWarning};
}
async function preflightWrite(reader, layout, count) {
  const approvals=new Map();
  const changed=layout.blocks.slice(0,count);
  const sectors=[...new Set(changed.map(b=>Math.floor(b/4)))];
  for(const s of sectors){
    const rules=layout.sectorAccess.get(s);
    const affected=changed.filter(block=>Math.floor(block/4)===s);
    let chosen=null;
    // Check ALL destination blocks' access bits before choosing a key.
    for(const candidate of [['NDEF','A'],['DEFAULT','A'],['DEFAULT','B']]){
      const type=candidate[1];
      if(!affected.every(b=>writableWith(rules[b%4],type)))continue;
      try {await reader.authenticate(s*4,KEYS[candidate[0]],type);chosen={keyName:candidate[0],type};break;}
      catch(_){/* try next PUBLIC key only */}
    }
    if(!chosen)throw new Error(`Settore ${s}: la scrittura NDEF richiede una chiave autorizzata o permessi differenti. Nessun dato è stato scritto.`);
    approvals.set(s,chosen);
  }
  return approvals;
}
async function writeClassicTag(reader,request) {
  const data=tlv(encodeMessage(request));
  const layout=await discoverClassic(reader,{forWrite:true});
  if(layout.formatWarnings.length) throw new Error(`Formattazione Classic NDEF non standard: ${layout.formatWarnings.join(' ')} Nessuna scrittura tentata; non modifico MAD, GPB o settori riservati.`);
  if(data.length>layout.capacity)throw new Error(`MIFARE Classic 1K: servono ${data.length} byte, disponibili ${layout.capacity}.`);
  if(!(layout.area[0]===0x03 || (layout.area[0]===0x00 && layout.area.every(x=>x===0)) || layout.area[0]===0xFE))
    throw new Error('Contenuto Classic non riconosciuto come un singolo TLV NDEF: scrittura bloccata per sicurezza.');
  if(layout.area[0]===0x03) {
    const previous=extractTlv(layout.area);
    if(!previous)throw new Error('TLV NDEF precedente incompleto: nessuna scrittura eseguita.');
  }
  const count=Math.ceil(data.length/16);
  const credentials=await preflightWrite(reader,layout,count);
  const updated=Buffer.from(layout.area);
  data.copy(updated,0);
  const original=layout.area;
  const changed=layout.blocks.slice(0,count).map((block,i)=>({block,bytes:updated.subarray(i*16,i*16+16),old:original.subarray(i*16,i*16+16)}));
  const reauth=async block=>{const s=Math.floor(block/4),key=credentials.get(s);await reader.authenticate(block,KEYS[key.keyName],key.type);};
  // First block temporarily signals an EMPTY NDEF TLV. Subsequent blocks and
  // final first-block commit are verified independently. Not atomic physically.
  const first=Buffer.from(changed[0].bytes);first[0]=0x03;first[1]=0x00;first[2]=0xFE;
  let touched=0;
  try{
    await reauth(changed[0].block);await reader.writeBlock(changed[0].block,first);touched++;
    for(const item of changed.slice(1)){
      await reauth(item.block);await reader.writeBlock(item.block,item.bytes);touched++;
    }
    await reauth(changed[0].block);await reader.writeBlock(changed[0].block,changed[0].bytes);touched++;
    for(const item of changed){
      await reauth(item.block);
      const verified=Buffer.from(await reader.readBlock(item.block));
      if(!verified.equals(item.bytes))throw new Error(`Verifica fallita sul blocco ${item.block}.`);
    }
    // Re-authenticate MAD and NDEF sectors from scratch to confirm that the
    // resulting tag can be decoded as NDEF, rather than trusting 9000 alone.
    const reread=await readClassicTag(reader);
    assertVerifiedNdef(reread.records,request);
    if(reread.formatWarning) throw new Error(`Formattazione NDEF non conforme: ${reread.formatWarning}`);
    return {bytes:data.length,capacity:layout.capacity,kind:request.kind,format:'MIFARE Classic 1K NDEF',verifiedRecords:reread.records};
  }catch(err){
    const detail=err?.message||String(err);
    // Once write started, tell user the tag may be partially modified.
    throw new Error(touched?`Scrittura interrotta: ${detail}. Il tag potrebbe contenere dati NDEF parziali, riprova senza rimuoverlo.`:detail);
  }
}
module.exports={KEYS,madCrc,madSectors,decodeAccess,writableWith,blocksForSectors,discoverClassic,readClassicTag,writeClassicTag};
