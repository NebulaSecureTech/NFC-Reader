import {
  MAX_ENTRIES, parseNfcReading, formattedTime, exportCsv, exportTxt, restoreEntries,
} from './core.mjs';
import { prepareAudio, playReadSound } from './sound.mjs';

const STORAGE_ENTRIES = 'nfc-reader.entries.v1';    // Compatibile con NFC Reader v1.0.0
const STORAGE_SETTINGS = 'nfc-reader.settings.v1';
const REPEAT_DELAY_MS = 1400;   // Ignora eventi multipli mentre il tag resta vicino.
const SHOW_FIRST = 60;

let scanController = null;
let wakeLock = null;
let wakeLockPending = false;
let installEvent = null;
let toastTimer = null;
let pulseTimer = null;
const lastReadAt = new Map();

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (_) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) { return false; }
}
function exportFileName(ext) {
  const now = new Date();
  const two = n => String(n).padStart(2, '0');
  return `nfc-tags_${now.getFullYear()}-${two(now.getMonth()+1)}-${two(now.getDate())}_${two(now.getHours())}-${two(now.getMinutes())}.${ext}`;
}
function downloadBlob(contents, mime, name) {
  const blob = new Blob([contents], {type: mime});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function nfcErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': return 'Permesso NFC negato. Controlla le autorizzazioni di Chrome.';
    case 'NotSupportedError': return 'Lettura NFC non supportata dal telefono o dal tag.';
    case 'NotReadableError': return 'Controlla che NFC sia attivo nelle impostazioni Android.';
    case 'InvalidStateError': return 'Un’altra scansione NFC è già attiva.';
    case 'SecurityError': return 'NFC richiede HTTPS e una pagina visibile.';
    case 'AbortError': return 'Scansione interrotta.';
    default: return 'Impossibile avviare NFC. Verifica permessi e impostazioni.';
  }
}

