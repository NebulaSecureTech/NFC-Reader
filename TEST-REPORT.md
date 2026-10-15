# Verifiche della versione 1.2.0

Data: 14 ottobre 2026. Revisione eseguita nel contenitore di sviluppo, non su smartphone fisico.

## Esito automatico

**32 test unitari superati, 0 fallimenti.** Runtime Node.js 22.16.0. Coprono parsing NDEF/UTF-16, UID, gestione payload anonimi, ripristino, collisioni di ID, esportazioni con/senza progressivo, protezione CSV da formule, pattern audio, assenza di AudioContext, volume zero, manifest e logica del service worker con cache simulata.

**23 scenari browser superati, nessun errore JavaScript rilevato durante le prove.** Motore Chromium 144.0.7559.96. Interfaccia Vue, DOM e CSS effettivi; API NFC, archiviazione, audio, download, vibrazione e wake lock simulate per riprodurre eventi ed errori in modo controllato.

Le verifiche browser includono scansione continua, doppioni con filtro attivo/disattivo, soppressione degli eventi ravvicinati, errori NDEF, permesso negato, eventi tardivi dopo Stop/Annulla, passaggio di tab, preferenze, export anche con ricerca attiva, dettaglio e cancellazioni, archivio corrotto, memoria piena, ripristino dopo un errore transitorio, cambio scheda, visibilità e focus nei menu.

**Layout verificato in 12 viewport:** 320x568, 360x640, 360x740, 375x667, 390x844, 412x915, 430x932, 768x1024, 1280x800, 667x375, 844x390 e 568x320. Sono stati controllati stato iniziale, tag acquisito ed errore, assenza di scroll della pagina e sovrapposizioni tra indicatore, testo, riepilogo, comandi e navigazione. Lo Storico è stato verificato con 120 elementi; il limite applicativo con 5.000 elementi.

I test non sono un audit di sicurezza o una certificazione di produzione. In particolare il test della cache è una simulazione della logica del service worker, non una prova completa della PWA installata.

## Collaudo da eseguire prima dell'uso operativo

1. Pubblica l'intero ZIP su HTTPS, aprilo nel Chrome Android destinato all'uso e verifica la versione nelle impostazioni.
2. Autorizza NFC e acquisisci almeno 10 tag NDEF consecutivi. Verifica UID, numero di righe, ordine e persistenza dopo riapertura.
3. Rileggi un tag dopo averlo allontanato per oltre un secondo. Verifica esito ambra, suono di doppione e riga non aggiunta. Ripeti disattivando il filtro.
4. Prova i tre segnali dalle impostazioni, verifica il volume multimediale del telefono e riproduci una lettura non riuscita, quando il dispositivo genera l'evento relativo.
5. Nello Storico genera CSV e TXT con e senza progressivo, apri i file scaricati e controlla valori, sequenza ed eventuali zeri iniziali durante l'importazione in altri programmi.
6. Verifica Stop, passaggio in background, riapertura, schermo acceso e le eventuali limitazioni del risparmio energetico.
7. Installa la PWA, attendi il caricamento online completo, chiudila e riaprila senza connessione per verificare l'interfaccia offline.
8. Su una copia del sito verifica l'aggiornamento dalla 1.1.0, mantenendo alcuni tag di prova, e l'avviso di nuova versione. Non cancellare i dati del sito per forzare la cache.

NFC fisico, resa acustica sul telefono, installazione Android, comportamento offline reale e migrazione del service worker precedente non sono stati verificati su hardware in questa sessione.
