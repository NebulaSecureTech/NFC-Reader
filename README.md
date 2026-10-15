# NFC Reader 1.2.0

Web app statica Vue, mobile-first, senza account, backend, CDN o compilazione. Tutte le risorse sono incluse nel pacchetto; non ci sono font da scaricare. Interfaccia in stile Material Design.

## Pubblicazione e aggiornamento

Estrai lo ZIP **GitHub-Pages** e carica tutto il contenuto nella radice del repository, non dentro una nuova cartella. I file essenziali sono `index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll` e `assets/`.

Su GitHub apri **Settings > Pages > Build and deployment**, scegli **Deploy from a branch**, il branch `main` e la cartella `/(root)`, poi salva. Tutti i percorsi sono relativi: non devi impostare il nome del repository nel codice. Se usi un dominio personalizzato, conserva l'eventuale file `CNAME` e la configurazione del tuo repository.

Per aggiornare dalla 1.1.0:

1. Esporta una copia delle letture prima di sostituire i file.
2. Sostituisci **l'intero pacchetto**, non soltanto `index.html`.
3. Riapri il sito online. Se appare **Aggiorna**, ferma la scansione e premi il comando. In alternativa chiudi tutte le schede del sito e la PWA, poi riaprila.
4. Nelle impostazioni verifica che il numero di versione sia **1.2.0**.

Non cancellare i dati del sito per forzare l'aggiornamento: contengono lo storico. Le chiavi di archivio e preferenze sono compatibili con le versioni precedenti. La conservazione richiede lo stesso browser/profilo e la stessa origine (protocollo, dominio e porta); cambiando dominio i dati non si trasferiscono automaticamente. Le vecchie letture anonime prive di UID non contengono l'identità NDEF completa e possono essere riconosciute come nuove alla prima rilettura dopo l'aggiornamento.

## Due schermate, niente scorrimento della pagina

**Lettore** contiene stato NFC, indicatore di scansione, totale dei tag, contatori di doppioni/errori, ultimo esito e un solo pulsante Avvia/Ferma. Il layout segue l'altezza visibile del telefono. In orizzontale indicatore e controlli si affiancano.

**Storico** contiene ricerca, dettaglio del tag, copia UID, eliminazione con conferma e download. Scorre soltanto l'elenco: ricerca, esportazione e navigazione restano fuori dall'area scorrevole. L'elenco carica 50 righe per volta. Cambiare tab o aprire le impostazioni non interrompe NFC. La cancellazione richiede conferma e ferma la scansione.

Il totale dei tag è persistente. Doppioni ed Errori contano gli eventi dalla corrente apertura dell'app e si azzerano anche svuotando lo storico. Ferma/Avvia non azzera questi contatori.

## Scansione e suoni

Premi **Avvia scansione** e concedi l'autorizzazione NFC. Avvicina un tag dopo l'altro senza riavviare la scansione. Premi **Ferma scansione** per terminare.

| Evento | Segnale | Comportamento |
| --- | --- | --- |
| Nuova lettura salvata | Due note brevi ascendenti | Aggiunge il tag, esito verde. |
| Doppione | Due beep uguali | Esito ambra. Con filtro attivo non aggiunge una riga; con filtro disattivato salva una nuova lettura ma mantiene il suono di doppione. |
| Errore NFC o di salvataggio | Due note più basse discendenti | Esito rosso. Un tag non leggibile non interrompe la sessione; errori di avvio, limite archivio e salvataggio fallito la fermano. |

Gli eventi ripetuti dello stesso tag vengono ignorati finché non trascorre almeno un secondo senza un altro evento di quel tag. Questo riduce i beep ripetuti quando lo tieni appoggiato. Web NFC non fornisce un evento affidabile di rimozione: non è possibile distinguere ogni rimozione/riappoggio ravvicinato. Tag diversi in sequenza non sono bloccati da questo intervallo.

Il riconoscimento dei doppioni usa l'UID normalizzato, quando presente. Senza UID confronta i byte NDEF e i metadati completi, non la sola anteprima. Due tag fisici distinti con identico contenuto NDEF non sono distinguibili senza UID.

## Impostazioni

L'ingranaggio apre un menu compatto con due sezioni.

**Lettura:** suono di conferma, suoni di avviso, volume, pulsanti di prova per tutti e tre i segnali, vibrazione, filtro doppioni, richiesta di schermo acceso durante la scansione.

**App:** tema Sistema/Chiaro/Scuro, installazione quando proposta dal browser, stato della cache offline, requisiti e versione.

Le opzioni vengono memorizzate. I pulsanti di prova riproducono il segnale al volume scelto anche se il relativo interruttore è disattivato. Il volume dell'app non sostituisce quello multimediale del telefono. Audio, vibrazione e blocco dello spegnimento dipendono dalle funzioni e dalle restrizioni del dispositivo; il risparmio energetico può impedire il mantenimento dello schermo acceso. L'app segnala quando la richiesta di schermo acceso non riesce.

## Esportazioni

L'opzione **Con progressivo** nello Storico vale sia per CSV sia per TXT. Viene salvata come preferenza.