if (!window.Vue) {
  const fallback = document.getElementById('app');
  fallback.removeAttribute('v-cloak');
  fallback.innerHTML = '<div style="max-width:400px;margin:15vh auto;padding:24px;text-align:center"><h1>Impossibile avviare NFC Reader</h1><p>Il file locale della libreria Vue non è disponibile. Ricarica la pagina o ricarica tutti i file dello ZIP.</p><button onclick="location.reload()">Riprova</button></div>';
} else {
  const { createApp } = window.Vue;
  const settings = readJSON(STORAGE_SETTINGS, {});
  const initialEntries = restoreEntries(readJSON(STORAGE_ENTRIES, []));
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const defaultTheme = ['auto','dark','light'].includes(settings.theme) ? settings.theme : 'auto';

  createApp({
    data() {
      return {
        entries: initialEntries,
        theme: defaultTheme,
        soundEnabled: settings.soundEnabled !== false,
        vibrationEnabled: settings.vibrationEnabled !== false,
        ignoreDuplicates: settings.ignoreDuplicates !== false,
        keepScreenAwake: settings.keepScreenAwake === true,
        includeNumber: settings.includeNumber !== false,
        settingsOpen: false,
        confirmClear: false,
        toastMessage: '',
        toastTone: 'info',
        scanState: 'idle',
        documentHidden: document.hidden,
        search: '',
        visibleLimit: SHOW_FIRST,
        recentSuccess: false,
        lastDuplicateNotice: 0,
        installPrompt: false,
        installed: window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true,
      };
    },
    watch: {
      settingsOpen() { this.syncModalBody(); },
      confirmClear() { this.syncModalBody(); },
    },
    computed: {
      supported() { return window.isSecureContext && typeof window.NDEFReader === 'function'; },
      isRunning() { return this.scanState !== 'idle'; },
      statusClass() {
        return !this.supported ? 'unavailable' : this.scanState === 'active' ? 'active' : this.scanState === 'starting' ? 'starting' : '';
      },
      statusLabel() {
        if (!this.supported) return 'Non disponibile';
        if (this.scanState === 'starting') return 'Attivazione';
        if (this.scanState === 'active') return this.documentHidden ? 'In pausa' : 'In ascolto';
        return 'Pronto';
      },
      scanTitle() {
        if (!this.supported) return 'NFC non disponibile';
        if (this.scanState === 'starting') return 'Attivazione NFC...';
        if (this.scanState === 'active') return this.documentHidden ? 'Lettura in pausa' : 'Avvicina un tag NFC';
        return 'Pronto alla lettura';
      },
      scanSubtitle() {
        if (!this.supported) return 'Per scansionare usa Chrome su Android, con NFC e HTTPS attivi.';
        if (this.scanState === 'starting') return 'Concedi al browser il permesso per leggere NFC, se richiesto.';
        if (this.scanState === 'active') return this.documentHidden ? 'Torna a questa schermata per continuare.' : 'Puoi leggere tutti i tag che vuoi, senza riavviare.';
        return 'Attiva la scansione e passa un tag dopo l’altro.';
      },
      lastEntry() { return this.entries.at(-1) || null; },
      filteredEntries() {
        const query = this.search.trim().toLocaleLowerCase('it-IT');
        return this.entries.map((entry, index) => ({...entry, number: index + 1}))
          .reverse().filter(entry => !query || `${entry.uid} ${entry.content} ${entry.number}`.toLocaleLowerCase('it-IT').includes(query));
      },
      visibleEntries() { return this.filteredEntries.slice(0, this.visibleLimit); },
      moreToShow() { return this.filteredEntries.length > this.visibleLimit; },
    },
    mounted() {
      this.applyTheme();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.stopScan);
      window.addEventListener('keydown', this.onKeydown);
      window.addEventListener('beforeinstallprompt', this.onInstallAvailable);
      window.addEventListener('appinstalled', this.onAppInstalled);
      media?.addEventListener?.('change', this.onSystemTheme);
      if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), {once: true});
        if (document.readyState === 'complete') navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    },
    beforeUnmount() {
      this.stopScan();
      document.body.classList.remove('modal-visible');
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.stopScan);
      window.removeEventListener('keydown', this.onKeydown);
      window.removeEventListener('beforeinstallprompt', this.onInstallAvailable);
      window.removeEventListener('appinstalled', this.onAppInstalled);
      media?.removeEventListener?.('change', this.onSystemTheme);
      window.clearTimeout(toastTimer);
      window.clearTimeout(pulseTimer);
    },
    methods: {
      formattedTime,
      padNumber(value) { return String(value).padStart(2, '0'); },
      showToast(text, tone = 'info') {
        window.clearTimeout(toastTimer);
        this.toastMessage = text;
        this.toastTone = tone;
        toastTimer = window.setTimeout(() => { this.toastMessage = ''; }, 2800);
      },
      onSystemTheme() { if (this.theme === 'auto') this.applyTheme(); },
      applyTheme() {
        const actualTheme = this.theme === 'auto' ? (media?.matches ? 'dark' : 'light') : this.theme;
        document.documentElement.dataset.theme = actualTheme;
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        metaTheme?.setAttribute('content', actualTheme === 'dark' ? '#1c1e2c' : '#f6f7fb');
      },
      setTheme(theme) { this.theme = theme; this.applyTheme(); this.saveSettings(); },
      saveSettings() {
        saveJSON(STORAGE_SETTINGS, {
          theme: this.theme,
          soundEnabled: this.soundEnabled,
          vibrationEnabled: this.vibrationEnabled,
          ignoreDuplicates: this.ignoreDuplicates,
          keepScreenAwake: this.keepScreenAwake,
          includeNumber: this.includeNumber,
        });
      },
      onSettingsChange() {
        this.saveSettings();
        if (this.soundEnabled) prepareAudio();  // La modifica dello switch è un gesto utente.
        if (this.keepScreenAwake && this.isRunning) this.requestWakeLock();
        else if (!this.keepScreenAwake) this.releaseWakeLock();
      },
      openSettings() {
        this.settingsOpen = true;
        this.$nextTick(() => this.$refs.settingsClose?.focus());
      },
      closeSettings() {
        this.settingsOpen = false;
        this.$nextTick(() => document.querySelector('.settings-trigger')?.focus());
      },
      syncModalBody() { document.body.classList.toggle('modal-visible', this.settingsOpen || this.confirmClear); },
      onKeydown(event) {
        if (event.key !== 'Escape') return;
        if (this.confirmClear) this.confirmClear = false;
        else if (this.settingsOpen) this.closeSettings();
      },
      onVisibility() {
        this.documentHidden = document.hidden;
        if (document.hidden) this.releaseWakeLock();
        else if (this.isRunning && this.keepScreenAwake) this.requestWakeLock();
      },
      async requestWakeLock() {
        if (wakeLock || wakeLockPending || !this.keepScreenAwake || !this.isRunning || document.hidden) return;
        if (!navigator.wakeLock?.request) return;
        wakeLockPending = true;
        try {
          const lock = await navigator.wakeLock.request('screen');
          if (!this.isRunning || !this.keepScreenAwake || document.hidden) { await lock.release(); return; }
          wakeLock = lock;
          lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
        } catch (_) { /* Supporto non garantito: l'NFC continua senza wake lock. */ }
        finally { wakeLockPending = false; }
      },
      releaseWakeLock() {
        const lock = wakeLock; wakeLock = null;
        if (lock) lock.release().catch(() => {});
      },
      startScan() {
        if (this.isRunning || !this.supported) return;
        // Importante: scan() va chiamato senza await intermedi, direttamente dal click.
        if (this.soundEnabled) prepareAudio();
        const controller = new AbortController();
        scanController = controller;
        this.scanState = 'starting';
        try {
          const reader = new window.NDEFReader();
          reader.addEventListener('reading', event => {
            if (scanController === controller && !controller.signal.aborted) this.handleReading(event);
          });
          reader.addEventListener('readingerror', () => {
            if (scanController === controller && !controller.signal.aborted) this.showToast('Tag non leggibile o non compatibile NDEF.', 'error');
          });
          // Non serve rilanciare scan() a ogni tag: reading è un evento continuo.
          Promise.resolve(reader.scan({signal: controller.signal})).then(() => {
            if (scanController !== controller || controller.signal.aborted) return;
            this.scanState = 'active';
            if (this.keepScreenAwake) this.requestWakeLock();
          }).catch(error => {
            if (scanController !== controller || controller.signal.aborted) return;
            this.stopScan();
            this.showToast(nfcErrorMessage(error), 'error');
          });
        } catch (error) {
          if (scanController === controller) this.stopScan();
          this.showToast(nfcErrorMessage(error), 'error');
        }
      },
      stopScan() {
        if (scanController && !scanController.signal.aborted) scanController.abort();
        scanController = null;
        this.scanState = 'idle';
        this.releaseWakeLock();
      },
      toggleScan() { if (this.isRunning) this.stopScan(); else this.startScan(); },
      handleReading(event) {
        const tag = parseNfcReading(event);
        if (!tag) {
          this.showToast('Tag rilevato, ma senza UID o contenuto leggibile.', 'error');
          return;
        }
        const now = Date.now();
        const previous = lastReadAt.get(tag.key) ?? 0;
        if (now - previous < REPEAT_DELAY_MS) return;
        lastReadAt.set(tag.key, now);
        // Evita di tenere una mappa infinita in una sessione molto lunga.
        if (lastReadAt.size > MAX_ENTRIES + 100) lastReadAt.clear();
        if (this.ignoreDuplicates && this.entries.some(item => item.key === tag.key)) {
          if (now - this.lastDuplicateNotice > 2200) {
            this.showToast('Tag già presente: duplicato ignorato.');
            this.lastDuplicateNotice = now;
          }
          return;
        }
        if (this.entries.length >= MAX_ENTRIES) {
          this.showToast(`Hai raggiunto ${MAX_ENTRIES} tag: esporta e svuota l’elenco.`, 'error');
          return;
        }
        this.entries.push({...tag, id: window.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`});
        if (!saveJSON(STORAGE_ENTRIES, this.entries)) this.showToast('Memoria piena: esporta ora le letture.', 'error');
        else this.showToast('Tag acquisito', 'success');
        if (this.soundEnabled) playReadSound();
        if (this.vibrationEnabled) { try { navigator.vibrate?.(40); } catch (_) {} }
        this.recentSuccess = true;
        window.clearTimeout(pulseTimer);
        pulseTimer = window.setTimeout(() => { this.recentSuccess = false; }, 850);
        if (this.scanState === 'starting') this.scanState = 'active';
      },
      async copyUid(entry) {
        if (!entry.uid) return;
        try { await navigator.clipboard.writeText(entry.uid); this.showToast('UID copiato', 'success'); }
        catch (_) { this.showToast('Non riesco a copiare l’UID.', 'error'); }
      },
      removeEntry(id) {
        this.entries = this.entries.filter(entry => entry.id !== id);
        saveJSON(STORAGE_ENTRIES, this.entries);
        this.showToast('Tag eliminato');
      },
      askClear() {
        if (!this.entries.length) return;
        this.confirmClear = true;
        this.$nextTick(() => this.$refs.clearCancel?.focus());
      },
      clearAll() {
        this.entries = [];
        this.search = '';
        this.visibleLimit = SHOW_FIRST;
        lastReadAt.clear();
        this.confirmClear = false;
        saveJSON(STORAGE_ENTRIES, []);
        this.showToast('Elenco svuotato');
      },
      download(format) {
        if (!this.entries.length) return;
        try {
          if (format === 'csv') downloadBlob(exportCsv(this.entries, this.includeNumber), 'text/csv;charset=utf-8', exportFileName('csv'));
          else if (format === 'txt') downloadBlob(exportTxt(this.entries, this.includeNumber), 'text/plain;charset=utf-8', exportFileName('txt'));
          else return;
          this.showToast(`${format.toUpperCase()} esportato`, 'success');
        } catch (_) { this.showToast('Errore durante l’esportazione.', 'error'); }
      },
      onInstallAvailable(event) {
        event.preventDefault();
        installEvent = event;
        this.installPrompt = true;
      },
      async installApp() {
        if (!installEvent) return;
        const prompt = installEvent;
        installEvent = null;
        this.installPrompt = false;
        try { await prompt.prompt(); await prompt.userChoice; } catch (_) {}
      },
      onAppInstalled() { this.installed = true; this.installPrompt = false; installEvent = null; },
    },
  }).mount('#app');
}
