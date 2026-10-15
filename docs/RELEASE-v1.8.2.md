# NFC Reader v1.8.2 — Classic NDEF + correzione EPIPE

Versione: **v1.8.2** · 15 ottobre 2026

## Novità

- Aggiunto supporto controllato alla lettura e scrittura NDEF di **MIFARE Classic 1K già formattate NDEF**, tramite ACS ACR122U: chiavi standard, MAD CRC, ACL per blocco, scrittura dei soli blocchi NDEF e readback.
- Protezione dei dati su MAD, UID, chiavi e trailer. Esclusa la scrittura arbitraria, la formattazione di nuove Classic e l'utilizzo con badge protetti.
- Corretto errore JavaScript `write EPIPE` durante la chiusura dell'app Windows.
- Aggiornati documentazione, build portable GitHub Actions e PWA.

## Artefatto per la Release

`NFC-Reader-Portable-1.8.2-x64.exe` prodotto dal workflow **Compila EXE portable Windows** in GitHub Actions. Nessun installer.

## Limitazioni / test

Collaudo hardware reale NON ancora effettuato su ACR122U. L'eseguibile Windows deve essere generato su runner Windows: ZIP = sorgenti pronti, non EXE precompilato. I tag Classic 1K senza directory MAD NDEF valida richiedono formattazione a parte. Non usare badge aziendali.
