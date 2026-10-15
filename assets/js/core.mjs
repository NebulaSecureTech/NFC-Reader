// Pure helpers: parsing, restoration and export. No DOM or third-party services.
export const MAX_ENTRIES = 5000;
export const REPEAT_DELAY_MS = 1000;
const MAX_IDENTITY_BYTES = 65536;
// Web NFC exposes NDEF payloads, not low-level chip memory. Keep the local archive bounded.
const MAX_RECORDS = 64;
const MAX_DETAIL_BYTES = 65536;
const MAX_SAVED_TEXT = 16384;

export function normalizeUid(uid) {
  if (typeof uid !== 'string') return '';
  const value = uid.trim().replace(/-/g, ':').toUpperCase();
  const hex = value.replace(/:/g, '');
  return hex && /^[0-9A-F]+$/.test(hex) && hex.length % 2 === 0
    ? hex.match(/.{2}/g).join(':') : value.slice(0, 256);
}

function bytesOf(data) {
  if (!data) return new Uint8Array(0);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(0);
}

export function describeNdefRecord(record) {
  const type = String(record?.recordType ?? 'unknown').toLowerCase();
  const mime = String(record?.mediaType ?? '');
  if (['text', 'url', 'absolute-url'].includes(type) || (type === 'mime' && /^text\//i.test(mime))) {
    try {
      const encoding = type === 'text' && /^utf-16/i.test(record?.encoding || '') ? 'utf-16' : 'utf-8';
      const value = new TextDecoder(encoding).decode(bytesOf(record?.data).subarray(0, 8192))
        .replace(/\0/g, '').trim();
      if (value) return value.slice(0, 600);
    } catch (_) { /* A malformed record must not terminate an NFC session. */ }
  }
  if (type === 'empty') return '';
  if (type === 'mime') return mime ? `File ${mime}` : 'Record MIME';
  if (type === 'smart-poster') return 'Smart poster';
  return type !== 'unknown' ? `Record ${type}` : 'Record NDEF';
}

export function describeNdefMessage(message) {
  return Array.from(message?.records ?? []).slice(0, 64)
    .map(describeNdefRecord).filter(Boolean).join(' | ').slice(0, 600);
}

// Without a UID compare actual NDEF bytes and metadata, never a truncated preview.
// Identical payloads still cannot prove that two physical tags are the same.
function ndefIdentity(records) {
  let byteCount = 0;
  let hasPayload = false;
  if (records.length > 64) throw new RangeError('Troppi record nel tag senza UID.');
  const parts = records.map(record => {
    const bytes = bytesOf(record?.data);
    byteCount += bytes.length;
    if (byteCount > MAX_IDENTITY_BYTES) throw new RangeError('Tag senza UID troppo grande (oltre 64 KB).');
    hasPayload ||= bytes.length > 0;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [record?.recordType || '', record?.mediaType || '', record?.id || '',
      record?.encoding || '', record?.lang || '', hex];
  });
  return hasPayload ? `ndef:${JSON.stringify(parts)}` : '';
}

function recordDetails(record, state, depth = 0) {
  state.records++;
  if (state.records > MAX_RECORDS) throw new RangeError('Troppi record NDEF (massimo 64).');
  const bytes = bytesOf(record?.data);
  state.bytes += bytes.byteLength;
  if (depth === 0) state.topBytes += bytes.byteLength;
  if (state.bytes > MAX_DETAIL_BYTES) throw new RangeError('Dati NDEF troppo grandi (oltre 64 KB).');
  const recordType = String(record?.recordType ?? 'unknown').slice(0, 128);
  const mediaType = String(record?.mediaType ?? '').slice(0, 256);
  const encoding = String(record?.encoding ?? '').slice(0, 60);
  const lang = String(record?.lang ?? '').slice(0, 50);
  const id = String(record?.id ?? '').slice(0, 256);
  const type = recordType.toLowerCase();
  let decoded = '';
  if (type === 'text' || type === 'url' || type === 'absolute-url' || (type === 'mime' && /^text\//i.test(mediaType))) {
    try {
      decoded = new TextDecoder(type === 'text' && /^utf-16/i.test(encoding) ? 'utf-16' : 'utf-8')
        .decode(bytes).replace(/\0/g, '').slice(0, MAX_SAVED_TEXT);
    } catch (_) { /* Retain HEX even if decoding fails. */ }
  }
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const output = {recordType, mediaType, id, encoding, lang, bytes: bytes.byteLength, decoded, hex};
  if (depth < 2 && typeof record?.toRecords === 'function') {
    try {
      const nested = Array.from(record.toRecords() ?? []);
      if (nested.length) output.children = nested.map(child => recordDetails(child, state, depth + 1));
    } catch (_) { /* Not all NDEF types allow toRecords(). */ }
  }
  return output;
}

// Raw payloads are held as HEX so a detail view remains usable after a reload.
export function parseNfcReading(event, now = new Date()) {
  const uid = normalizeUid(event?.serialNumber);
  const sourceRecords = Array.from(event?.message?.records ?? []);
  if (sourceRecords.length > MAX_RECORDS) throw new RangeError('Troppi record NDEF (massimo 64).');
  const content = describeNdefMessage({records: sourceRecords});
  const key = uid ? `uid:${uid}` : ndefIdentity(sourceRecords);
  if (!key) return null;
  const state = {records: 0, bytes: 0, topBytes: 0};
  const records = sourceRecords.map(record => recordDetails(record, state));
  return {uid, content, key, timestamp: now.toISOString(), records, ndefBytes: state.topBytes};
}

function safeSavedRecord(item, depth = 0) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const bounded = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  const hex = bounded(item.hex, MAX_DETAIL_BYTES * 2);
  const children = depth < 2 && Array.isArray(item.children)
    ? item.children.slice(0, MAX_RECORDS).map(child => safeSavedRecord(child, depth + 1)).filter(Boolean) : [];
  return {
    recordType: bounded(item.recordType, 128), mediaType: bounded(item.mediaType, 256),
    id: bounded(item.id, 256), encoding: bounded(item.encoding, 60), lang: bounded(item.lang, 50),
    bytes: Number.isSafeInteger(item.bytes) ? Math.max(0, Math.min(MAX_DETAIL_BYTES, item.bytes)) : 0,
    decoded: bounded(item.decoded, MAX_SAVED_TEXT),
    hex: /^[0-9A-F]*$/i.test(hex) && hex.length % 2 === 0 ? hex.toUpperCase() : '',
    ...(children.length ? {children} : {}),
  };
}

// A compact, human-readable summary suited to the Android share sheet.
// Large binary payloads remain available in the in-app detail instead.
export function shareTagText(entry) {
  const lines = ['NFC Reader · Dettaglio tag', `UID: ${entry.uid || 'Non disponibile'}`,
    `Data e ora: ${formattedTimestamp(entry.timestamp) || 'Non disponibile'}`,
    `Contenuto: ${entry.content || 'Nessuno'}`];
  if (entry.cardType) lines.push(`Tipo tag: ${entry.cardType}`);
  if (entry.atr) lines.push(`ATR PC/SC: ${entry.atr}`);
  if (entry.ndefInfo) lines.push(`Informazioni NDEF: ${entry.ndefInfo}`);
  if (Array.isArray(entry.records)) {
    lines.push(`Record NDEF: ${entry.records.length}`);
    lines.push(`Dati NDEF: ${entry.ndefBytes ?? 0} byte`);
    entry.records.forEach((record, i) => {
      lines.push('', `Record ${i + 1}: ${record.recordType || 'unknown'}`);
      if (record.mediaType) lines.push(`MIME: ${record.mediaType}`);
      if (record.id) lines.push(`ID record: ${record.id}`);
      if (record.lang) lines.push(`Lingua: ${record.lang}`);
      if (record.encoding) lines.push(`Codifica: ${record.encoding}`);
      if (record.decoded) lines.push(`Testo: ${record.decoded.slice(0, 2048)}`);
      else if (record.hex) lines.push(`HEX: ${record.hex.slice(0, 512)}${record.hex.length > 512 ? '… (continua nel dettaglio app)' : ''}`);
      if (record.children?.length) lines.push(`Record annidati: ${record.children.length}`);
    });
  } else lines.push('Dettagli NDEF non disponibili (lettura precedente alla v1.3.0).');
  return lines.join('\n');
}

export function formattedTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', {year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
}

