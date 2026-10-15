# NFC Reader v1.8.0 - Windows Portable + Web NFC

## Novità

- **EXE portable unico** per Windows 10/11 x64, avviabile senza installazione.
- Corretto l'errore `Required addon dependency not found (@pcsc-mini/windows-x86_64-electron)` sostituendo completamente i moduli PC/SC Node nativi con bridge WinSCard Windows incluso nell'app.
- **Non serve Python** per compilare, né file DLL separati da installare; PC/SC usa WinSCard già fornito da Windows.
- Icona dell'app e di Windows aggiornata con **sfondo esterno trasparente**.
- Invariata l'interfaccia Vue condivisa con GitHub Pages: layout adattivo desktop/mobile, lettura singola/continua, scrittura NDEF, registro tag e condivisione.
- Gestione dei tag associata a singole presentazioni e stop sicuro in caso di sostituzione/rimozione durante l'operazione.

## Download

**Windows 10/11 x64:** `NFC-Reader-Portable-1.8.0-x64.exe` - avvia direttamente, senza procedura di installazione.

L'app usa un lettore NFC USB PC/SC riconosciuto da Windows e il servizio Smart Card. Alcuni lettori forniscono soltanto l'UID; la scrittura è abilitata esclusivamente su ACS ACR122U compatibili e tag NDEF Type 2 riconosciuti. Non sono supportati dispositivi solo HID/tastiera. La versione Web NFC resta disponibile via GitHub Pages su Android compatibile.

**Nota sulla sicurezza:** il file non è firmato digitalmente. SmartScreen o software aziendali potrebbero mostrare avvisi. Per la scrittura usa solo tag di prova di tua proprietà: non rimuoverli mentre l'operazione è in corso.

**Stato test:** unit test simulati eseguiti. Build e lettura PC/SC fisica da verificare prima della distribuzione operativa.
