# Changelog

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