export function formattedTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
}

export function formattedShortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('it-IT', {day: 'numeric', month: 'short'})} \u00b7 ${formattedTime(iso)}`;
}

function csvCell(value) {
  let text = String(value ?? '');
  // Quote all fields and neutralize formula injection from untrusted tag contents.
  if (/^[\t\r\n]/.test(text) || /^[\s\uFEFF]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(entries, includeNumber = true) {
  const header = [...(includeNumber ? ['Numero'] : []), 'UID', 'Contenuto NDEF', 'Data e ora'];
  const rows = [header, ...entries.map((entry, i) => [
    ...(includeNumber ? [i + 1] : []), entry.uid || '', entry.content || '', formattedTimestamp(entry.timestamp)
  ])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function exportTxt(entries, includeNumber = true) {
  if (!entries.length) return '';
  return entries.map((entry, i) => {
    const value = (entry.uid || `[UID non disponibile] ${entry.content || ''}`).replace(/[\r\n]+/g, ' ').trim();
    return includeNumber ? `${i + 1}. ${value}` : value;
  }).join('\r\n') + '\r\n';
}

export function restoreEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  return raw.filter(item => item && typeof item === 'object' &&
    typeof item.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp)) &&
    ((typeof item.uid === 'string' && item.uid.trim()) || (typeof item.content === 'string' && item.content.trim())))
    .slice(-MAX_ENTRIES).map((item, i) => {
      const uid = normalizeUid(item.uid);
      const content = typeof item.content === 'string' ? item.content.slice(0, 600) : '';
      let id = typeof item.id === 'string' && item.id ? item.id : `restored-${i}`;
      while (ids.has(id)) id += `-${i}`;
      ids.add(id);
      // Legacy anonymous records have only a preview. Do not invent a raw identity.
      const key = uid ? `uid:${uid}` : typeof item.key === 'string' && item.key.startsWith('ndef:') && item.key.length < 150000
        ? item.key : `record:${content}`;
      // Older releases did not save raw record details; preserve that distinction.
      const records = Array.isArray(item.records)
        ? item.records.slice(0, MAX_RECORDS).map(record => safeSavedRecord(record)).filter(Boolean) : undefined;
      const ndefBytes = Number.isSafeInteger(item.ndefBytes) ? Math.max(0, Math.min(131072, item.ndefBytes)) : 0;
      const pcsc = {};
      for (const field of ['reader','cardType','atr','ndefInfo']) {
        if (typeof item[field] === 'string') pcsc[field] = item[field].slice(0,field==='ndefInfo'?650:180);
      }
      return {id, uid, content, key, timestamp: item.timestamp,
        ...(records === undefined ? {} : {records, ndefBytes}),...pcsc};
    });
}

export function nfcErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Permesso NFC negato. Abilitalo nelle autorizzazioni del sito.',
    NotSupportedError: 'NFC non supportato dal dispositivo o dal tag.',
    NotReadableError: 'NFC non accessibile. Verifica che sia attivo sul telefono.',
    InvalidStateError: 'NFC occupato. Chiudi le altre sessioni e riprova.',
    SecurityError: 'Apri direttamente il sito in HTTPS, in una scheda visibile.',
    AbortError: 'La scansione NFC \u00e8 stata interrotta.',
  };
  return messages[error?.name] || 'Impossibile avviare NFC. Controlla permessi e impostazioni.';
}
