import {
  MAX_ENTRIES, parseNfcReading, formattedTime,
  exportCsv, exportTxt, restoreEntries,
} from './core.mjs';

const STORAGE_ENTRIES = 'nfc-reader.entries.v1';
const STORAGE_SETTINGS = 'nfc-reader.settings.v1';
const SHOW_FIRST = 70;
const REPEAT_COOLDOWN_MS = 1400;

let scanController = null;
let ndefReader = null;
const lastReadAt = new Map();
let toastTimer = null;

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function trySave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function fileName(extension) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `nfc-tags_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}.${extension}`;
}

function saveDownload(content, mime, name) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function errorForNfc(error) {
  switch (error?.name) {
    case 'NotAllowedError': return 'Permesso NFC negato. Consenti l\'accesso dal browser e riprova.';
    case 'NotSupportedError': return 'Il dispositivo o il tag non supporta questa lettura NFC.';
    case 'NotReadableError': return 'NFC non leggibile. Controlla che il modulo NFC sia attivo.';
    case 'InvalidStateError': return 'Un\'altra scansione NFC risulta gi\u00e0 attiva.';
    case 'SecurityError': return 'La scansione richiede HTTPS e una scheda del browser attiva.';
    default: return 'Impossibile avviare la lettura NFC. Controlla NFC e permessi.';
  }
}

