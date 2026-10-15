# NFC Reader v1.4.0

Web app **Vue 3, mobile-first, Material Design**, installabile come PWA e pubblicabile su GitHub Pages. Non richiede backend, account, build o servizi esterni. Tutti gli asset, comprese icone e Vue, sono in locale.

## Novita della 1.4.0

- **Condividi in alto nello Storico:** unico pulsante nell'intestazione, accanto al titolo. La vecchia barra inferiore e' stata rimossa per lasciare piu' spazio alla lista. Il pulsante **Svuota** resta separato e richiede conferma.
- **Una modale per esportare e condividere:** scegli **CSV** o **TXT**, attiva/disattiva **Numero progressivo**, poi premi **Scarica** oppure **Condividi**. La scelta si applica all'intero storico, anche durante una ricerca.
- **Record NDEF in accordion:** nella scheda dettaglio vengono mostrati subito UID, data/ora, contenuto leggibile e riepilogo. I **Record e dati tecnici** sono raggruppati in un accordion nativo, **chiuso per impostazione predefinita** ogni volta che apri un tag, con i record HEX disponibili all'interno.
- Restano operative **lettura singola e continua**, suoni di conferma/doppione/errore, dettagli da Lettore e Storico, condivisione di un singolo tag, memoria locale e PWA offline.

## Pubblicazione su GitHub Pages

1. Estrai lo ZIP `NFC-Reader-PWA-GitHub-Pages-v1.4.0.zip`.
2. Carica **il contenuto** dello ZIP nella radice del repository GitHub: `index.html`, `assets/`, `.nojekyll`, `manifest.webmanifest`, `sw.js` e i documenti.
3. In **Settings > Pages > Build and deployment** scegli **Deploy from a branch**, `main`, `/(root)` e salva.
4. Apri l'indirizzo HTTPS del sito con **Chrome su Android**, NFC attivo.
5. Facoltativo: dal menu del browser scegli **Installa app** / **Aggiungi alla schermata Home**.

Percorsi relativi: non serve modificare il nome del repository. Non serve `npm install` o `npm run build`.

### Aggiornamento dalla v1.2.0 o v1.3.0

1. **Esporta lo storico** prima dell'aggiornamento.
2. Sostituisci **tutti** i file del sito con quelli della v1.4.0. Conserva l'eventuale `CNAME` del repository.
3. Apri il sito online; se compare l'avviso di aggiornamento, ferma NFC e premi **Aggiorna**. Verifica nelle impostazioni il numero **v1.4.0**.
4. Non eliminare i dati del sito per aggiornare: eliminerebbe lo storico. Mantieni la stessa origine HTTPS e lo stesso profilo/browser: passando a un altro dominio lo storico locale non segue automaticamente.

## Uso e schermate

**Lettore** (pagina senza scroll) mostra stato NFC, ultimo esito, contatori e Avvia/Ferma. Tocca l'ultimo tag o il contatore **Tag salvati** per aprirne il dettaglio. Il contatore apre sempre l'ultimo tag **salvato**; la scheda ultimo esito puo aprire anche un doppione **non salvato** appena letto.

**Storico** mostra ricerca e righe dei tag (toccabili). Il pulsante **Condividi**, in alto accanto al titolo, apre la modale **Esporta e condividi**. Li' scegli il formato CSV/TXT, il progressivo e se **Scaricare** o **Condividere**. Lo storico scorre in modo indipendente; non esiste piu' alcuna barra di esportazione in basso. La scansione continua non si ferma cambiando tab.

**Impostazioni > Lettura**: switch **Lettura singola**, suoni lettura/doppione/errore, volume, prove audio, vibrazione, filtro doppioni e richiesta di schermo acceso. Per cambiare modalita' ferma prima una scansione attiva.

**Impostazioni > App**: tema automatico/chiaro/scuro, installazione, cache e requisiti.

### Singola o continua

- **Continua (default)**: un tocco su Avvia; i tag si raccolgono in sequenza fino a Ferma o alla chiusura/sospensione della pagina. I doppioni sono riconosciuti e ignorati per default, ma sono segnalati con un suono distinto.
- **Singola**: un tocco su Avvia; il primo tag NFC valido ferma la lettura, salva se necessario e apre i dati NDEF. Chiusa la scheda, premi nuovamente Avvia per leggere un altro tag. Su doppione ignorato mostra i dati **della lettura corrente**, senza creare una seconda riga.
- Un evento NFC non valido produce un errore, ma in modalita' singola rimane possibile avvicinare un tag leggibile. Eventi tardivi dopo Stop sono ignorati.
- Anti-rimbalzo di 1 secondo quando lo stesso tag resta davanti al telefono. Senza UID, i doppioni vengono individuati dal payload NDEF (due tag identici possono risultare un unico tag).

### Dettagli tecnici: limiti reali

Nel dettaglio tag, tocca **Record e dati tecnici** per aprire l'accordion (inizialmente chiuso) con i singoli record, MIME, ID e payload HEX quando disponibili.

