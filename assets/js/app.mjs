import {
  MAX_ENTRIES, REPEAT_DELAY_MS, parseNfcReading, restoreEntries, normalizeUid,
  formattedTime, formattedShortDate, formattedTimestamp, exportCsv, exportTxt, nfcErrorMessage, shareTagText,
} from './core.mjs?v=1.8.0';
import {prepareAudio, playSound} from './sound.mjs?v=1.8.0';

const VERSION = '1.8.0';
// Retain the original keys: upgrading in the same origin preserves the archive.
const STORAGE_ENTRIES = 'nfc-reader.entries.v1';
const STORAGE_SETTINGS = 'nfc-reader.settings.v1';
const PAGE_SIZE = 50;
let scanController = null;
let lastEvent = {key: '', at: -Infinity};
let lastErrorAt = -Infinity;
let wakeLock = null;
let wakePending = false;
let toastTimer = null;
let feedbackTimer = null;
let installEvent = null;
let workerRegistration = null;
let updateRequested = false;
let returnFocus = null;
let rawArchive = null;
let initialProblem = '';
let initialEntries = [];
let savedSettings = {};

try {
  rawArchive = localStorage.getItem(STORAGE_ENTRIES);
  const data = rawArchive === null ? [] : JSON.parse(rawArchive);
  if (!Array.isArray(data)) throw new Error('Invalid archive');
  initialEntries = restoreEntries(data);
  if (initialEntries.length !== data.length) initialProblem = 'corrupt';
} catch (_) { initialProblem = rawArchive === null ? 'unavailable' : 'corrupt'; }
try {
  const data = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}');
  if (data && typeof data === 'object' && !Array.isArray(data)) savedSettings = data;
} catch (_) { /* A broken preference cannot hide an otherwise valid archive. */ }
const media = window.matchMedia?.('(prefers-color-scheme: dark)');
const desktopBridge = window.nfcDesktop || null;
let desktopUnsubscribe = null;
let writeController = null;
const desktopMedia = window.matchMedia?.('(min-width: 1024px)');

