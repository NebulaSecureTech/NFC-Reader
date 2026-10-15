'use strict';
// Minimal, auditable Type 2 NDEF codec. This is NOT a generic MIFARE Classic/Desfire writer.
const {TextEncoder, TextDecoder} = require('node:util');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: false});
const URI_PREFIX = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'];
function assertWriteRequest(request) {
  if (!request || !['text', 'url'].includes(request.kind) || typeof request.value !== 'string') throw new Error('Tipo di scrittura non valido.');
  const value = request.value.trim();
  if (!value || value.length > 500) throw new Error('Inserisci fino a 500 caratteri.');
  if (request.kind === 'url') {
    let parsed; try { parsed = new URL(value); } catch { throw new Error('Inserisci un URL completo e valido.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Sono ammessi solo URL HTTP o HTTPS.');
  }
  return {kind: request.kind, value};
}
function encodeMessage(request) {
  const {kind,value} = assertWriteRequest(request);
  let type, payload;
  if (kind === 'text') {
    type = 0x54; // NFC RTD Text
    payload = Buffer.concat([Buffer.from([2]), Buffer.from('it'), Buffer.from(encoder.encode(value))]);
  } else {
    type = 0x55; // NFC RTD URI
    let chosen = 0;
    for (let i = 1; i < URI_PREFIX.length; i++) {
      if (value.startsWith(URI_PREFIX[i]) && URI_PREFIX[i].length > URI_PREFIX[chosen].length) chosen = i;
    }
    payload = Buffer.concat([Buffer.from([chosen]), Buffer.from(encoder.encode(value.slice(URI_PREFIX[chosen].length)))]);
  }
  if (payload.length > 255) throw new Error('Dato troppo lungo per il profilo NDEF supportato su PC (massimo 255 byte di payload).');
  return Buffer.concat([Buffer.from([0xD1, 0x01, payload.length, type]), payload]);
}
function tlv(message) {
  if (message.length > 0xFFFF) throw new Error('Messaggio NDEF troppo grande.');
  return Buffer.concat([Buffer.from(message.length < 0xFF ? [0x03, message.length] : [0x03,0xFF,(message.length >> 8)&0xFF,message.length&0xFF]),message,Buffer.from([0xFE])]);
}
function extractTlv(area) {
  let at = 0;
  while (at < area.length) {
    const type = area[at++];
    if (type === 0x00) continue;
    if (type === 0xFE) return null;
    if (at >= area.length) throw new Error('TLV troncato.');
    let len = area[at++];
    if (len === 0xFF) {
      if (at + 2 > area.length) throw new Error('Lunghezza TLV troncata.');
      len = area.readUInt16BE(at); at += 2;
    }
    if (at + len > area.length) throw new Error('La lunghezza TLV supera la memoria dichiarata.');
    if (type === 0x03) return {bytes: area.subarray(at,at+len), offset: at, length: len};
    at += len;
  }
  return null;
}
function parseMessage(bytes) {
  const records = [];
  let at = 0;
  while (at < bytes.length) {
    if (records.length >= 64) throw new Error('Troppi record NDEF.');
    const header = bytes[at++];
    if (records.length===0 && (header & 0x80)===0) throw new Error('Primo record NDEF senza marcatore MB.');
    if (records.length>0 && (header & 0x80)!==0) throw new Error('Marcatore MB ripetuto in NDEF.');
    if ((header & 0x20) !== 0) throw new Error('Record NDEF suddiviso in chunk non supportato.');
    if (at + 2 > bytes.length) throw new Error('Record NDEF incompleto.');
    const typeLength = bytes[at++];
    const sr = !!(header & 0x10);
    const hasId = !!(header & 0x08);
    const tnf = header & 0x07;
    let dataLength;
    if (sr) { dataLength = bytes[at++]; }
    else { if (at + 4 > bytes.length) throw new Error('Payload NDEF non valido.'); dataLength = bytes.readUInt32BE(at); at += 4; }
    let idLength = 0;
    if (hasId) {if(at>=bytes.length) throw new Error('ID NDEF incompleto.'); idLength=bytes[at++];}
    if (typeLength + idLength + dataLength > bytes.length - at) throw new Error('Payload NDEF incompleto.');
    const type = bytes.subarray(at,at+typeLength); at += typeLength;
    const id = bytes.subarray(at,at+idLength); at += idLength;
    const data = bytes.subarray(at,at+dataLength); at += dataLength;
    const record = {recordType:'unknown',data: Array.from(data), id: id.toString('utf8')};
    if (tnf === 1 && type.toString('utf8') === 'T' && data.length) {
      const langLen = data[0] & 0x3F;
      const utf16 = !!(data[0] & 0x80);
      if (1+langLen <= data.length) {
        record.recordType='text'; record.encoding=utf16?'utf-16':'utf-8'; record.lang=data.subarray(1,1+langLen).toString('ascii');
        record.data=Array.from(data.subarray(1+langLen));
      }
    } else if (tnf === 1 && type.toString('utf8') === 'U' && data.length) {
      record.recordType='url'; record.data=Array.from(encoder.encode((URI_PREFIX[data[0]] ?? '') + decoder.decode(data.subarray(1))));
    } else if (tnf === 2) {
      record.recordType='mime'; record.mediaType=type.toString('utf8');
    } else if (tnf === 0) {
      record.recordType='empty';
    } else {
      record.recordType=tnf === 1 ? 'well-known' : tnf===4 ? 'external' : 'unknown';
    }
    records.push(record);
    if (header & 0x40) {
      if(at!==bytes.length)throw new Error('Dati extra dopo il record finale NDEF.');
      break; // ME
    }
    if(at===bytes.length)throw new Error('Messaggio NDEF senza record finale (ME).');
  }
  return records;
}
function readCapability(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes[0] !== 0xE1 || (bytes[1] & 0xF0)!==0x10) return null;
  const capacity = bytes[2]*8;
  if (!capacity || capacity > 888) return null; // bounded NTAG/Ultralight profile only
  return {capacity, readOnly: (bytes[3]&0x0F)!==0, readProtected: (bytes[3]&0xF0)!==0, cc: Array.from(bytes.subarray(0,4))};
}
// Some PC/SC/ACR122 firmware combinations accept a four-page (16-byte) READ
// even if the 4-byte CC request fails. Both probes are read-only; do not use
// this as evidence that an unidentified card is safe to program.
async function readCapabilityPage(reader) {
  try { return Buffer.from(await reader.read(3,4)); }
  catch(err) {
    if (!/\b6300\b/.test(err?.message || '')) throw err;
    const block=Buffer.from(await reader.read(3,16));
    if (block.length < 4) throw new Error('Risposta CC incompleta dal lettore.');
    return block.subarray(0,4);
  }
}
async function readMemory(reader, capacity) {
  const result = Buffer.alloc(capacity);
  for (let off=0; off<capacity; off+=16) {
    const count = Math.min(16,capacity-off);
    const read = await reader.read(4 + off/4, count, 4, 16);
    if (!read || read.length < count) throw new Error('Lettura incompleta dal dispositivo PC/SC.');
    Buffer.from(read).copy(result,off,0,count);
  }
  return result;
}
async function readTag(reader) {
  const cc = readCapability(await readCapabilityPage(reader));
  if (!cc || cc.readProtected) return {supported:false, records:[], reason:'Tag non riconosciuto come NDEF Type 2 leggibile.'};
  const bytes = await readMemory(reader,cc.capacity);
  const raw = extractTlv(bytes);
  if (!raw) return {supported:true, ...cc, records:[]};
  return {supported:true, ...cc, records:parseMessage(raw.bytes)};
}
async function writeTag(reader, request) {
  const message = encodeMessage(request);
  const cc = readCapability(await readCapabilityPage(reader));
  if (!cc) throw new Error('Scrittura rifiutata: tag non riconosciuto come NDEF Type 2 (es. NTAG21x).');
  if (cc.readOnly || cc.readProtected) throw new Error('Tag protetto o di sola lettura.');
  const old = await readMemory(reader,cc.capacity);
  // Do not overwrite special TLVs or proprietary data areas, nor format an unknown card.
  if (!(old[0] === 0x03 || (old[0] === 0x00 && old.every(b=>b===0)) || old[0] === 0xFE)) {
    throw new Error('Layout TLV non standard: scrittura bloccata per sicurezza.');
  }
  const record = tlv(message);
  if (record.length > cc.capacity) throw new Error(`Tag troppo piccolo: necessari ${record.length} byte, disponibili ${cc.capacity}.`);
  const padded = Buffer.alloc(Math.ceil(record.length/4)*4);
  record.copy(padded);
  // Invalidate NDEF length first, then write remaining pages, then restore first page.
  // Physical failure can still leave a tag with invalid/partial NDEF: no transaction guarantee.
  await reader.write(4,Buffer.from([0x03,0x00,0x00,0x00]),4);
  for (let off=4; off<padded.length; off+=4) await reader.write(4+off/4,padded.subarray(off,off+4),4);
  await reader.write(4,padded.subarray(0,4),4);
  const verify = Buffer.alloc(padded.length);
  for (let off=0; off<padded.length; off+=16) {
    const count=Math.min(16,padded.length-off);
    const data=await reader.read(4+off/4,count,4,16);
    Buffer.from(data).copy(verify,off,0,count);
  }
  if (!padded.equals(verify)) throw new Error('Verifica post-scrittura non riuscita. Non rimuovere il tag finché non è completata.');
  // A matching block image is insufficient: verify that a reader can decode
  // the completed NDEF message as the requested text or URL.
  const reread=await readTag(reader);
  assertVerifiedNdef(reread.records,request);
  return {bytes:record.length,capacity:cc.capacity,kind:request.kind,verifiedRecords:reread.records};
}
function assertVerifiedNdef(records,request) {
  const expected=assertWriteRequest(request);
  if(!Array.isArray(records)||records.length!==1 || records[0].recordType!==expected.kind ||
    Buffer.from(records[0].data||[]).toString('utf8')!==expected.value){
    throw new Error('Verifica NDEF fallita: la lettura dopo la scrittura non restituisce il contenuto richiesto. Non considerare la scrittura completata.');
  }
  return true;
}
module.exports={assertWriteRequest,assertVerifiedNdef,encodeMessage,tlv,extractTlv,parseMessage,readCapability,readTag,writeTag};
