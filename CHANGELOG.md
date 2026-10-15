# Changelog

## 1.2.0 - 14 ottobre 2026

- Lettore a schermata fissa e tab Storico separato. Solo elenco e contenuto dei menu sono scorrevoli.
- Navigazione inferiore persistente, layout per telefoni compatti e disposizione affiancata in orizzontale.
- Esiti visivi e suoni distinti: nuova lettura, doppione, errore. Volume e pulsanti di prova nel menu.
- Doppioni riconosciuti e segnalati anche quando il filtro di esclusione è disattivato.
- Debounce degli eventi ripetuti; errori NDEF recuperabili senza riavviare NFC.
- Esportazione nello Storico, con progressivo opzionale persistente. Ricerca anche per UID senza separatori.
- Dettaglio del tag, conferma per le eliminazioni, gestione del focus e navigazione da tastiera.
- Salvataggio fallito: stop NFC, nessun falso segnale di successo, lettura mantenuta in memoria per export/riprova.
- Recupero assistito di archivi danneggiati; mantenimento delle chiavi di archiviazione precedenti.
- Identità dei tag anonimi basata sui byte NDEF, non sull'anteprima troncata.
- Cache PWA isolata per percorso, asset versionati e aggiornamenti espliciti, senza riavvio automatico durante la scansione.
- 32 test unitari e 23 scenari UI simulati; controllo del layout su 12 risoluzioni.

## 1.1.0

Base PWA mobile-first, risorse locali, preferenze, archivio ed export CSV/TXT.
