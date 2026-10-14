// Funzioni pure: parsing NDEF ed esportazioni. Nessuna dipendenza esterna.
export const MAX_ENTRIES = 5000;

export function normalizeUid(uid) {
  return typeof uid === 'string' ? uid.trim().replace(/-/g, ':').toUpperCase() : '';
}

function bytesOf(data) {
  if (!data) return null;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

export function describeNdefRecord(record) {
  const type = String(record?.recordType ?? 'unknown').toLowerCase();
  const mimeType = String(record?.mediaType ?? '');
  const decodable = type === 'text' || type === 'url' || type === 'absolute-url' ||
    (type === 'mime' && /^text\//i.test(mimeType));

  if (decodable) {
    try {
      const raw = bytesOf(record?.data);
      if (raw) {
        const encoding = type === 'text' && /^utf-16/i.test(record?.encoding || '') ? 'utf-16' : 'utf-8';
        const value = new TextDecoder(encoding).decode(raw).replace(/\0/g, '').trim();
        if (value) return value.slice(0, 400);
      }
    } catch (_) {
      // Un record malformato non deve interrompere la scansione NFC.
    }
  }

  if (type === 'empty') return '';
  if (type === 'mime') return mimeType ? `File ${mimeType}` : 'Record MIME';
  if (type === 'smart-poster') return 'Smart poster';
  return type && type !== 'unknown' ? `Record ${type}` : 'Record NDEF';
}

export function describeNdefMessage(message) {
  const records = Array.from(message?.records ?? []);
  return records.map(describeNdefRecord).filter(Boolean).join(' | ').slice(0, 600);
}

export function parseNfcReading(event, now = new Date()) {
  const uid = normalizeUid(event?.serialNumber);
  const content = describeNdefMessage(event?.message);
  if (!uid && !content) return null;

  return {
    uid,
    content,
    key: uid ? `uid:${uid}` : `record:${content}`,
    timestamp: now.toISOString(),
  };
}

export function formattedTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export function formattedTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function csvCell(value) {
  let text = String(value ?? '');
  // Evita che testo NDEF arbitrario diventi una formula in un foglio di calcolo.
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(entries, includeNumber) {
  const cols = includeNumber ? ['Numero', 'UID', 'Contenuto NDEF', 'Data e ora'] :
    ['UID', 'Contenuto NDEF', 'Data e ora'];
  const lines = [cols.map(csvCell).join(';')];
  entries.forEach((entry, index) => {
    const columns = includeNumber ? [index + 1] : [];
    columns.push(entry.uid || '', entry.content || '', formattedTimestamp(entry.timestamp));
    lines.push(columns.map(csvCell).join(';'));
  });
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function exportTxt(entries, includeNumber) {
  const lines = entries.map((entry, index) => {
    // Se l'UID non e' esposto dal browser, non perdiamo il contenuto del tag.
    const value = (entry.uid || `[UID non disponibile] ${entry.content || ''}`).replace(/[\r\n]+/g, ' ').trim();
    return includeNumber ? `${index + 1}. ${value}` : value;
  });
  return lines.join('\r\n') + '\r\n';
}

export function restoreEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_ENTRIES).filter(item => item && typeof item === 'object' &&
    (typeof item.uid === 'string' || typeof item.content === 'string') &&
    typeof item.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp)))
    .filter(item => Boolean(String(item.uid || '').trim() || String(item.content || '').trim()))
    .map((item, i) => {
      const uid = normalizeUid(item.uid);
      const content = String(item.content || '').slice(0, 600);
      return {
        id: typeof item.id === 'string' ? item.id : `restored-${i}`,
        uid,
        content,
        key: uid ? `uid:${uid}` : `record:${content}`,
        timestamp: item.timestamp,
      };
    });
}
