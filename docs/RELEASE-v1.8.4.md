# NFC Reader v1.8.4 — Interfaccia Scrivi essenziale

Data: 15 ottobre 2026

## Miglioramenti
- Eliminato l'avviso lungo in evidenza nella sezione Scrivi.
- Aggiunto il pulsante `?` accanto al titolo: apre una modale con informazioni su sovrascrittura, supporto NDEF e precauzioni.
- Autorizzazione alla sovrascrittura conservata con etichetta compatta.
- Unico contatore byte (massimo 250) e istruzioni duplicate rimosse.
- Nessuna modifica ai driver PC/SC, NDEF, MIFARE Classic 1K e allo storico.

## Pubblicazione
1. Caricare tutto il contenuto dello ZIP nella radice del repository, inclusa `.github/`.
2. Usare **Actions → Compila EXE portable Windows → Run workflow**.
3. Scaricare l'artefatto `NFC-Reader-Portable-Windows-x64`, estrarre `NFC-Reader-Portable-1.8.4-x64.exe` e allegarlo alla release tag `v1.8.4`.
4. Il workflow Pages aggiorna la versione web separatamente.

## Collaudo
Test automatici per PWA, packaging e protocolli, più controlli visivi browser simulati. La compilazione EXE e la verifica con un lettore NFC reale vanno eseguite su Windows.
