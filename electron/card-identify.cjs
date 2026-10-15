'use strict';
// Windows PC/SC contactless storage-card ATR, cf. ACS ACR122U API 3.1.1.
// An ATR identifies a card family, not its NDEF formatting, capacity or write access.
// Only Type 2 candidates are ever sent FF D6 writes, and the NDEF CC is checked separately.
const TYPE2_NAMES = new Map([
  [0x0003, 'MIFARE Ultralight / NTAG (famiglia Type 2)'],
  [0x003A, 'MIFARE Ultralight C'],
  [0x003D, 'MIFARE Ultralight EV1'],
]);
const UNSUPPORTED = new Map([
  [0x0002, 'MIFARE Classic 4K'],
  [0x0026, 'MIFARE Mini'], [0x0036, 'MIFARE Plus 2K'],
  [0x0037, 'MIFARE Plus 4K'], [0x0038, 'MIFARE Plus 2K'],
  [0x0039, 'MIFARE Plus 4K'],[0xF004, 'Topaz / Jewel'],
  [0xF011, 'FeliCa 212K'], [0xF012, 'FeliCa 424K'],
]);
function identifyCard(atrHex) {
  const normalized = typeof atrHex === 'string' ? atrHex.replace(/\s+/g, '').toUpperCase() : '';
  const base = {kind:'unknown',name:'Tag non identificato',atr:/^[0-9A-F]{2,72}$/.test(normalized) && normalized.length%2===0 ? normalized : ''};
  if (!base.atr)return base;
  const bytes=Buffer.from(base.atr,'hex');
  // 3B 8F 80 01 80 4F 0C A0 00 00 03 06 SS C0 C1 ...
  if (bytes.length < 16 || bytes[0]!==0x3B || bytes[1]!==0x8F ||
    !Buffer.from([0x80,0x01,0x80,0x4F,0x0C,0xA0,0x00,0x00,0x03,0x06]).equals(bytes.subarray(2,12))) {
    return {...base, name:'Smart card / tecnologia non identificata'};
  }
  if (bytes[12]!==0x03) return {...base,name:'Tag PC/SC non ISO 14443-A Type 2'};
  const code=bytes.readUInt16BE(13);
  if(TYPE2_NAMES.has(code)) return {kind:'type2',name:TYPE2_NAMES.get(code),atr:base.atr,code};
  if(code===0x0001)return {kind:'classic1k',name:'MIFARE Classic 1K',atr:base.atr,code};
  if(UNSUPPORTED.has(code))return {kind:'other',name:UNSUPPORTED.get(code),atr:base.atr,code};
  return {...base,name:`Tag non classificato (PC/SC 0x${code.toString(16).toUpperCase().padStart(4,'0')})`,code};
}
function unsupportedWriteMessage(info){
  return `${info.name}: scrittura non supportata. Usa un tag NDEF Type 2 compatibile (ad es. NTAG213/215/216), non badge, MIFARE Classic o carte protette. Nessun dato è stato modificato.`;
}
module.exports={identifyCard,unsupportedWriteMessage};