- **CSV:** UTF-8 con BOM, separatore `;`, campi tra virgolette. Colonne Numero (opzionale), UID, Contenuto NDEF e Data e ora. Il testo che potrebbe essere interpretato come formula viene neutralizzato con un apostrofo iniziale.
- **TXT:** un UID per riga, preceduto da `1.`, `2.`, ecc. solo se richiesto. Senza UID include l'avviso `[UID non disponibile]` e l'anteprima del contenuto.

Si esportano **tutti i tag**, anche durante una ricerca, in ordine di acquisizione. Il progressivo viene ricalcolato da 1 nell'elenco corrente. La visualizzazione nello Storico, invece, va dal più recente al più vecchio. Il contenuto testuale NDEF conservato ed esportato è un'anteprima di massimo 600 caratteri; non è un backup integrale del tag. I record binari vengono descritti per tipo. I dati del tag non sono eseguiti e gli URL non vengono aperti automaticamente.

## Archivio e protezione dei dati

Il limite applicativo è 5.000 letture; lo spazio disponibile può esaurirsi prima, soprattutto per tag anonimi con grandi payload. Per tag senza UID il confronto completo è limitato a 64 KB e 64 record per evento.

Se un salvataggio fallisce, il tag appena acquisito resta in memoria, la scansione si ferma, compare un avviso persistente e viene riprodotto il segnale di errore, non quello di successo. Puoi esportare lo storico o riprovare il salvataggio. **Non chiudere l'app mentre compare l'avviso di modifiche solo in memoria.** Il tentativo di avvisare alla chiusura non è una garanzia sui telefoni.

Un archivio danneggiato non viene sovrascritto automaticamente: prima viene richiesta una copia originale scaricabile, poi puoi ripristinare le letture recuperabili. Le modifiche all'archivio provenienti da un'altra scheda fermano NFC. Usa una sola sessione operativa: questo archivio locale non è un database multiutente e non promette scritture concorrenti transazionali.

L'app non invia i tag a server o servizi esterni. Il sito statico è comunque servito dal tuo hosting. Browser, dispositivo e relative copie esportate restano sotto la tua gestione. LocalStorage non è un backup: cancellazione dei dati, profili diversi, navigazione privata o perdita del dispositivo possono rendere indisponibile lo storico. Esporta periodicamente e proteggi il telefono se raccogli identificativi sensibili.

## PWA e compatibilità

La lettura richiede un browser con **Web NFC**, in pratica Chrome su Android con NFC attivo e sito HTTPS. I tag devono supportare NDEF. Non è un'interfaccia universale per tessere protette, protocolli NFC a basso livello, lettori USB desktop o emulazione di carte. L'UID può non essere disponibile.

La pagina deve restare visibile e il telefono sbloccato. In background o con schermo spento le letture vengono sospese dal browser. L'installazione PWA non estende queste capacità.

Il service worker prevede l'interfaccia offline dopo un caricamento online completo. La cache è separata per percorso di installazione e versione. HTML e asset sono versionati insieme; un aggiornamento non viene attivato automaticamente nel mezzo di una scansione. Attivazione reale, aggiornamento dalla versione precedente e uso offline vanno verificati sul telefono prima dell'impiego operativo.

## Struttura

```text
index.html                 Interfaccia Vue e simboli SVG
manifest.webmanifest       Metadati di installazione
sw.js                      Cache e aggiornamenti
.nojekyll                  Pubblicazione statica
assets/
  css/style.css            Layout, temi e responsive
  js/app.mjs               UI, NFC, archivio, preferenze e PWA
  js/core.mjs              Parsing, identità NDEF, CSV/TXT
  js/sound.mjs             Tre segnali sintetizzati sul dispositivo
  vendor/                  Vue 3.5.13 locale e licenza MIT
  icons/                   Icone PWA e favicon
README.md
CHANGELOG.md
TEST-REPORT.md
```

Lo ZIP **Sorgenti** contiene gli stessi file e `tests/`. Non occorre una build per nessuno dei due pacchetti. Per modifiche future, aggiorna coerentemente la versione in HTML, import JS, `app.mjs` e `sw.js`.

## Test ripetibili (solo ZIP Sorgenti)

Test unitari, con Node.js 18 o successivo:

```sh
node --test tests/core.test.mjs tests/sound.test.mjs tests/pwa.test.mjs
```

Test UI senza rete, con Python e Playwright:

```sh
pip install playwright
playwright install chromium
python tests/browser_smoke.py
```

Il test UI usa Vue, DOM e CSS reali, ma simula le API della piattaforma. Non certifica la lettura hardware o la PWA installata. `CHROMIUM_PATH` permette di selezionare un Chromium già installato. Il resoconto e le immagini vengono generati in `qa-output/`.

Per un'anteprima locale manuale puoi servire la cartella con `python -m http.server 8080`. Non aprire `index.html` tramite doppio clic: i moduli JavaScript richiedono un contesto web. Un PC può mostrare interfaccia e storico, ma non diventa un lettore NFC per questo motivo.

## Documentazione della piattaforma

- [Web NFC e relative limitazioni](https://developer.chrome.com/docs/capabilities/nfc)
- [Ciclo di vita del service worker](https://web.dev/articles/service-worker-lifecycle)
- [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [AudioContext e ripresa audio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)
- [Configurazione GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
