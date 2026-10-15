# NFC Reader 1.8.0 - risultati e collaudi

## Test eseguiti

**57 test JavaScript superati**: 36 per Web/PWA e 21 per Electron, protocollo WinSCard simulato e packaging. Nessun test su lettore fisico eseguito.

- `node --test tests/*.test.mjs`: parser/esportazione, PWA, suoni e cache.
- `cd electron && npm test`: codec NDEF Type 2, APDU `FF CA/B0/D6`, gestione UID, blocco scrittura su lettori non supportati, inserimento/rimozione simulati, protocollo del bridge, errori PC/SC e annullamenti.
- GitHub Actions Windows compila `NfcPcscBridge.cs` tramite Windows PowerShell 5.1, poi verifica che il file sia disponibile, esegue i test e costruisce un solo `.exe` portable.

## Collaudi ancora necessari

1. Verificare l'esito della prima workflow GitHub Actions su `windows-latest` e l'esistenza di `NFC-Reader-Portable-1.8.0-x64.exe`.
2. Avviare l'EXE su Windows 10/11 x64 con lettore PC/SC collegato; verificare enumerazione, inserimento e rimozione tag e lettura UID.
3. Verificare eventuali limitazioni dovute ad antivirus e SmartScreen sull'esecuzione del bridge incorporato.
4. Su ACR122U reale, provare lettura Type 2 e scrittura con un tag NDEF di test sacrificabile, poi rileggere su Android.
5. Verificare lettura singola, lettura continua, gestione duplicati, esportazione CSV/TXT e storico persistente.
6. Verificare funzionalità della PWA su Android reale dopo aggiornamento dalla versione precedente.

**I test JavaScript e la compilazione del frontend non equivalgono a un collaudo hardware reale.**
