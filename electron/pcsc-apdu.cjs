'use strict';
// PC/SC pseudo-APDU profile for ACS ACR122U compatible readers.
// Do NOT send generic writes to unknown contactless cards.
const {Buffer} = require('node:buffer');

function checkResponse(response, operation) {
  const bytes = Buffer.from(response || []);
  if (bytes.length < 2) throw new Error(`${operation}: risposta PC/SC incompleta.`);
  const sw = bytes.subarray(bytes.length-2).toString('hex').toUpperCase();
  if (sw !== '9000') throw new Error(`${operation}: il lettore ha risposto ${sw}.`);
  return bytes.subarray(0, bytes.length-2);
}
async function send(card, bytes, operation) {
  if (!card || typeof card.transmit !== 'function') throw new Error('Nessuna tessera connessa.');
  const response = await card.transmit(Uint8Array.from(bytes));
  return checkResponse(response, operation);
}
function isSupportedWriter(readerName) {
  // The Type 2 FF B0/FF D6 profile is documented for this family.
  // Other readers can still read UID via FF CA, but are read-only here.
  return /\bACR122(?:U|2)?\b/i.test(String(readerName));
}
async function readUid(card) {
  try {
    const bytes = await send(card, [0xFF,0xCA,0x00,0x00,0x00], 'Lettura UID');
    return bytes.toString('hex').toUpperCase();
  } catch (_) { return ''; }
}
function pageAddress(page) {
  if (!Number.isInteger(page) || page < 3 || page > 255) throw new Error('Indirizzo pagina NFC non valido.');
  return page;
}
function type2Adapter(card, readerName) {
  return {
    read: async (page, length) => {
      pageAddress(page);
      if (!Number.isInteger(length) || length < 1 || length > 16 || length%4 !== 0) {
        throw new Error('La lettura Type 2 deve essere multipla di 4, massimo 16 byte.');
      }
      const data=await send(card,[0xFF,0xB0,0x00,page,length],'Lettura pagina NDEF');
      if (data.length !== length) throw new Error('Il lettore ha restituito meno byte del previsto.');
      return data;
    },
    write: async (page, bytes) => {
      if (!isSupportedWriter(readerName)) {
        throw new Error('Scrittura Type 2 abilitata solo per lettori ACS ACR122U verificabili.');
      }
      pageAddress(page);
      // Page 0-3 are manufacturer/lock/configuration bytes. Never touch them.
      if (page < 4) throw new Error('Scrittura vietata nelle pagine UID / CC / lock.');
      const data=Buffer.from(bytes || []);
      if (data.length !== 4) throw new Error('La scrittura Type 2 richiede esattamente 4 byte.');
      await send(card,[0xFF,0xD6,0x00,page,0x04,...data],'Scrittura pagina NDEF');
    },
  };
}
// MIFARE Classic 1K: public-key authentication for EXISTING NFC Forum NDEF sectors.
function classic1kAdapter(card,readerName) {
  const requireWriter=()=>{if(!isSupportedWriter(readerName))throw new Error('MIFARE Classic: serve ACS ACR122U.');};
  const range=(block)=>{if(!Number.isInteger(block)||block<0||block>63)throw new Error('Blocco MIFARE Classic fuori intervallo.');};
  return {
    async authenticate(block,keyHex,keyType) {
      requireWriter();range(block);
      if(!['A','B'].includes(keyType) || !/^[A-F0-9]{12}$/.test(keyHex))throw new Error('Chiave MIFARE non valida.');
      // Volatile reader key slot 0. No persistent secret storage.
      await send(card,[0xFF,0x82,0,0,6,...Buffer.from(keyHex,'hex')],'Caricamento chiave Classic');
      await send(card,[0xFF,0x86,0,0,5,1,0,block,keyType==='A'?0x60:0x61,0],'Autenticazione settore Classic');
    },
    async readBlock(block) {
      requireWriter();range(block);
      if(block===0)throw new Error('Lettura del blocco produttore non necessaria.');
      const result=await send(card,[0xFF,0xB0,0,block,16],'Lettura blocco Classic');
      if(result.length!==16)throw new Error('Risposta Classic di lunghezza errata.');
      return result;
    },
    async writeBlock(block,bytes) {
      requireWriter();range(block);
      if(block<4 || block%4===3)throw new Error('Vietata scrittura MIFARE a MAD, produttore o trailer di settore.');
      const data=Buffer.from(bytes);
      if(data.length!==16)throw new Error('Blocco Classic deve contenere 16 byte.');
      await send(card,[0xFF,0xD6,0,block,16,...data],'Scrittura blocco Classic');
    },
  };
}
module.exports={checkResponse,send,isSupportedWriter,readUid,type2Adapter,classic1kAdapter};
