# Changelog NFC Reader

## 1.4.0 - 15 ottobre 2026
- Unico pulsante **Condividi** nell'intestazione dello Storico; eliminata la barra di esportazione in basso per liberare spazio verticale.
- Modale per scegliere CSV/TXT, progressivo, download e condivisione nativa con fallback coerente al formato selezionato.
- Record NDEF e dati tecnici ora dentro un accordion nativo chiuso per default; il riepilogo resta visibile senza espandere.
- Mantenimento della v1.3.0 e degli archivi localStorage precedenti; cache PWA aggiornata alla v1.4.0.
- Test browser per modal export, Web Share CSV e TXT, accordion e viewport da 320 px.

## 1.3.0 - 15 ottobre 2026
- Nuovo switch **Lettura singola** persistente, continua come modalita' predefinita.
- Stop automatico e apertura dettagli dopo una lettura singola, compresi i doppioni ignorati.
- Scheda **Dettaglio tag** estesa con UID, data/ora, conteggio e byte NDEF, record types, MIME, ID, lingua, codifica, contenuto decodificato, payload HEX e record annidati ove disponibili.
- Scheda dettagli apribile toccando l'ultimo esito, il contatore Tag salvati o una riga dello storico.
- Condivisione di singolo tag via Web Share con fallback appunti/TXT.
- Condivisione dello Storico via file CSV, con fallback testo o download CSV.
- Conversione dello storico precedente con indicazione esplicita dei metadati non disponibili.
- Correzione riferimenti al dettaglio dopo eliminazione e mantenimento del layout senza scroll.
- Cache PWA/asset versionati e aggiornamenti sicuri.

## 1.2.0 - 14 ottobre 2026
- Due tab Lettore e Storico, con lista a scorrimento indipendente.
- Suoni distinti di conferma, errore e doppione, con anti-rimbalzo.
- Protezione dello storico contro perdita dati e modifiche concorrenti.

## 1.1.0 - 14 ottobre 2026
- PWA mobile-first, Vue 3 locale, impostazioni, lettura continua e temi.

## 1.0.0 - 14 ottobre 2026
- Primo lettore NFC con CSV/TXT e progressivo opzionale.
