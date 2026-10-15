# Changelog

## v1.8.3 · 15 ottobre 2026

- **Lettura multipla** rinominata come opzione: disattivata di default, legge un solo tag e mostra automaticamente i dettagli. La preferenza precedente `singleMode` non impone più la scansione continua.
- **Storico aggiornato sui tag riscritti**: lo stesso UID con un record NDEF diverso aggiorna la riga esistente (evita il vecchio contenuto conservato dal filtro duplicati). Una lettura NDEF vuota non sovrascrive il contenuto valido precedente.
- **Verifica NDEF semantica**: dopo `FF D6`, rilegge tutta la struttura e confronta il record Testo/URL con la richiesta. Non basta la risposta `9000` o il confronto binario dei blocchi.
- **MIFARE Classic 1K**: diagnostica del GPB di MAD e settori NDEF; evita scritture su mappature NDEF non conformi, senza alterare MAD o trailer. Le TLV a lunghezza zero vengono segnalate come vuote.
- **Finestra Electron**: dimensione minima 1024 × 720 px e spaziature desktop per impedire scrollbar sulla schermata di lettura.
- Aggiornati test, Service Worker, release e build Windows portable.

## v1.8.2 · 15 ottobre 2026

- Supporto aggiuntivo alla lettura e scrittura NDEF MIFARE Classic 1K *già formattate* con MAD1 e chiavi standard su ACS ACR122U.
- Autenticazione per settore, validazione CRC e ACL, nessuna scrittura fuori dai blocchi dati NDEF, verifica post-scrittura.
- Corretto crash `write EPIPE` alla chiusura di Electron: gestione stream asincrona e arresto del bridge senza inviare `QUIT` a stdin potenzialmente chiuso.
- Aggiornati workflow, documentazione, test e cache della PWA.


## v1.8.1 · 15 ottobre 2026
- **Fix ACS ACR122 (6300):** identifica il tipo di tag tramite ATR PC/SC prima di leggere la memoria NDEF.
- I tag MIFARE Classic e gli altri tipi non-Type2 espongono solo l'UID quando disponibile: niente letture NDEF improprie e **nessun comando di scrittura**.
- La scrittura Type 2 richiede un ATR riconosciuto e i controlli già presenti su Capability Container, layout TLV, capacità e verifica successiva.
- Se una lettura CC da 4 byte fallisce con `6300`, prova una sola volta la lettura **di sola lettura** da 16 byte, prevista dal protocollo ACS.
- Dettagli tag desktop: **tipo di carta, lettore, ATR e motivo dell'assenza di dati NDEF**; le informazioni vengono conservate nello storico e disponibili nella condivisione.
- Migliorati i messaggi di errore durante la scrittura, senza falsi messaggi di riuscita.
- Portabilità Windows e struttura unica Vue / GitHub Pages / Electron invariate.

## v1.8.0 · 15 ottobre 2026

- **Portabile vero**: produzione di un solo `NFC-Reader-Portable-1.8.0-x64.exe` tramite electron-builder portable; niente installer, nessuna cartella accessoria da distribuire.
- **PC/SC corretto**: eliminato `pcsc-mini` / `@pcsc-mini/*`; usato bridge WinSCard di Windows compilato con strumenti .NET Framework inclusi nel sistema. Nessun Python o modulo Node nativo.
- Rilevamento lettori e presenza tag con identificatore per ogni inserimento; transazioni solo su lettori/tag ancora validi.
- **Icone trasparenti** PNG 192/512 e ICO Windows rigenerate senza sfondo chiaro esterno.
- GitHub Actions per compilazione bridge, test e distribuzione del portable nella sezione Artifacts.


## v1.7.0 · 15 ottobre 2026

- **Un repository unico**: sito PWA Vue, layout desktop Electron, test, icone, documentazione e workflow GitHub Actions.
- **Build Windows senza Python locale**: sostituita la vecchia dipendenza `nfc-pcsc`/`pcsclite` basata su node-gyp con il modulo `pcsc-mini` dotato di binari N-API precompilati per Windows x64/Electron.
- Aggiunto adapter PC/SC per lettura UID (`FF CA`) e, su ACS ACR122U e tag Type 2 riconosciuti, lettura e scrittura NDEF (`FF B0` / `FF D6`).
- Controlli APDU, restrizioni di scrittura alle sole pagine NDEF, verifica post-scrittura e nessuna scrittura verso lettori non riconosciuti.
- Workflow **Compila installer Windows**: test, packaging NSIS, pubblicazione `.exe` negli artefatti Actions. L'utente può allegarlo manualmente alla Release.
- Workflow **Pubblica NFC Reader web**: deploy esclusivamente dei file PWA, senza componenti desktop sul sito.
- Nuova icona `.ico` per l'installer Windows e versionamento coerente della cache PWA.
- **Interfaccia Vue invariata rispetto alla v1.6.0:** stessa pagina nel browser e nel wrapper Electron, con layout responsive desktop a due colonne.
- Test aggiornati per il nuovo driver PC/SC simulato.

### Limitazione di verifica

Installer, caricamento effettivo del driver su Windows e lettura/scrittura con hardware reale non testabili in questa sessione. La pipeline deve essere eseguita sul proprio repository prima della distribuzione.

## v1.6.0 · 15 ottobre 2026

- Vista desktop a due colonne, con Storico a destra.
- Nuova sezione Scrivi (testo o URL) per Chrome Android ed Electron USB.
- Bridge desktop PC/SC, con codec NDEF Type 2, protezioni e controllo capacità.

## v1.4.0

- Pulsante Condividi sopra lo Storico, modale esportazione CSV/TXT e accordion dei record chiuso di default.

## v1.3.0

- Lettura singola/continua, dettagli NDEF, condivisione.

## v1.2.0

- Tab Lettore e Storico, segnali acustici di successo/doppione/errore, layout mobile senza scroll nella pagina Lettore.
