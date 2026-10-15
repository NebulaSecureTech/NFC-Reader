// Pure helpers: parsing, restoration and export. No DOM or third-party services.
export const MAX_ENTRIES = 5000;
export const REPEAT_DELAY_MS = 1000;
const MAX_IDENTITY_BYTES = 65536;

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

export function parseNfcReading(event, now = new Date()) {
  const uid = normalizeUid(event?.serialNumber);
  const records = Array.from(event?.message?.records ?? []);
  const content = describeNdefMessage({records});
  const key = uid ? `uid:${uid}` : ndefIdentity(records);
  if (!key) return null;
  return {uid, content, key, timestamp: now.toISOString()};
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
      return {id, uid, content, key, timestamp: item.timestamp};
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
