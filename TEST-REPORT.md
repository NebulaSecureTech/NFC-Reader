# NFC Reader v1.8.3 — Verifiche

## Test automatici eseguiti

- **39 / 39 Web/PWA**: parsing NDEF, esportazione, suoni, cache offline, default Lettura multipla disattivata, codice per aggiornamento dello stesso UID.
- **47 / 47 Electron/PC/SC**: codec NDEF, lettura e scrittura Type 2, MIFARE Classic 1K, autenticazione, MAD/CRC, GPB, blocco dei formati non standard, readback con confronto del contenuto, test di una nuova presentazione, validazione del pacchetto e protezione EPIPE.
- **Totale 86 / 86 test superati** con Node.js 22.
- Verificati sintatticamente `assets/js/app.mjs`, `electron/main.cjs`, `electron/ndef.cjs`, `electron/mifare-classic.cjs`.

## Vincoli della verifica

- I test hardware utilizzano **lettori simulati**. Il codice non è stato ancora provato sul tuo ACS ACR122 reale.
- In questa sessione il browser di verifica ha bloccato anche le pagine locali, perciò la nuova resa visiva desktop/mobile **non è certificata da screenshot browser**; sono stati aggiornati i vincoli CSS e della finestra.
- La creazione effettiva dell'EXE richiede GitHub Actions su Windows. L'eseguibile non è incluso nel repository.
- I reader MIFARE Classic non garantiscono che applicazioni terze sappiano interpretare NDEF anche se questa app rilegge correttamente la memoria.

## Per il collaudo fisico

1. Inserisci una MIFARE Classic 1K **personale, già NDEF**; prova a leggerla con un UID e controlla i dettagli.
2. Da Scrivi, scrivi un breve testo di test, attendi la **verifica del record decodificato** e la notifica di esito.
3. Allontana completamente la tessera e riavvicinala in Lettore: verifica che il testo sia presente nel dettaglio e nello Storico.
4. Se un'app terza non legge, controlla il **GPB/MAD** segnalato dal dettaglio; la formattazione NDEF può non essere riconosciuta da quell'app.
5. Verifica lettura multipla ON/OFF e finestra Windows su un monitor a risoluzione 1366×768 o superiore.