function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function fileName(ext) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `nfc-tags_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${ext}`;
}
function downloadBlob(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

if (!window.Vue) {
  const app = document.getElementById('app');
  app.removeAttribute('v-cloak');
  app.textContent = 'NFC Reader non si avvia. Ricarica la pagina e verifica che tutti i file dello ZIP siano pubblicati.';
} else {
  window.Vue.createApp({
    data() {
      return {
        version: VERSION,
        tab: 'reader',
        desktopLayout: desktopMedia?.matches ?? window.innerWidth >= 1024,
        desktopStatus: {available: !!desktopBridge, readers: [], error: ''},
        writeKind: 'text', writeValue: '', writeConfirmed: false, writeState: 'idle', writeMessage: '',
        entries: initialEntries,
        search: '',
        visibleLimit: PAGE_SIZE,
        scanState: 'idle',
        hidden: document.hidden,
        modal: '',
        exportFormat: 'csv',
        detailAccordionVersion: 0,
        settingsTab: 'reading',
        detailId: '',
        detailPreview: null,
        detailUnsaved: false,
        latestRead: null,
        latestUnsaved: false,
        feedback: null,
        flash: '',
        duplicates: 0,
        errors: 0,
        toast: null,
        storageProblem: initialProblem,
        pendingSave: false,
        externalConflict: false,
        recoveryDownloaded: false,
        soundEnabled: savedSettings.soundEnabled !== false,
        alertSoundEnabled: savedSettings.alertSoundEnabled !== false,
        volume: Number.isFinite(savedSettings.volume) ? Math.max(0, Math.min(100, savedSettings.volume)) : 65,
        vibrationEnabled: savedSettings.vibrationEnabled !== false,
        ignoreDuplicates: savedSettings.ignoreDuplicates !== false,
        singleMode: savedSettings.singleMode === true,
        keepScreenAwake: savedSettings.keepScreenAwake === true,
        includeNumber: savedSettings.includeNumber !== false,
        theme: ['auto', 'light', 'dark'].includes(savedSettings.theme) ? savedSettings.theme : 'auto',
        wakeActive: false,
        wakeUnavailable: false,
        installPrompt: false,
        installed: window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true,
        offlineReady: false,
        offlineFailed: false,
        updateAvailable: false,
      };
    },
    computed: {
      isDesktop() { return !!desktopBridge; },
      connectedReaderLabel() {
        if (!this.isDesktop) return '';
        if (!this.desktopStatus.available) return this.desktopStatus.error || 'Sistema PC/SC non disponibile';
        return this.desktopStatus.readers.length ? this.desktopStatus.readers.join(' · ') : 'Collega un lettore USB PC/SC';
      },
      supported() { return this.isDesktop ? this.desktopStatus.available : (window.isSecureContext && typeof window.NDEFReader === 'function'); },
      webWriteSupported() {return this.isDesktop || (window.isSecureContext && typeof window.NDEFReader === 'function' && typeof window.NDEFReader.prototype.write === 'function');},
      writeBytes() { return new TextEncoder().encode(this.writeValue).length; },
      writeValid() {
        const value=this.writeValue.trim(); if (!value || value.length > 500 || this.writeBytes > 250) return false;
        if (this.writeKind==='url') { try { const url=new URL(value); return ['http:','https:'].includes(url.protocol); } catch (_) {return false;} }
        return true;
      },
      canWrite() {return this.writeConfirmed && this.writeValid && this.writeState !== 'waiting' &&
        (this.isDesktop ? this.desktopStatus.available && this.desktopStatus.readers.length > 0 : this.webWriteSupported);},
      running() { return this.scanState !== 'idle'; },
      blocked() { return !!this.storageProblem || this.externalConflict; },
      canStart() { return this.supported && (!this.isDesktop || this.desktopStatus.readers.length > 0) && !this.blocked && this.entries.length < MAX_ENTRIES && this.writeState!=='waiting'; },
      statusLabel() {
        if (!this.supported) return 'Non supportato';
        if (this.isDesktop && !this.desktopStatus.readers.length) return 'Lettore assente';
        if (this.scanState === 'starting') return 'Attivazione';
        return this.running ? (this.hidden ? 'In pausa' : 'In ascolto') : 'Pronto';
      },
      readerTitle() {
        if (!this.supported) return this.isDesktop ? 'PC/SC non disponibile' : 'Usa un telefono NFC';
        if (this.isDesktop && !this.desktopStatus.readers.length) return 'Collega lettore USB';
        if (this.blocked) return 'Controlla l\u2019archivio';
        if (this.entries.length >= MAX_ENTRIES) return 'Archivio completo';
        if (this.scanState === 'starting') return 'Attivazione NFC';
        return this.running ? 'Avvicina un tag' : (this.singleMode ? 'Lettura singola' : 'Pronto alla lettura');
      },
      readerSubtitle() {
        if (!this.supported) return this.isDesktop ? (this.desktopStatus.error||'Impossibile accedere al lettore PC/SC.') : 'Apri questa app con Chrome su Android.';
        if (this.isDesktop && !this.desktopStatus.readers.length) return 'Collega un lettore NFC PC/SC e avvicina il tag.';
        if (this.blocked) return 'Esporta i tag e risolvi l\u2019avviso in alto.';
        if (this.entries.length >= MAX_ENTRIES) return 'Esporta e svuota lo storico per continuare.';
        if (this.scanState === 'starting') return 'Consenti l\u2019accesso NFC, se richiesto.';
        return this.running ? (this.singleMode ? 'Dopo la lettura vedrai tutti i dati.' : 'Un tag dopo l\u2019altro, senza premere altro.') : (this.singleMode ? 'Una lettura alla volta, con dettagli automatici.' : 'Premi Avvia per iniziare la raccolta.');
      },
      readerHint() {
        if (!this.supported) return this.isDesktop ? 'Controlla driver e servizio Smart Card di Windows.' : 'NFC attivo, sito HTTPS e tag NDEF.';
        if (this.running && this.keepScreenAwake && this.wakeActive) return 'Schermo mantenuto acceso durante la lettura.';
        return this.running ? 'Tieni l\u2019app visibile e lo schermo sbloccato.' : (this.singleMode ? 'Si fermerà automaticamente dopo un tag.' : 'Le letture restano salvate su questo dispositivo.');
      },
      lastEntry() { return this.entries.at(-1) || null; },
      entryKeys() { return new Set(this.entries.map(e => e.key)); },
      filteredEntries() {
        const query = this.search.trim().toLocaleLowerCase('it-IT');
        const uidQuery = normalizeUid(this.search);
        return this.entries.map((entry, i) => ({...entry, number: i + 1})).reverse().filter(entry =>
          !query || entry.uid.toLocaleLowerCase('it-IT').includes(query) ||
          (uidQuery && entry.uid.includes(uidQuery)) || entry.content.toLocaleLowerCase('it-IT').includes(query));
      },
      visibleEntries() { return this.filteredEntries.slice(0, this.visibleLimit); },
      moreEntries() { return this.filteredEntries.length > this.visibleLimit; },
      detail() { return this.detailPreview || this.entries.find(e => e.id === this.detailId) || null; },
      canOpenLatest() { return this.feedback?.kind !== 'error' && !!(this.latestRead || this.lastEntry); },
      lastCard() {
        if (this.feedback) return this.feedback;
        if (this.lastEntry) return {kind: 'neutral', title: 'Ultimo tag salvato', uid: this.lastEntry.uid,
          message: this.lastEntry.uid ? '' : 'UID non disponibile', timestamp: this.lastEntry.timestamp};
        return {kind: 'neutral', title: 'Il prossimo tag apparir\u00e0 qui', uid: '', message: 'Tutto pronto per la prima lettura.', timestamp: ''};
      },
      storageMessage() {
        if (this.externalConflict) return 'Archivio modificato in un\u2019altra scheda. Esporta prima di ricaricare.';
        if (this.storageProblem === 'corrupt') return 'Archivio locale danneggiato: recupero richiesto.';
        if (this.pendingSave) return 'Modifiche solo in memoria. Esporta prima di chiudere.';
        return 'Salvataggio locale non disponibile. Verifica lo spazio e i permessi.';
      },
    },
    mounted() {
      this.applyTheme();
      if (desktopBridge) {
        desktopUnsubscribe = desktopBridge.onEvent(event => this.onDesktopEvent(event));
        desktopBridge.getStatus().then(status => {if (status) this.desktopStatus=status;}).catch(()=>{});
      }
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.stopScan);
      window.addEventListener('beforeunload', this.beforeUnload);
      window.addEventListener('storage', this.onStorage);
      window.addEventListener('beforeinstallprompt', this.onInstallAvailable);
      window.addEventListener('appinstalled', this.onAppInstalled);
      media?.addEventListener?.('change', this.onSystemTheme);
      desktopMedia?.addEventListener?.('change', this.onDesktopLayoutChange);
      this.registerWorker();
    },
    beforeUnmount() {
      this.stopScan();
      this.cancelWrite();
      desktopUnsubscribe?.();desktopUnsubscribe=null;
      clearTimeout(toastTimer);
      clearTimeout(feedbackTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.stopScan);
      window.removeEventListener('beforeunload', this.beforeUnload);
      window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('beforeinstallprompt', this.onInstallAvailable);
      window.removeEventListener('appinstalled', this.onAppInstalled);
      media?.removeEventListener?.('change', this.onSystemTheme);
      desktopMedia?.removeEventListener?.('change', this.onDesktopLayoutChange);
    },
    methods: {
      formattedTime, formattedShortDate, formattedTimestamp,
      padNumber(n) { return String(n).padStart(2, '0'); },
      iconFor(kind) { return {success: '#ico-check', duplicate: '#ico-duplicate', error: '#ico-info'}[kind] || '#ico-tag'; },
      onDesktopLayoutChange(event) { this.desktopLayout = event.matches; },
      onDesktopEvent(event) {
        if (!event || typeof event.type!=='string') return;
        if (event.type==='status') { this.desktopStatus={available:!!event.available,readers:event.readers||[],error:event.error||''}; return; }
        if (event.type==='write-result') {
          this.writeState=event.ok?'success':'error';
          this.writeMessage=event.ok?`Tag scritto e verificato${event.uid?' · '+event.uid:''}.`:(event.message||'Errore scrittura.');
          if (event.ok) {this.writeConfirmed=false;this.emitFeedback('success','Scrittura completata');}
          else this.emitFeedback('error','Scrittura non riuscita',this.writeMessage);
          return;
        }
        if (event.type==='reading' && this.running) {
          const converted=(event.records||[]).map(r=>({...r,data:Uint8Array.from(r.data||[])}));
          this.handleReading({serialNumber:event.uid||'',message:{records:converted}});
        }
      },
      chooseWriteKind(kind) {this.writeKind=kind;this.writeValue='';this.resetWriteApproval();},
      resetWriteApproval(){this.writeConfirmed=false;if(this.writeState!=='waiting'){this.writeState='idle';this.writeMessage='';}},
      startWrite(){
        if(!this.canWrite)return;
        if(this.running)this.stopScan();
        if (this.soundEnabled||this.alertSoundEnabled) prepareAudio();
        const data={kind:this.writeKind,value:this.writeValue.trim()};
        this.writeMessage='Avvicina ora il tag da programmare.';this.writeState='waiting';
        if(desktopBridge){
          desktopBridge.startWrite(data).then(result=>{
            if(result?.ok)return;
            this.writeState='error';this.writeMessage=result?.message||'Lettore PC/SC non disponibile.';
            this.emitFeedback('error','Scrittura non avviata',this.writeMessage);
          }).catch(err=>{this.writeState='error';this.writeMessage=err?.message||'Errore PC/SC.';});
          return;
        }
        try {
          const controller=new AbortController();writeController=controller;
          const writer=new window.NDEFReader();
          const message={records:[data.kind==='url'?{recordType:'url',data:data.value}:{recordType:'text',data:data.value,lang:'it',encoding:'utf-8'}]};
          // Must be invoked synchronously inside the user's click (Web NFC activation).
          const writing=writer.write(message,{overwrite:true,signal:controller.signal});
          Promise.resolve(writing).then(()=>{
            if(writeController!==controller)return;
            writeController=null;this.writeState='success';this.writeConfirmed=false;this.writeMessage='Scrittura completata. Puoi rileggere il tag per verificarlo.';
            this.emitFeedback('success','Tag scritto');
          }).catch(error=>{
            if(writeController!==controller)return;
            writeController=null;this.writeState='error';this.writeMessage=error?.name==='NotAllowedError'?'Permesso NFC negato.':error?.name==='NotSupportedError'?'Tag non supportato o protetto.':(error?.message||'Scrittura NFC non riuscita.');
            this.emitFeedback('error','Scrittura non riuscita',this.writeMessage);
          });
        }catch(error){writeController=null;this.writeState='error';this.writeMessage=error?.message||'Scrittura NFC non disponibile.';this.emitFeedback('error','Scrittura non riuscita',this.writeMessage);}
      },
      async cancelWrite(){
        if (writeController){writeController.abort();writeController=null;}
        if(desktopBridge){
          try {const result=await desktopBridge.cancelWrite();if(result&&!result.ok){this.writeMessage=result.message;return;}}catch(_){ }
        }
        if(this.writeState==='waiting'){this.writeState='idle';this.writeMessage='Scrittura annullata.';}
      },
      setTab(tab, focus = false) {
        if(tab==='writer' && this.running)this.stopScan();
        this.tab = tab;
        if (focus) this.$nextTick(() => {
          const target = this.desktopLayout ? document.getElementById(`panel-${tab}`) : document.getElementById(`tab-${tab}`);
          target?.focus({preventScroll: true});
        });
      },
      tabKeydown(event) {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const tabs=['reader','writer','history'];const i=tabs.indexOf(this.tab);
          this.setTab(event.key==='Home'?'reader':event.key==='End'?'history':tabs[(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);
        }
      },
      notify(text, tone = 'neutral') {
        clearTimeout(toastTimer);
        this.toast = {text, tone};
        toastTimer = setTimeout(() => { this.toast = null; }, 3200);
      },
      emitFeedback(kind, title, message = '', tag = null) {
        this.feedback = {kind, title, message, uid: tag?.uid || '', timestamp: tag?.timestamp || new Date().toISOString()};
        this.flash = kind;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => { this.flash = ''; }, 850);
        if (this.tab === 'history' && !this.modal) this.notify(title + (message ? `: ${message}` : ''), kind);
        const enabled = kind === 'success' ? this.soundEnabled : this.alertSoundEnabled;
        if (enabled) playSound(kind, this.volume);
        if (this.vibrationEnabled) {
          try { navigator.vibrate?.(kind === 'error' ? [90, 60, 90] : kind === 'duplicate' ? [30, 65, 30] : 35); } catch (_) {}
        }
      },
      reportReadError(message, throttled = false) {
        const now = Date.now();
        if (throttled && now - lastErrorAt < REPEAT_DELAY_MS) { lastErrorAt = now; return; }
        lastErrorAt = now;
        this.errors++;
        this.emitFeedback('error', 'Lettura non riuscita', message);
      },
      startScan() {
        if (this.running || !this.canStart) return;
        // No await before scan(): preserve the browser's transient user activation.
        if (this.soundEnabled || this.alertSoundEnabled) prepareAudio();
        lastEvent = {key: '', at: -Infinity};
        lastErrorAt = -Infinity;
        this.feedback = null;
        this.latestRead = null;
        this.latestUnsaved = false;
        const controller = new AbortController();
        scanController = controller;
        this.scanState = 'starting';
        const current = () => scanController === controller && !controller.signal.aborted;
        if (desktopBridge) {
          desktopBridge.startScan().then(result=>{if (!current()) return;
            if (!result?.ok){this.stopScan();this.reportReadError(result?.message||'Lettore USB non disponibile.');}
            else {this.scanState='active';}
          }).catch(error=>{if(current()){this.stopScan();this.reportReadError(error?.message||'Errore PC/SC.');}});
          return;
        }
        try {
          const reader = new window.NDEFReader();
          reader.addEventListener('reading', event => {
            if (current() && !document.hidden) this.handleReading(event);
          });
          reader.addEventListener('readingerror', () => {
            if (current() && !document.hidden) this.reportReadError('Tag non leggibile o non compatibile NDEF.', true);
          });
          Promise.resolve(reader.scan({signal: controller.signal})).then(() => {
            if (!current()) return;
            this.scanState = 'active';
            this.requestWakeLock();
          }).catch(error => {
            if (!current()) return;
            this.stopScan();
            this.reportReadError(nfcErrorMessage(error));
          });
        } catch (error) {
          if (!current()) return;
          this.stopScan();
          this.reportReadError(nfcErrorMessage(error));
        }
      },
      stopScan() {
        const controller = scanController;
        scanController = null;
        if (controller && !controller.signal.aborted) controller.abort();
        this.scanState = 'idle';
        if (desktopBridge) desktopBridge.stopScan().catch(()=>{});
        this.releaseWakeLock();
      },
      toggleScan() { if (this.running) this.stopScan(); else this.startScan(); },
      handleReading(event) {
        let tag;
        try { tag = parseNfcReading(event); }
        catch (error) { this.reportReadError(error instanceof RangeError ? error.message : 'Contenuto NDEF non leggibile.', true); return; }
        if (!tag) { this.reportReadError('Tag rilevato, ma senza UID o dati NDEF utilizzabili.', true); return; }
        // One-shot mode accepts exactly one valid reading. Stop the reader BEFORE
        // any storage or modal work, so queued NFC events cannot add further tags.
        const oneShot = this.singleMode;
        if (oneShot) this.stopScan();
        const now = Date.now();
        const isBurst = lastEvent.key === tag.key && now - lastEvent.at < REPEAT_DELAY_MS;
        lastEvent = {key: tag.key, at: now};
        if (isBurst) return; // Wait for a quiet interval; do not beep continuously on a held tag.
        const duplicate = this.entryKeys.has(tag.key);
        if (duplicate) {
          this.duplicates++;
          if (this.ignoreDuplicates) {
            this.latestRead = tag;
            this.latestUnsaved = true;
            this.emitFeedback('duplicate', 'Tag gi\u00e0 presente', 'Doppione non aggiunto allo storico.', tag);
            if (oneShot) this.openDetail(tag, true);
            return;
          }
        }
        if (this.entries.length >= MAX_ENTRIES) {
          this.stopScan();
          this.reportReadError('Limite di 5.000 tag. Esporta e svuota lo storico.');
          return;
        }
        const newEntry = {...tag, id: newId()};
        this.entries = [...this.entries, newEntry];
        this.latestRead = newEntry;
        this.latestUnsaved = false;
        // A failed save retains the read in memory, stops NFC, and never plays success.
        if (!this.persistEntries()) {
          this.stopScan();
          this.reportReadError('Tag solo in memoria: esporta lo storico prima di chiudere.');
          if (oneShot) this.openDetail(newEntry, true);
          return;
        }
        this.emitFeedback(duplicate ? 'duplicate' : 'success', duplicate ? 'Doppione salvato' : 'Tag acquisito',
          duplicate ? 'Filtro duplicati disattivato.' : (tag.uid ? '' : 'UID assente: salvato il contenuto NDEF.'), tag);
        if (oneShot) this.openDetail(newEntry);
      },
      persistEntries() {
        if (this.externalConflict) return false;
        try {
          const data = JSON.stringify(this.entries);
          localStorage.setItem(STORAGE_ENTRIES, data);
          rawArchive = data;
          this.pendingSave = false;
          this.storageProblem = '';
          return true;
        } catch (_) {
          this.pendingSave = true;
          this.storageProblem = 'write';
          return false;
        }
      },
      retryStorage() {
        if (this.externalConflict) { this.notify('Esporta lo storico, poi chiudi le altre schede e ricarica.', 'error'); return; }
        if (this.storageProblem === 'corrupt') { this.openDialog('repair'); return; }
        if (this.storageProblem === 'unavailable' && !this.pendingSave) {
          // A transient read failure must not overwrite an existing archive with [].
          try { rawArchive = localStorage.getItem(STORAGE_ENTRIES); }
          catch (_) { this.notify('Archivio ancora non accessibile.', 'error'); return; }
          try {
            const parsed = rawArchive === null ? [] : JSON.parse(rawArchive);
            if (!Array.isArray(parsed)) throw new Error('Invalid archive');
            this.entries = restoreEntries(parsed);
            if (this.entries.length !== parsed.length) throw new Error('Partial archive');
          } catch (_) { this.storageProblem = 'corrupt'; this.openDialog('repair'); return; }
        }
        if (this.persistEntries()) this.notify('Archivio salvato. Puoi riprendere la lettura.', 'success');
        else this.notify('Salvataggio non riuscito. Esporta i tag per conservarli.', 'error');
      },
      beforeUnload(event) {
        if (!this.pendingSave) return;
        event.preventDefault();
        event.returnValue = '';
      },
      onStorage(event) {
        if (event.key !== STORAGE_ENTRIES && event.key !== null) return;
        this.stopScan();
        if (this.pendingSave) {
          this.externalConflict = true;
          return;
        }
        try {
          rawArchive = event.key === null ? null : event.newValue;
          const parsed = rawArchive === null ? [] : JSON.parse(rawArchive);
          if (!Array.isArray(parsed)) throw new Error('Invalid archive');
          const restored = restoreEntries(parsed);
          this.entries = restored;
          this.storageProblem = restored.length !== parsed.length ? 'corrupt' : '';
          this.feedback = null;
          this.latestRead = null;
          this.latestUnsaved = false;
          lastEvent = {key: '', at: -Infinity};
          if (this.modal !== 'settings') this.closeDialog();
          this.notify('Archivio aggiornato da un\u2019altra scheda. Scansione fermata.');
        } catch (_) { this.storageProblem = 'corrupt'; }
      },
      downloadRecovery() {
        try {
          downloadBlob(rawArchive ?? '', 'application/json;charset=utf-8', 'nfc-archivio-da-recuperare.json');
          this.recoveryDownloaded = true;
        } catch (_) { this.notify('Copia originale non scaricata. Riprova.', 'error'); }
      },
      repairArchive() {
        if (!this.recoveryDownloaded) return;
        if (this.persistEntries()) {
          this.closeDialog();
          this.notify('Archivio ripristinato con i tag recuperabili.', 'success');
        } else this.notify('Spazio o permessi di archiviazione insufficienti.', 'error');
      },
      saveSettings() {
        try {
          localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({
            soundEnabled: this.soundEnabled, alertSoundEnabled: this.alertSoundEnabled, volume: this.volume,
            vibrationEnabled: this.vibrationEnabled, ignoreDuplicates: this.ignoreDuplicates, singleMode: this.singleMode,
            keepScreenAwake: this.keepScreenAwake, includeNumber: this.includeNumber, theme: this.theme,
          }));
        } catch (_) { this.notify('Preferenze non salvate su questo dispositivo.', 'error'); }
      },
      onScanModeChange() {
        if (this.running) this.stopScan();
        this.saveSettings();
      },
      onSettingsChange() {
        this.saveSettings();
        if (this.soundEnabled || this.alertSoundEnabled) prepareAudio();
        if (this.keepScreenAwake && this.running) this.requestWakeLock();
        else if (!this.keepScreenAwake) this.releaseWakeLock();
      },
      testSound(kind) {
        prepareAudio();
        // Resume can settle asynchronously; this promise is unrelated to scan().
        setTimeout(() => {
          if (!playSound(kind, this.volume)) this.notify('Controlla volume multimediale e audio del browser.', 'error');
        }, 60);
      },
      setTheme(theme) { this.theme = theme; this.applyTheme(); this.saveSettings(); },
      onSystemTheme() { if (this.theme === 'auto') this.applyTheme(); },
      applyTheme() {
        const theme = this.theme === 'auto' ? (media?.matches ? 'dark' : 'light') : this.theme;
        document.documentElement.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171822' : '#f7f8fc');
      },
      onVisibility() {
        this.hidden = document.hidden;
        if (document.hidden) this.releaseWakeLock();
        else if (this.running) this.requestWakeLock();
      },
      async requestWakeLock() {
        if (wakeLock || wakePending || !this.keepScreenAwake || !this.running || document.hidden) return;
        if (!navigator.wakeLock?.request) { this.wakeUnavailable = true; return; }
        wakePending = true;
        try {
          const lock = await navigator.wakeLock.request('screen');
          if (!this.running || !this.keepScreenAwake || document.hidden) { await lock.release(); return; }
          wakeLock = lock;
          this.wakeActive = true;
          this.wakeUnavailable = false;
          lock.addEventListener('release', () => {
            if (wakeLock === lock) { wakeLock = null; this.wakeActive = false; }
          });
        } catch (_) { this.wakeUnavailable = true; }
        finally { wakePending = false; }
      },
      releaseWakeLock() {
        const lock = wakeLock;
        wakeLock = null;
        this.wakeActive = false;
        if (lock) lock.release().catch(() => {});
      },
      openDialog(name) {
        this.toast = null;
        if (name === 'repair') this.recoveryDownloaded = false;
        if (!this.modal) returnFocus = document.activeElement;
        this.modal = name;
        this.$nextTick(() => {
          const dialog = this.$refs.dialog;
          if (!dialog.open) dialog.showModal();
          const focus = dialog.querySelector('[data-autofocus]') || dialog.querySelector('button');
          focus?.focus({preventScroll: true});
        });
      },
      closeDialog() {
        this.$refs.dialog?.close();
        this.modal = '';
        this.detailPreview = null;
        this.detailUnsaved = false;
        returnFocus?.focus?.({preventScroll: true});
      },
      onDialogKeydown(event) {
        if (event.key !== 'Tab') return;
        const dialog = this.$refs.dialog;
        const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      },
      onBackdrop(event) { if (event.target === this.$refs.dialog) this.closeDialog(); },
      openSettings() { this.settingsTab = 'reading'; this.openDialog('settings'); },
      openExport() { if (!this.entries.length) return; this.exportFormat = 'csv'; this.openDialog('export'); },
      openDetail(entry, unsaved = false) {
        if (!entry) return;
        this.detailId = entry.id || '';
        this.detailPreview = unsaved ? entry : null;
        this.detailUnsaved = unsaved;
        this.detailAccordionVersion++; // Reset native <details> each time a tag is opened.
        this.openDialog('detail');
      },
      openLatestDetail() {
        if (!this.canOpenLatest) return;
        this.openDetail(this.latestRead || this.lastEntry, this.latestRead ? this.latestUnsaved : false);
      },
      openLastSaved() { if (this.lastEntry) this.openDetail(this.lastEntry); },
      async shareTag() {
        const entry = this.detail;
        if (!entry) return;
        const text = shareTagText(entry);
        if (typeof navigator.share === 'function') {
          try {
            // Native share() must run directly inside the tap handler.
            await navigator.share({title: 'NFC Reader · Tag NFC', text});
            return;
          } catch (error) {
            if (error?.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(text);
          this.notify('Dettagli copiati: ora puoi incollarli.', 'success');
        } catch (_) {
          downloadBlob(text, 'text/plain;charset=utf-8', fileName('txt'));
          this.notify('Condivisione non disponibile: dettagli scaricati in TXT.');
        }
      },
      async shareArchive() {
        const format = this.exportFormat;
        if (!this.entries.length || !['csv', 'txt'].includes(format)) return;
        const contents = format === 'csv' ? exportCsv(this.entries, this.includeNumber) : exportTxt(this.entries, this.includeNumber);
        const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
        const name = fileName(format);
        try {
          // share() is called in the button handler, without awaiting other work.
          if (typeof navigator.share === 'function') {
            if (typeof File === 'function' && typeof navigator.canShare === 'function') {
              const file = new File([contents], name, {type: mime});
              if (navigator.canShare({files: [file]})) {
                await navigator.share({files: [file], title: 'NFC Reader · Storico NFC'});
                return;
              }
            }
            // Some Android targets only accept text; limit the size for reliability.
            if (contents.length <= 12000) {
              await navigator.share({title: 'NFC Reader · Storico NFC', text: contents});
              return;
            }
          }
        } catch (error) {
          if (error?.name === 'AbortError') return; // User cancelled the system share sheet.
        }
        try {
          downloadBlob(contents, mime, name);
          this.notify('Condivisione non disponibile: file ' + format.toUpperCase() + ' scaricato.');
        } catch (_) { this.notify('Impossibile condividere o scaricare il file.', 'error'); }
      },
      async copyUid(entry) {
        if (!entry?.uid) return;
        try { await navigator.clipboard.writeText(entry.uid); this.notify('UID copiato', 'success'); }
        catch (_) { this.notify('Copia non disponibile. Seleziona l\u2019UID dal dettaglio.', 'error'); }
      },
      askDelete() { if (this.blocked || this.detailUnsaved) return; this.stopScan(); this.openDialog('delete'); },
      deleteEntry() {
        if (this.blocked) return;
        this.entries = this.entries.filter(e => e.id !== this.detailId);
        lastEvent = {key: '', at: -Infinity};
        this.feedback = null;
        this.latestRead = null;
        this.latestUnsaved = false;
        this.closeDialog();
        if (this.persistEntries()) this.notify('Tag eliminato');
        else this.notify('Eliminazione non salvata: controlla l\u2019archivio.', 'error');
      },
      askClear() {
        if (!this.entries.length || this.blocked) return;
        this.stopScan();
        this.openDialog('clear');
      },
      clearAll() {
        if (this.blocked) return;
        this.entries = [];
        this.search = '';
        this.visibleLimit = PAGE_SIZE;
        this.feedback = null;
        this.latestRead = null;
        this.latestUnsaved = false;
        this.duplicates = 0;
        this.errors = 0;
        lastEvent = {key: '', at: -Infinity};
        this.closeDialog();
        if (this.persistEntries()) this.notify('Storico svuotato');
        else this.notify('Cancellazione non salvata. Riprova prima di chiudere.', 'error');
      },
      download(format) {
        if (!this.entries.length || !['csv', 'txt'].includes(format)) return;
        try {
          const contents = format === 'csv' ? exportCsv(this.entries, this.includeNumber) : exportTxt(this.entries, this.includeNumber);
          downloadBlob(contents, format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8', fileName(format));
          this.notify(`${format.toUpperCase()}: download avviato`, 'success');
        } catch (_) { this.notify('Esportazione non riuscita.', 'error'); }
      },
      onInstallAvailable(event) { event.preventDefault(); installEvent = event; this.installPrompt = true; },
      async installApp() {
        if (!installEvent) return;
        const event = installEvent;
        installEvent = null;
        this.installPrompt = false;
        try { await event.prompt(); await event.userChoice; }
        catch (_) { this.notify('Installa l\u2019app dal menu del browser.'); }
      },
      onAppInstalled() { this.installed = true; this.installPrompt = false; installEvent = null; },
      async registerWorker() {
        if (desktopBridge || !('serviceWorker' in navigator) || !window.isSecureContext) return;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          this.offlineReady = true;
          if (updateRequested) location.reload();
        });
        try {
          workerRegistration = await navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'});
          const check = () => { this.updateAvailable = !!workerRegistration.waiting; };
          check();
          workerRegistration.addEventListener('updatefound', () => {
            const worker = workerRegistration.installing;
            worker?.addEventListener('statechange', () => { if (worker.state === 'installed') check(); });
          });
          navigator.serviceWorker.ready.then(() => { this.offlineReady = true; });
          workerRegistration.update().catch(() => {});
        } catch (_) { this.offlineFailed = true; }
      },
      applyUpdate() {
        if (this.running) { this.notify('Ferma la scansione prima di aggiornare.'); return; }
        if (this.pendingSave || this.blocked) { this.notify('Salva o esporta lo storico prima di aggiornare.', 'error'); return; }
        if (!workerRegistration?.waiting) return;
        updateRequested = true;
        workerRegistration.waiting.postMessage({type: 'SKIP_WAITING'});
      },
    },
  }).mount('#app');
}