if (!window.Vue) {
  document.getElementById('app').removeAttribute('v-cloak');
  document.getElementById('app').innerHTML = `
    <main class="fallback">
      <div class="fallback-icon">NFC</div>
      <h1>Impossibile caricare Vue</h1>
      <p>Controlla la connessione a Internet e aggiorna la pagina. La libreria Vue viene caricata tramite CDN.</p>
      <button class="btn btn-primary" onclick="location.reload()">Riprova</button>
    </main>`;
} else {
  const { createApp } = window.Vue;
  const savedSettings = readJSON(STORAGE_SETTINGS, {}) || {};
  const savedEntries = restoreEntries(readJSON(STORAGE_ENTRIES, []));

  createApp({
    data() {
      return {
        entries: savedEntries,
        ignoreDuplicates: savedSettings.ignoreDuplicates !== false,
        includeNumber: savedSettings.includeNumber !== false,
        theme: savedSettings.theme === 'dark' ? 'dark' : (savedSettings.theme === 'light' ? 'light' :
          (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')),
        scanState: 'idle',
        errorMessage: '',
        documentHidden: document.hidden,
        search: '',
        visibleLimit: SHOW_FIRST,
        toastMessage: '',
        toastTone: 'info',
        showClearDialog: false,
        lastDuplicateNotice: 0,
      };
    },
    computed: {
      supported() {
        return window.isSecureContext && typeof window.NDEFReader === 'function';
      },
      supportLabel() {
        if (!window.isSecureContext) return 'HTTPS richiesto';
        if (!this.supported) return 'NFC non disponibile';
        return 'Web NFC disponibile';
      },
      isRunning() {
        return this.scanState === 'active' || this.scanState === 'starting';
      },
      statusLabel() {
        if (this.scanState === 'starting') return 'Avvio';
        if (this.scanState === 'active') return 'In ascolto';
        return 'Inattivo';
      },
      scanTitle() {
        if (!this.supported) return 'Lettura non disponibile';
        if (this.scanState === 'starting') return 'Attivazione NFC...';
        if (this.scanState === 'active' && this.documentHidden) return 'Lettura in pausa';
        if (this.scanState === 'active') return 'Avvicina un tag NFC';
        return 'Pronto per la lettura';
      },
      scanSubtitle() {
        if (!window.isSecureContext) return 'Apri questa pagina in HTTPS per accedere alla funzione NFC.';
        if (!this.supported) return 'Per leggere i tag, apri il sito con Chrome su uno smartphone Android dotato di NFC.';
        if (this.scanState === 'starting') return 'Concedi al browser il permesso NFC, se richiesto.';
        if (this.scanState === 'active' && this.documentHidden) return 'Torna a questa scheda e mantieni acceso lo schermo.';
        if (this.scanState === 'active') return 'La scansione resta attiva: passa da un tag al successivo.';
        return 'Avvia una volta, poi avvicina i tag uno dopo l\'altro.';
      },
      lastEntry() { return this.entries.length ? this.entries[this.entries.length - 1] : null; },
      uniqueCount() { return new Set(this.entries.map(entry => entry.key)).size; },
      filteredEntries() {
        const q = this.search.trim().toLocaleLowerCase('it-IT');
        return this.entries.map((entry, i) => ({ ...entry, number: i + 1 }))
          .reverse()
          .filter(entry => !q || `${entry.uid} ${entry.content} ${entry.number}`.toLocaleLowerCase('it-IT').includes(q));
      },
      visibleEntries() { return this.filteredEntries.slice(0, this.visibleLimit); },
      moreToShow() { return this.filteredEntries.length > this.visibleLimit; },
    },
    mounted() {
      document.documentElement.dataset.theme = this.theme;
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('pagehide', this.stopScan);
      window.addEventListener('keydown', this.onKeyDown);
    },
    beforeUnmount() {
      this.stopScan();
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('pagehide', this.stopScan);
      window.removeEventListener('keydown', this.onKeyDown);
      window.clearTimeout(toastTimer);
    },
    methods: {
      formattedTime,
      onVisibilityChange() { this.documentHidden = document.hidden; },
      onKeyDown(event) {
        if (event.key === 'Escape' && this.showClearDialog) this.showClearDialog = false;
      },
      persist() {
        if (!trySave(STORAGE_ENTRIES, this.entries)) {
          this.showToast('Memoria del browser piena. Esporta i tag prima di proseguire.', 'error');
        }
      },
      savePreferences() {
        trySave(STORAGE_SETTINGS, {
          ignoreDuplicates: this.ignoreDuplicates,
          includeNumber: this.includeNumber,
          theme: this.theme,
        });
      },
      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = this.theme;
        this.savePreferences();
      },
      showToast(message, tone = 'info') {
        window.clearTimeout(toastTimer);
        this.toastMessage = message;
        this.toastTone = tone;
        toastTimer = window.setTimeout(() => { this.toastMessage = ''; }, 3200);
      },
      async startScan() {
        if (this.isRunning) return;
        if (!this.supported) {
          this.showToast('Serve Chrome su Android, NFC attivo e HTTPS.', 'error');
          return;
        }
        // scan() avviene subito nell'handler del click: e' necessario un gesto utente.
        const controller = new AbortController();
        scanController = controller;
        this.errorMessage = '';
        this.scanState = 'starting';
        try {
          const reader = new window.NDEFReader();
          ndefReader = reader;
          reader.addEventListener('reading', event => {
            if (scanController !== controller || controller.signal.aborted) return;
            this.handleReading(event);
          });
          reader.addEventListener('readingerror', () => {
            if (scanController !== controller || controller.signal.aborted) return;
            this.showToast('Tag non leggibile. Verifica che sia compatibile NDEF.', 'error');
          });
          await reader.scan({ signal: controller.signal });
          if (scanController === controller && !controller.signal.aborted) {
            this.scanState = 'active';
            this.showToast('Scansione continua attiva.', 'success');
          }
        } catch (error) {
          if (scanController !== controller || controller.signal.aborted) return;
          this.errorMessage = errorForNfc(error);
          this.stopScan();
          this.showToast(this.errorMessage, 'error');
        }
      },
      stopScan() {
        if (scanController && !scanController.signal.aborted) scanController.abort();
        scanController = null;
        ndefReader = null;
        this.scanState = 'idle';
      },
      toggleScan() { this.isRunning ? this.stopScan() : this.startScan(); },
      handleReading(event) {
        const parsed = parseNfcReading(event);
        if (!parsed) {
          this.showToast('Tag letto, ma UID e dati NDEF non sono disponibili.', 'error');
          return;
        }
        const now = Date.now();
        const lastTime = lastReadAt.get(parsed.key) || 0;
        // Evita raffiche di eventi quando il tag rimane appoggiato sul telefono.
        if (now - lastTime < REPEAT_COOLDOWN_MS) return;
        lastReadAt.set(parsed.key, now);
        if (this.ignoreDuplicates && this.entries.some(entry => entry.key === parsed.key)) {
          if (now - this.lastDuplicateNotice > 2200) {
            this.showToast('Tag gi\u00e0 presente: duplicato ignorato.', 'info');
            this.lastDuplicateNotice = now;
          }
          return;
        }
        if (this.entries.length >= MAX_ENTRIES) {
          this.showToast(`Limite di ${MAX_ENTRIES} tag raggiunto. Esporta e svuota l'elenco.`, 'error');
          return;
        }
        this.entries.push({
          ...parsed,
          id: window.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`,
        });
        this.persist();
        this.scanState = 'active';
        this.showToast('Tag acquisito e salvato.', 'success');
      },
      async copyUid(entry) {
        if (!entry.uid) {
          this.showToast('Questo tag non espone un UID.', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(entry.uid);
          this.showToast('UID copiato negli appunti.', 'success');
        } catch (_) {
          this.showToast('Impossibile copiare. Verifica i permessi del browser.', 'error');
        }
      },
      removeEntry(id) {
        this.entries = this.entries.filter(entry => entry.id !== id);
        this.persist();
        this.showToast('Tag rimosso.', 'info');
      },
      askClear() {
        if (!this.entries.length) return;
        this.showClearDialog = true;
        this.$nextTick(() => this.$refs.clearCancel?.focus());
      },
      clearAll() {
        this.entries = [];
        this.search = '';
        this.visibleLimit = SHOW_FIRST;
        lastReadAt.clear();
        this.showClearDialog = false;
        this.persist();
        this.showToast('Elenco svuotato.', 'info');
      },
      download(format) {
        if (!this.entries.length) return;
        try {
          const numbered = this.includeNumber;
          if (format === 'csv') {
            saveDownload(exportCsv(this.entries, numbered), 'text/csv;charset=utf-8', fileName('csv'));
          } else {
            saveDownload(exportTxt(this.entries, numbered), 'text/plain;charset=utf-8', fileName('txt'));
          }
          this.showToast(`${format.toUpperCase()} esportato con successo.`, 'success');
        } catch (_) {
          this.showToast('Esportazione non riuscita.', 'error');
        }
      },
    },
  }).mount('#app');
}
