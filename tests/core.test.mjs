import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUid, parseNfcReading, describeNdefRecord, describeNdefMessage,
  exportCsv, exportTxt, restoreEntries, MAX_ENTRIES,
} from '../assets/js/core.mjs';

const sample = [
  { uid: '04:A1:B2:C3', content: 'Ingresso', timestamp: '2026-10-14T12:30:20.000Z' },
  { uid: '04:A1:B2:D4', content: 'Ufficio; "test"\nseconda riga', timestamp: '2026-10-14T12:31:21.000Z' },
];

test('normalizza UID preservando i separatori', () => {
  assert.equal(normalizeUid(' 04-a1-b2-c3 '), '04:A1:B2:C3');
  assert.equal(normalizeUid('ab:cd'), 'AB:CD');
  assert.equal(normalizeUid(undefined), '');
});

test('decodifica messaggi NDEF text + url', () => {
  const rec1 = { recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode('Ciao').buffer) };
  const rec2 = { recordType: 'url', data: new DataView(new TextEncoder().encode('https://example.org').buffer) };
  assert.equal(describeNdefRecord(rec1), 'Ciao');
  assert.equal(describeNdefMessage({ records: [rec1, rec2] }), 'Ciao | https://example.org');
  assert.equal(describeNdefRecord({ recordType: 'empty' }), '');
});

test('parsa un tag con UID e senza contenuto', () => {
  const result = parseNfcReading({ serialNumber: '1a-2b', message: { records: [] } }, new Date('2026-10-14T12:00:00Z'));
  assert.equal(result.uid, '1A:2B');
  assert.equal(result.key, 'uid:1A:2B');
  assert.equal(result.content, '');
  assert.equal(result.timestamp, '2026-10-14T12:00:00.000Z');
});

test('parsa tag senza UID ma con testo NDEF', () => {
  const message = { records: [{ recordType: 'text', data: new DataView(new TextEncoder().encode('Badge A').buffer) }] };
  const result = parseNfcReading({ serialNumber: '', message });
  assert.equal(result.uid, '');
  assert.equal(result.content, 'Badge A');
  assert.ok(result.key.startsWith('ndef:'));
  assert.ok(result.key.includes('42616467652041'));
});

test('scarta un evento vuoto', () => {
  assert.equal(parseNfcReading({ serialNumber: '', message: { records: [] } }), null);
});

test('CSV con progressivo, BOM, separatore italiano e quoting', () => {
  const csv = exportCsv(sample, true);
  assert.ok(csv.startsWith('\uFEFF"Numero";"UID";"Contenuto NDEF";"Data e ora"\r\n'));
  assert.ok(csv.includes('"1";"04:A1:B2:C3";"Ingresso";'));
  assert.ok(csv.includes('"2";"04:A1:B2:D4";"Ufficio; ""test""\nseconda riga";'));
  assert.ok(csv.endsWith('\r\n'));
});

test('CSV senza progressivo mantiene UID contenuto e data', () => {
  const csv = exportCsv(sample, false);
  assert.ok(csv.startsWith('\uFEFF"UID";"Contenuto NDEF";"Data e ora"'));
  assert.ok(!csv.includes('"Numero"'));
  assert.ok(csv.includes('"04:A1:B2:C3"'));
});

test('CSV previene formule da testo NDEF arbitrario', () => {
  const csv = exportCsv([{ uid: 'AB', content: '=HYPERLINK("x")', timestamp: sample[0].timestamp }], false);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
});

test('TXT con e senza progressivo', () => {
  assert.equal(exportTxt(sample, true), '1. 04:A1:B2:C3\r\n2. 04:A1:B2:D4\r\n');
  assert.equal(exportTxt(sample, false), '04:A1:B2:C3\r\n04:A1:B2:D4\r\n');
});

test('TXT esporta contenuto se UID non disponibile', () => {
  const txt = exportTxt([{ uid: '', content: 'Ciao', timestamp: sample[0].timestamp }], true);
  assert.equal(txt, '1. [UID non disponibile] Ciao\r\n');
});