La Web NFC API espone **UID quando disponibile** e record **NDEF** con i relativi metadati, non il protocollo fisico del tag, la capacita' di memoria totale, la tecnologia specifica, eventuali blocchi protetti o i contenuti fuori da NDEF. Non vengono inventati valori non esposti dalla piattaforma.

L'app conserva i record NDEF (testo decodificato e payload HEX) in locale per poterli consultare in futuro. Limiti applicativi: 64 record e 64 KB complessivi per lettura, 5.000 letture nello Storico; la quota reale del browser puo' esaurirsi prima. Nell'anteprima della lista, il testo e' ridotto a 600 caratteri; il dettaglio conserva il payload HEX entro i limiti suddetti e il testo decodificato fino a 16.384 caratteri per record. I record binari non vengono interpretati arbitrariamente; i dati non sono eseguiti ne' gli URL aperti automaticamente.

I record inseriti prima della v1.3 non includono il payload HEX. Se ti servono quei dati, rileggi il tag. Se un tag esistente viene ignorato come doppione, usa momentaneamente la modalita' singola per visualizzarne i dati NDEF aggiornati o esporta prima lo storico e poi elimina quel tag dal registro.

## Esportazione e condivisione

- CSV: UTF-8 con BOM, separatore `;`, colonne Numero (opzionale), UID, anteprima NDEF e data/ora. Celle sensibili protette dall'interpretazione come formula nei fogli di calcolo.
- TXT: un UID per riga (o descrizione NDEF se UID assente), con/senza progressivo.
- **Storico > Condividi**: si apre un'unica modale. Seleziona CSV o TXT e l'eventuale progressivo; premi **Scarica** per ottenere il file o **Condividi** per il pannello nativo del telefono (file se supportato, testo per esportazioni brevi, altrimenti download dello stesso formato). Condividere e' una **azione esplicita dell'utente**.
- **Condividi singolo tag**: testo con i dati NDEF principali. I payload HEX molto lunghi sono abbreviati nel testo condiviso; nell'app il dettaglio puo' mostrarli per intero. Senza Web Share: appunti o TXT scaricato.

Le esportazioni riguardano l'intero registro, anche se la ricerca filtra la lista visibile. La numerazione e' ricalcolata nel file. Condividi/Esporta non inviano dati da soli: bisogna premere il pulsante.

## Dati locali e resilienza

Le letture e le preferenze sono in `localStorage` con le **stesse chiavi delle versioni precedenti**. Non esiste backend. Se la scrittura fallisce, la scansione si ferma, il tag resta temporaneamente in memoria e compare un avviso persistente per esportare/riprovare. Non chiudere o ricaricare mentre vedi quell'avviso: potresti perdere le letture non scritte su disco.

L'archivio danneggiato non viene sovrascritto automaticamente. Modifiche arrivate da altre schede interrompono la scansione. Usa una sola sessione operativa e salva periodicamente un CSV/TXT. Le copie condivise possono contenere UID e altri dati del tag: scegli con attenzione i destinatari.

## Limiti del dispositivo

- NFC sul web: principalmente **Chrome su Android** con NFC attivo, pagina **HTTPS** e tag **NDEF**.
- La scansione richiede app visibile e schermo sbloccato. Con schermo spento/in background la piattaforma puo' sospendere l'accesso NFC. L'opzione Schermo acceso usa Wake Lock solo se disponibile.
- NFC a basso livello, badge aziendali protetti, tessere MIFARE Classic non NDEF e lettori USB desktop non sono letti tramite questa API.
- La PWA puo' caricare l'interfaccia offline dopo il primo accesso corretto, ma non estende le capacita' hardware del browser.

## Cartelle

```text
index.html                 Interfaccia Vue
manifest.webmanifest       PWA installabile
sw.js                      Cache/versionamento
.nojekyll                  GitHub Pages
assets/
  css/style.css            Material Design / responsive
  js/app.mjs               UI, NFC, storico, condivisione, preferenze
  js/core.mjs              Record NDEF, UID e formati CSV/TXT
  js/sound.mjs             Conferma, doppione, errore
  vendor/                  Vue locale con licenza MIT
  icons/                   Icone PWA
README.md
CHANGELOG.md
TEST-REPORT.md
```

Il pacchetto **Sorgenti** contiene anche `tests/`. Non e' previsto alcun processo di build.

## Test

Per gli unit test serve Node.js:

```sh
node --test tests/*.test.mjs
```

Per i test UI simulati (browser Chromium e Playwright):

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser_smoke.py
```

I test verificano l'interfaccia e simulano Web NFC, suoni, file e Web Share. **Non sostituiscono il collaudo su un telefono Android con tag fisici e condivisione reale**. Il report e' in `TEST-REPORT.md`.

## Riferimenti API

- Web NFC: https://developer.chrome.com/docs/capabilities/nfc
- NDEFRecord: https://developer.mozilla.org/en-US/docs/Web/API/NDEFRecord
- Web Share API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
