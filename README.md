# NFC Reader · PWA mobile-first (v1.1.0)

Web app statica basata su **Vue 3**, con stile Material Design, pensata prima di tutto per smartphone Android. Legge tag NFC compatibili NDEF in **scansione continua**, conserva l'elenco nel browser ed esporta CSV o TXT. Nessun account, backend, cookie di tracciamento, richiesta a servizi esterni o processo di compilazione.

## Pubblicazione: GitHub Pages

1. Crea un repository GitHub (ad esempio `nfc-reader`).
2. Estrai lo ZIP **GitHub-Pages** e carica il contenuto (non la cartella esterna) nella radice del repository: `index.html`, `sw.js`, `manifest.webmanifest`, `assets/` e `.nojekyll`.
3. Vai a **Settings → Pages → Build and deployment**.
4. Scegli **Deploy from a branch**, branch `main`, cartella `/(root)` e salva.
5. Apri il sito HTTPS indicato da GitHub. Il nome del repository non richiede modifiche: tutti i percorsi sono relativi.
6. Dal menu di Chrome Android seleziona **Installa app** / **Aggiungi a schermata Home**. Dove Chrome offre il prompt diretto, trovi il pulsante nelle impostazioni.

Non serve installare Node.js, Vite o fare `npm run build`: la libreria Vue è già inclusa localmente e il browser esegue tutto direttamente.

## Come si usa

- Apri la PWA in **Chrome su Android**, con **NFC attivo**.
- Tocca **Avvia scansione** e consenti l'accesso, se richiesto.
- Avvicina più tag uno dopo l'altro. La scansione rimane attiva fino a **Ferma scansione** (o alla chiusura della pagina).
- I tag vengono aggiunti all'elenco, con UID quando disponibile, contenuto NDEF e ora.
- Usa la ricerca, la copia UID, l'eliminazione di un singolo tag o la cancellazione di tutti i dati con conferma.
- Premi **CSV** o **TXT** nella barra inferiore per esportare tutto l'elenco (non solo i risultati filtrati).
- Il formato CSV usa UTF-8 con BOM, `;` come separatore per Excel in italiano, e contiene UID, contenuto e data/ora, con colonna **Numero** opzionale. Il TXT esporta gli UID uno per riga, con o senza progressivo. In assenza dell'UID esporta il contenuto leggibile come alternativa.

### Menu impostazioni (⚙)

- **Suono alla lettura**: beep sintetizzato sul telefono per ogni *nuovo tag registrato* (predefinito: attivo). Il browser può limitare l'audio a seconda del dispositivo e del volume.
- **Vibrazione**: vibrazione breve ad ogni registrazione, se supportata (predefinita: attiva).
- **Ignora duplicati**: uno per UID, o per contenuto se UID assente (predefinito: attivo). Anche con il filtro disattivo, un anti-rimbalzo di 1,4 secondi evita raffiche quando il tag rimane appoggiato al telefono.
- **Schermo sempre acceso**: prova a usare la Screen Wake Lock API mentre la scansione è attiva (predefinito: disattivo); non garantito su tutti i dispositivi.
- **Numero progressivo**: aggiunge o rimuove la numerazione da entrambi i formati esportati (predefinito: attivo).
- **Tema**: sistema / chiaro / scuro.
- **Installa app**: collegamento al prompt quando Chrome lo mette a disposizione.

Le impostazioni sono salvate nel browser. Le letture della versione precedente v1.0.0 sono mantenute: vengono usate le stesse chiavi `localStorage`.

## Requisiti e limitazioni

- L'API **Web NFC** non è universalmente disponibile: in pratica serve **Google Chrome su Android**, NFC hardware abilitato e **HTTPS** (fornito da GitHub Pages).
- Web NFC legge **NDEF**, non tutti i tag NFC. Non può leggere a basso livello MIFARE Classic, tessere protette, molti badge aziendali, lettori USB desktop o emulare carte.
- Il campo UID (`event.serialNumber`) può essere assente. Il sito non inventa un UID: salva il contenuto NDEF, quando leggibile.
- La scansione funziona con pagina **visibile** e schermo sbloccato. Le operazioni NFC si sospendono quando il browser passa in background o si spegne il display.
- La PWA può essere aperta **offline dopo il primo caricamento riuscito** grazie al Service Worker. Ma NFC ha comunque bisogno delle autorizzazioni del browser; l'installazione/offline non estende il supporto Web NFC.
- Tag e impostazioni vengono memorizzati solo su quel browser/dispositivo (`localStorage`). Se cancelli i dati del sito potresti perdere le letture; esportale periodicamente. Limite di 5.000 letture salvate.
- La libreria Vue locale è v3.5.13, con licenza MIT. Non vengono scaricati font, icone, audio o script da terze parti.

## Struttura semplice

```
NFC-Reader/
├── index.html                 # Interfaccia Vue e layout
├── manifest.webmanifest       # Installazione PWA
├── sw.js                      # Cache offline
├── .nojekyll                  # Compatibilità GitHub Pages
├── assets/
│   ├── css/style.css          # Material, responsive, temi
│   ├── js/app.mjs             # Vue, lettura NFC, salvataggio, preferenze
│   ├── js/core.mjs            # Parsing NDEF ed esportazioni
│   ├── js/sound.mjs           # Beep con Web Audio API
│   ├── vendor/vue.global.js   # Vue locale (MIT)
│   └── icons/                 # Icone PWA e favicon
└── README.md
```

Nello ZIP **Sorgenti** è inclusa anche `tests/`. Per i test (opzionali) serve Node.js:

```bash
node --test tests/*.test.mjs
```

## Personalizzazione

- Colori, tipografia e dimensioni: `assets/css/style.css`, variabili `:root`.
- Contenuti e pulsanti della web app: `index.html`.
- Logica di scansione, filtri e salvataggio: `assets/js/app.mjs`.
- CSV e TXT: `assets/js/core.mjs`.
- Cambiamenti a file pubblicati: **aggiorna la costante `CACHE` in `sw.js`** per invalidare la cache offline delle versioni precedenti.

## Note tecniche

Nella PWA non esiste un backend, né vengono inviati i dati delle letture all'esterno. I file CSV e TXT vengono generati con un Blob nel browser. L'app conserva un registro cronologico; la visualizzazione è in ordine inverso (più recente in alto), mentre l'esportazione rispetta l'ordine originale.
