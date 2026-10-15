# NFC Reader v1.7.0 — Web + Windows

**Versione unificata** della web app NFC Reader basata su Vue 3, disponibile su GitHub Pages e come applicazione desktop Windows (Electron).

## Novità principali

- Unico progetto per browser e Electron: la stessa UI responsive, con il Lettore/Scrivi e lo Storico affiancati su PC.
- Supporto USB PC/SC su Windows per la lettura UID dei tag compatibili.
- Primo supporto controllato alla lettura/scrittura NDEF Type 2 con lettore ACS ACR122U; conferma, controlli di capienza e verifica dopo la scrittura.
- Progetto desktop con dipendenza PC/SC precompilata: la build locale su Windows x64 non richiede più Python o node-gyp.
- Workflow GitHub Actions per creare l'installer `.exe` e distribuire separatamente il sito su GitHub Pages.

## Installazione Windows

Scarica l'installer `NFC-Reader-Setup-1.7.0-x64.exe` dagli allegati di questa Release. Windows 10/11 x64; è richiesto un lettore NFC USB compatibile PC/SC per le operazioni hardware. Verifica che il driver del lettore e il servizio Smart Card siano attivi.

**Nota:** L'installer non è firmato digitalmente e potrebbe essere segnalato da SmartScreen. La compatibilità hardware va verificata sul proprio lettore. Non utilizzare la funzione Scrivi per tessere di accesso o tag contenenti dati importanti.

## Web App

Apri la pagina GitHub Pages del progetto in Chrome Android, con NFC attivo, per utilizzare Web NFC. La versione web non riconosce genericamente lettori USB PC/SC per Windows.
