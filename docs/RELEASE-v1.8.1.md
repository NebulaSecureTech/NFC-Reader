# NFC Reader v1.8.1 — Diagnostica tag PC/SC e correzione 6300

**Data:** 15 ottobre 2026

## Novità
- Riconoscimento del tipo di card tramite ATR ACS ACR122/Windows PC/SC.
- Correzione della lettura impropria dei blocchi NDEF sulle carte MIFARE Classic.
- Scrittura Type 2 consentita solo a tag riconosciuti, già NDEF, non protetti e di capacità sufficiente.
- Secondo tentativo di lettura da 16 byte della pagina Capability Container solo dopo un errore 6300 a 4 byte.
- Dettagli, ATR, informazioni NDEF e tipo card nell'app e nello storico.
- Correzione delle segnalazioni di errore; nessun comando di scrittura per card non riconosciute.
- Confermate PWA GitHub Pages e applicazione desktop portable con un unico `.exe`.

## Windows portable
`NFC-Reader-Portable-1.8.1-x64.exe` — da **GitHub Actions → Compila EXE portable Windows**.

## Compatibilità
- PC: Windows 10/11 x64 e lettore PC/SC compatibile (ACS ACR122).
- Scrittura PC: solo NDEF Type 2 compatibili, ad esempio NTAG213/215/216 *effettivamente riconosciuti, formattati e scrivibili*.
- Web: Chrome Android, Web NFC/NDEF, HTTPS.
- Aggiornamento: mantenute le chiavi di archivio e preferenze delle versioni precedenti nello stesso browser/origine.

## Stato test
Test automatici e simulazione bridge eseguiti. **Compilazione Windows e prova con lettore fisico non eseguite in questo ambiente.**
