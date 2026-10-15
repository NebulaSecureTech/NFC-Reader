# NFC Reader 1.8.0 · PWA e Windows Portable

**Un solo repository GitHub, un solo frontend Vue 3, due modi di usarlo.**

- **GitHub Pages:** app statica/PWA per smartphone Android con Web NFC. Nessun server o build.
- **Windows:** app Electron con **layout desktop** e lettori NFC USB PC/SC, in **un unico `.exe` portable** (nessun installer, nessuna cartella da distribuire).
- **Nessun addon Node nativo:** eliminati `pcsc-mini`, `@pcsc-mini/*` e `nfc-pcsc`. Lettura PC/SC tramite API WinSCard di Windows e piccolo helper C# compilato durante la build. Non servono Python, node-gyp o Visual Studio Build Tools.
- **Icona trasparente:** icone 192/512 PNG e Windows ICO senza sfondo chiaro esterno. L'icona PWA *maskable* conserva il proprio colore pieno per i launcher Android.

## Pubblica sul repository GitHub

1. Estrai lo ZIP e caricane il **contenuto** direttamente nel repository, compresi `.github/`, `.nojekyll` e `electron/`.
2. **Settings → Pages → Source: GitHub Actions**. La workflow `Pubblica NFC Reader web` pubblica la PWA.
3. **Actions → Compila EXE portable Windows → Run workflow**.
4. Apri la run completata → **Artifacts** → scarica `NFC-Reader-Portable-Windows-x64`.
5. Estrai dall'artefatto il **solo file** `NFC-Reader-Portable-1.8.0-x64.exe` e allegalo in **Releases → Draft a new release**, tag `v1.8.0`.

**Non servono Python né Node.js sul PC che esegue l'EXE portable.** La build avviene con Node.js e il compilatore C# Windows del runner GitHub. L'EXE portable contiene Electron, la pagina Vue e il piccolo helper: all'avvio li estrae automaticamente in una directory temporanea. Non occorre installare DLL o file accanto all'EXE. Il driver PC/SC del lettore e il servizio Smart Card di Windows devono comunque essere disponibili.

## Compila localmente su Windows (opzionale)

Richiede Windows 10/11 x64, Node.js 22 + npm, accesso a Internet per scaricare Electron. **Non richiede Python né tool C++.**

Doppio clic su `electron/build-win.bat`. Oppure, in PowerShell:

```powershell
cd electron
npm run bridge:build
npm install --no-audit --no-fund
npm test
npm run dist:win
```

Il risultato si trova in `electron/dist/NFC-Reader-Portable-1.8.0-x64.exe`.

Se `npm run bridge:build` non funziona perché il comando non è disponibile prima di `npm install`, usa quest'ordine:

```powershell
cd electron
powershell.exe -NoProfile -ExecutionPolicy Bypass -File bridge/build.ps1
npm install --no-audit --no-fund
npm run dist:win
```

## PC/SC Windows: come funziona

L'app desktop apre la **stessa pagina HTML/CSS/Vue di GitHub Pages**, tramite protocollo locale sicuro `nfc-app://`. I comandi hardware passano da un IPC ristretto a `WinScardBridge` nel processo principale Electron. Il bridge avvia `NfcPcscBridge.exe` che usa esclusivamente `WinSCard.dll` già presente in Windows.

Il mini programma PC/SC interno non usa componenti aggiuntivi. Rileva i lettori collegati, riconosce inserimento/rimozione di tag, trasmette gli APDU `FF CA` (UID), `FF B0` (lettura Type 2) e `FF D6` (scrittura Type 2) tramite PC/SC. L'app mantiene i controlli NDEF e la verifica dopo scrittura. Le richieste sono associate al lettore e alla singola presentazione del tag, per evitare operazioni su un tag rimosso/sostituito.

**Compatibilità hardware:** la lettura UID funziona sui lettori che espongono il comando PC/SC `FF CA`; i record NDEF Type 2 richiedono il supporto di lettura delle pagine `FF B0`. La scrittura è **abilitata soltanto su ACS ACR122U compatibile** e su tag Type 2 con capability container valida, non protetti, formattati in modo riconoscibile e con capienza sufficiente. La modalità scrittura richiede un nuovo avvicinamento del tag dopo l'attivazione. Le tessere HID tastiera/USB (non PC/SC) non sono gestite.

Prima di provare il lettore: collega il lettore USB, verifica che Windows lo riconosca tra i dispositivi Smart Card e che il servizio `SCardSvr` sia in esecuzione quando necessario (in Windows spesso parte su richiesta). In caso di errore, la pagina mostra la causa, senza interrompere la versione web.

**Limitazioni:** Electron/PCSC deve poter avviare l'helper interno. Restrizioni antivirus, Application Control o policy aziendali potrebbero impedirlo. L'EXE non è firmato digitalmente e SmartScreen può mostrare un avviso. Il contenuto viene salvato nel profilo locale Electron anche usando la versione portable: portable indica assenza di installazione, **non** una modalità dati su chiavetta automatica. Sul browser lo storico resta separato; esporta CSV/TXT per conservarlo.

## La UI e i dati

Sono disponibili: lettura singola/continua, lettura e scrittura NDEF Testo/URL, notifica sonora per tag/doppione/errore, vibrazione se supportata, storico, dettagli con record in accordion, ricerca, condivisione e CSV/TXT con progressivo opzionale. Layout a due colonne su desktop e tre tab sul telefono. Le scansioni NFC vere sul browser richiedono Android Chrome e HTTPS, e supportano solo Web NFC/NDEF.

## Struttura

```text
NFC-Reader/
├── index.html                        # Stessa UI Vue su sito ed Electron
├── assets/                          # CSS, JS, Vue locale, icone (PNG/ICO)
├── sw.js, manifest.webmanifest      # PWA e cache offline
├── electron/
│   ├── main.cjs, preload.cjs        # Electron + IPC sicuro
│   ├── pcsc-manager.cjs             # Scansioni/stato/scrittura
│   ├── pcsc-apdu.cjs, ndef.cjs      # APDU e codec Type 2
│   ├── winscard-bridge.cjs          # Trasporto Node -> Windows
│   ├── bridge/
│   │   ├── NfcPcscBridge.cs         # WinSCard nativo Windows, no npm addon
│   │   └── build.ps1                # Compila l'helper su Windows
│   ├── package.json, build-win.bat
│   └── tests/
├── tests/                           # Test logica Web/PWA
├── .github/workflows/
│   ├── pages.yml                    # Pubblica il sito
│   └── build-windows.yml           # Produce unico EXE portable
├── docs/RELEASE-v1.8.0.md
├── CHANGELOG.md
└── README.md
```

La cartella `electron/bin/` è **generata durante la build** e viene incorporata nel portable, non deve essere caricata nel repository.

## Prove e limiti del rilascio

I test JavaScript sono automatici e non richiedono un lettore fisico. La workflow Windows compila il codice C# e prepara l'EXE. **La compilazione Windows reale e il test USB fisico non sono stati eseguiti in questo ambiente**: vanno verificati sulla tua GitHub Actions e con il tuo modello di lettore prima di considerare questa versione collaudata per la produzione. I test non dimostrano che un particolare lettore supporti la scrittura.

Nessuna dipendenza esterna viene caricata dalla PWA dopo il primo caricamento. Le letture non sono inviate a un server.