test('ripristino storico filtra elementi corrotti e ricostruisce la chiave', () => {
  const rows = restoreEntries([
    { uid: 'fa-01', content: 'x', timestamp: sample[0].timestamp },
    { uid: 'bb', content: 'x', timestamp: 'invalida' },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uid, 'FA:01');
  assert.equal(rows[0].key, 'uid:FA:01');
});

test('ripristino limita lo storico', () => {
  const raw = Array.from({ length: MAX_ENTRIES + 10 }, (_, n) => ({ uid: String(n), timestamp: sample[0].timestamp }));
  assert.equal(restoreEntries(raw).length, MAX_ENTRIES);
  assert.equal(restoreEntries(raw)[0].uid, '10');
});

test('UID compatto ed UID separato producono la stessa identita', () => {
  assert.equal(normalizeUid('04aabb'), normalizeUid('04:aa:bb'));
});

test('nessuna collisione tra payload binari dello stesso tipo', () => {
  const event = value => ({message:{records:[{recordType:'mime',mediaType:'application/octet-stream',data:new Uint8Array([value])}]}});
  const a = parseNfcReading(event(1));
  const b = parseNfcReading(event(2));
  assert.equal(a.content, b.content);
  assert.notEqual(a.key, b.key);
});

test('contenuti oltre anteprima distinti restano distinti', () => {
  const event = suffix => ({message:{records:[{recordType:'text',data:new TextEncoder().encode('a'.repeat(700)+suffix)}]}});
  const a = parseNfcReading(event('A'));
  const b = parseNfcReading(event('B'));
  assert.equal(a.content.length, 600);
  assert.equal(a.content, b.content);
  assert.notEqual(a.key, b.key);
});

test('rifiuta payload anonimo eccessivo senza bloccare il chiamante', () => {
  assert.throws(() => parseNfcReading({message:{records:[{recordType:'mime',data:new Uint8Array(65537)}]}}), RangeError);
});

test('ripristino conserva identita raw e rende univoci gli id duplicati', () => {
  const record = parseNfcReading({message:{records:[{recordType:'text',data:new TextEncoder().encode('test')}]}});
  const restored = restoreEntries([{...record, id:'same'}, {...record, id:'same'}]);
  assert.equal(restored[0].key, record.key);
  assert.notEqual(restored[0].id, restored[1].id);
});

test('testo UTF-16 e offset DataView rispettati', () => {
  const bytes = new Uint8Array([99,99,0xff,0xfe,0x43,0,0x69,0,0x61,0,0x6f,0]);
  assert.equal(describeNdefRecord({recordType:'text',encoding:'utf-16',data:new DataView(bytes.buffer,2)}),'Ciao');
});

test('CSV protegge formule precedute da tab e newline', () => {
  for (const content of ['\t=1+1', '\n@SUM(1)', '   -1+2', '+123']) {
    const result = exportCsv([{uid:'AB',content,timestamp:sample[0].timestamp}],false);
    assert.ok(result.includes(`"'${content}"`));
  }
});

test('TXT senza elementi e vuoto, senza intestazioni spurie', () => {
  assert.equal(exportTxt([],false),'');
});

test('dettagli NDEF mostrano lingua, MIME, identificatori, byte e HEX', async () => {
  const {shareTagText} = await import('../assets/js/core.mjs');
  const bytes = new TextEncoder().encode('Ciao');
  const rec = {recordType:'text',lang:'it',encoding:'utf-8',id:'etichetta',data:new DataView(bytes.buffer)};
  const raw = new Uint8Array([10,20,30,40]);
  const bin = {recordType:'mime',mediaType:'application/octet-stream',id:'binary',data:new DataView(raw.buffer,1,2)};
  const result = parseNfcReading({serialNumber:'04:DE:AD',message:{records:[rec,bin]}},new Date('2026-10-15T08:00:00Z'));
  assert.equal(result.ndefBytes,6);
  assert.equal(result.records.length,2);
  assert.deepEqual(result.records[0],{recordType:'text',mediaType:'',id:'etichetta',encoding:'utf-8',lang:'it',bytes:4,decoded:'Ciao',hex:'4369616F'});
  assert.equal(result.records[1].hex,'141E');
  const restored=restoreEntries([{...result,id:'r'}]);
  assert.deepEqual(restored[0].records,result.records);
  const text=shareTagText(restored[0]);
  assert.match(text,/Record NDEF: 2/);
  assert.match(text,/MIME: application\/octet-stream/);
  assert.match(text,/Lingua: it/);
  assert.match(text,/Testo: Ciao/);
  assert.match(text,/HEX: 141E/);
});

test('raw records disponibili in seguito a riapertura e vecchi tag mostrano campi sconosciuti',async()=>{
  const {shareTagText}=await import('../assets/js/core.mjs');
  const original=restoreEntries([{uid:'AB:CD',content:'Vecchia lettura',timestamp:'2026-10-15T08:00:00Z'}])[0];
  assert.equal(original.records,undefined);
  assert.match(shareTagText(original),/precedente alla v1.3.0/);
  const decoded=restoreEntries([{uid:'AA:BB',content:'Z',timestamp:'2026-10-15T08:00:00Z',records:[{recordType:'mime',bytes:2,hex:'0102'}],ndefBytes:2}])[0];
  assert.equal(decoded.records[0].hex,'0102');
  assert.equal(decoded.ndefBytes,2);
});

test('NDEF annidato via toRecords conserva metadati e contenuto',()=>{
  const nested = {recordType:'url',data:new TextEncoder().encode('https://example.test')};
  const parent = {recordType:'smart-poster', data:new Uint8Array([1,2,3]),toRecords(){return [nested]}};
  const entry=parseNfcReading({serialNumber:'AA:BB',message:{records:[parent]}});
  assert.equal(entry.records[0].children[0].decoded,'https://example.test');
  assert.equal(entry.records[0].children[0].recordType,'url');
  assert.equal(entry.ndefBytes,3);
});

test('limiti espliciti per dati NDEF e recupero di record malformati',()=>{
  assert.throws(()=>parseNfcReading({serialNumber:'AA',message:{records:[{recordType:'mime',data:new Uint8Array(65537)}]}}),RangeError);
  const restored=restoreEntries([{uid:'AA',timestamp:'2026-10-15T08:00:00Z',records:[null,{recordType:'text',hex:'NOT HEX',decoded:'Hi'}]}]);
  assert.equal(restored[0].records.length,1);
  assert.equal(restored[0].records[0].hex,'');
});


test('Metadati Windows PC/SC conservati nello storico e disponibili in condivisione',async()=>{
 const {shareTagText}=await import('../assets/js/core.mjs');
 const original={id:'a',uid:'04AABBCC',key:'uid:04AABBCC',content:'',timestamp:'2026-10-15T08:00:00Z',records:[],ndefBytes:0,
   reader:'ACS ACR122 0',cardType:'MIFARE Classic 1K',atr:'3B8F8001804F0CA000000306030001000000006A',ndefInfo:'Tag non compatibile'};
 const saved=restoreEntries([original])[0];
 assert.equal(saved.cardType,'MIFARE Classic 1K');assert.equal(saved.atr,original.atr);
 assert.match(shareTagText(saved),/MIFARE Classic 1K/);
 assert.match(shareTagText(saved),/ATR PC\/SC/);
});
