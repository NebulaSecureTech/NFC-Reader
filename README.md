# NFC Reader - Vue 3, statico, Material Design

Lettore NFC continuo per GitHub Pages. Non richiede backend, npm, Vite o database.
Tutto l'elenco dei tag viene salvato nel browser (localStorage), senza inviare
UID o contenuti NFC a un server.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub (per esempio `nfc-reader`).
2. Carica nella radice del repository i file di questa cartella:
   `index.html`, `app.mjs`, `core.mjs`, `styles.css`, `favicon.svg`, `.nojekyll`.
   Puoi caricare anche il README e la cartella `tests`.
3. Vai in **Settings > Pages**.
4. Imposta **Source: Deploy from a branch**, branch **main**, cartella **/(root)**.
5. Salva e apri `https://TUO-USERNAME.github.io/nfc-reader/`.

Non serve configurare il nome del repository: tutti i collegamenti sono relativi.

## Come si usa

- Apri il sito su **Google Chrome per Android**, con NFC attivo.
- Premi **Avvia scansione** e accetta il permesso NFC.
- Avvicina un tag NFC alla zona NFC del telefono.
- Avvicina i tag successivi: la scansione non si ferma dopo il primo.
- Attiva o disattiva **Ignora duplicati**.
- Scegli **Numero progressivo** e scarica CSV oppure TXT.
- Il contenuto rimane sul dispositivo anche dopo un aggiornamento della pagina.

### File di esportazione

- **CSV** UTF-8 con BOM e separatore `;` compatibile con Excel italiano.
  Colonne: Numero (opzionale), UID, Contenuto NDEF, Data e ora.
- **TXT** con un UID per riga (oppure `1. UID`, `2. UID`, ...).
  Se il browser non fornisce l'UID viene esportato il contenuto NDEF come fallback.
- Si esporta sempre **l'intero elenco** nell'ordine in cui e' stato acquisito,
  anche se e' attivo un filtro di ricerca.
- Nessuna dipendenza da server per le operazioni NFC o l'esportazione.

## Requisiti e limiti

- Web NFC e' supportato soprattutto da Chrome su Android, non dal normale
  browser desktop e non da Safari su iPhone.
- Richiede **HTTPS** (GitHub Pages lo fornisce), NFC attivo, browser in primo
  piano e autorizzazione esplicita al primo utilizzo.
- Web NFC non e' un driver per lettori NFC USB e non legge tutti i protocolli
  / tag proprietari. I tag devono essere compatibili **NDEF**.
- `event.serialNumber` puo' essere vuoto: in quel caso e' comunque possibile
  acquisire il contenuto NDEF (se presente).
- L'elenco e' specifico per browser, dispositivo e dominio. Cancellare i dati
  del sito o usare un altro browser puo' eliminarlo.
- Massimo 5000 righe per limitare l'uso di localStorage.
- Per ridurre letture ripetute involontarie esiste una finestra anti-rimbalzo
  di 1,4 secondi. Se disabiliti il filtro duplicati, puoi riavvicinare un tag
  dopo questo intervallo per registrarne una nuova lettura.
- **La libreria Vue 3 e' caricata da un CDN**. Serve Internet per il primo
  caricamento (o una copia gia' in cache); i dati NFC non vengono inviati al CDN.
  Se desideri eliminare anche questa richiesta esterna, puoi scaricare la
  distribuzione Vue `vue.global.prod.js` e aggiornare il percorso dello script
  in `index.html`.

## Sviluppo locale

Avvia un qualsiasi server HTTP statico nella cartella, ad esempio:

```bash
python -m http.server 8000
```

Apri `http://localhost:8000` su PC per provare l'interfaccia (ma non NFC).
Per leggere realmente NFC, pubblica su HTTPS e apri Chrome da Android.

## Test

Le funzioni di lettura e generazione file sono in `core.mjs`.

```bash
node --test tests/core.test.mjs
```

## Licenza

Progetto demo personalizzabile. Vue 3 e' distribuito separatamente sotto
licenza MIT: https://github.com/vuejs/core/blob/main/LICENSE
