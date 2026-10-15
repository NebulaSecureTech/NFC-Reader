# NFC Reader v1.8.4 — GitHub Pages + Electron Portable

Un solo repository con la stessa app Vue: Web NFC (Chrome Android compatibile) e Electron su Windows con lettore NFC USB PC/SC (es. **ACS ACR122U**). Lettura con apertura dettagli predefinita e lettura multipla opzionale, dettagli NDEF, ricerca, storico locale, esportazione CSV/TXT, condivisione, scrittura testo/URL. Nessun server/database. Il rilascio Windows è **un solo `.exe` portable**.

## Novità v1.8.4

**Schermata Scrivi più pulita:** solo tipo di contenuto, campo di testo/URL, dimensione, autorizzazione breve e tasto Scrivi. Un piccolo `?` vicino al titolo apre una modale che spiega compatibilità e precauzioni; non compare più un avviso esteso sulla schermata principale. L'autorizzazione esplicita rimane obbligatoria prima della scrittura.

### Funzionalità mantenute dalla v1.8.3

- **Lettura multipla** nelle Impostazioni è **OFF di default**. Ogni lettura ferma lo scanner e apre il dettaglio. Attivandola lo scanner resta in ascolto per più tag. Il vecchio nome **Lettura singola** scompare.
- Quando un UID già presente viene riletto con NDEF diverso, lo Storico conserva una riga per UID e **aggiorna i dati e il timestamp**; una lettura vuota non distrugge una registrazione con contenuto precedente. Le nuove letture vengono sempre mostrate nel dettaglio.
- **Scrittura NDEF con doppio controllo**: verifica dei blocchi più decodifica NDEF completa del contenuto Testo/URL, con corrispondenza esatta prima della conferma. Dopo aver scritto, rimuovi e riavvicina il tag per verificare la persistenza su una nuova presentazione.
- Per **MIFARE Classic 1K**, diagnostica GPB MAD1 e GPB dei settori NDEF: una struttura non conforme viene **letta per diagnosi**, ma la scrittura è rifiutata in modo conservativo, senza alterare trailer, chiavi o directory MAD. Un `03 00 FE` viene segnalato come **NDEF vuoto**, non come contenuto scritto.
- **Windows portable**: altezza minima 720 px e larghezza minima 1024 px, visualizzazione Lettore stabile senza scrollbar occasionale. Nessuna modifica al design mobile.
- Aggiornati Service Worker, test automatici, versioni dell'EXE e documentazione.

### Perché la card prima risultava vuota?

La v1.8.2 verificava i **byte scritti** ma non confrontava il **messaggio NDEF decodificato** con il valore inserito. Inoltre, con il filtro duplicati attivo, lo Storico poteva mantenere la vecchia lettura dello stesso UID. Ora entrambi i casi sono gestiti. Se anche altri programmi vedono un tag vuoto, verifica la formattazione NDEF della tessera: **scrivere blocchi di memoria non basta a garantire compatibilità NDEF**. Alcuni software e smartphone non supportano MIFARE Classic NDEF, indipendentemente da quanto è stato scritto.

**Non è stato provato un ACS ACR122U reale in questa sessione.** I controlli di protocollo sono simulati: prima della produzione esegui il test fisico di lettura-scrittura-rilettura su un tag personale di prova.

## Un unico ZIP da caricare su GitHub

1. Crea un repository GitHub oppure aggiorna quello esistente. Estrai lo ZIP e carica **il contenuto** nella radice, comprese `.github/` e `.nojekyll`.
2. In **Settings → Pages**, scegli **GitHub Actions**: `Pubblica NFC Reader web` pubblica automaticamente `index.html` e `assets/`.
3. In **Actions → Compila EXE portable Windows → Run workflow**, avvia la compilazione. Il runner Windows costruisce il bridge C# tramite il compilatore .NET Framework incluso in Windows, esegue i test e produce l'EXE con electron-builder.
4. Scarica l'artefatto `NFC-Reader-Portable-Windows-x64`, estrai `NFC-Reader-Portable-1.8.4-x64.exe` e allegalo alla release GitHub con tag `v1.8.4`.

**Per distribuire Windows serve soltanto il `.exe`**: non servono Python, npm, DLL o cartelle esterne. Electron portable può estrarre componenti temporanei durante l'avvio; Windows deve comunque avere driver del lettore e servizio **Smart Card (SCardSvr)** funzionanti. Gli aggiornamenti del sito non aggiornano automaticamente l'EXE: occorre ricompilarlo e pubblicare la nuova release.

## Compilazione locale opzionale su Windows

Esegui `electron/build-win.bat` con Node.js 22 e PowerShell 5.1. Non servono Python, Visual Studio o node-gyp. Viene prodotto `electron/dist/NFC-Reader-Portable-1.8.4-x64.exe` (compilazione non verificabile su questo ambiente Linux).

## Quali tag posso scrivere?

| Dispositivo / tecnologia | Legge | Scrive testo e URL NDEF |
|---|---|---|
| Chrome Android con Web NFC | NDEF + UID se esposto | Tag NDEF compatibili e scrivibili |
| Windows + ACR122U + NTAG21x / Ultralight Type 2 | UID + NDEF (se accessibile) | Sì, se NDEF compatibile, non protetto e capiente |
| Windows + ACR122U + MIFARE Classic 1K **già NDEF** | UID + NDEF | **Sì, se MAD1/CRC/ACL/chiavi sono validi** |
| MIFARE Classic 1K non formattata NDEF | UID | No, serve preparazione NDEF con altro strumento |
| Badge protetti, DESFire, carte sconosciute | UID se disponibile | No |
| Lettore USB tipo tastiera HID | Non supportato | No |

**Importante:** il semplice fatto che un altro programma possa scrivere un blocco raw della Classic non significa che la scheda contenga già una struttura NDEF valida. NFC Reader **non** offre scrittura arbitraria di blocchi, modifiche alle chiavi, clonazione o formattazione: ciò evita danneggiamenti a badge e carte con applicazioni diverse. Usa soltanto tag tuoi e fai una prova su un tag di test, non su dati importanti.

### Flusso operativo Classic 1K

- Seleziona **Leggi** e avvicina la MIFARE Classic 1K: il dettaglio dovrebbe riportare i dati NDEF, se la MAD li identifica.
- Per scrivere, seleziona **Scrivi**, immetti il testo o URL e conferma la sovrascrittura. Rimuovi il tag, premi **Scrivi sul tag** e riavvicinalo: la scrittura parte soltanto su **una nuova presentazione**.
- In caso di errore di autenticazione, MAD senza NDEF, CRC invalido o permessi mancanti, il programma **non scrive** nulla.
- Evita di rimuovere il tag mentre scrive. In caso di interruzione dopo l'inizio, potrebbero rimanere dati parziali: l'app segnala esplicitamente il rischio.

## Cartelle principali

```
index.html                    Interfaccia Vue mobile/desktop
assets/css/                   Temi, layout, responsive
assets/js/                    App Vue, NDEF e suoni
assets/icons/                 Icone e ICO Windows trasparenti
sw.js, manifest.webmanifest   PWA
.github/workflows/            GitHub Pages + portable Windows
electron/                     Shell Electron, WinSCard, codec, test
electron/mifare-classic.cjs    Lettura e scrittura NDEF Classic 1K
electron/bridge/              Mini helper C# WinSCard Windows
tests/, electron/tests/       Test automatici
CHANGELOG.md, docs/           Versioni, diagnosi e release
```

## Test

- Web/PWA: `node --test tests/*.test.mjs`
- PC/SC, Classic, NDEF, packaging ed EPIPE: `cd electron && npm test` (usa Node.js 22).
- Non sostituiscono test con un **vero ACS ACR122U su Windows**. Prova prima su una Classic 1K NDEF di test.

## Privacy e aggiornamenti

Le letture e preferenze restano nel dispositivo (`localStorage`). Nessuna sincronizzazione cloud. **Esporta prima di cancellare i dati del browser**. I file possono essere sovrascritti durante aggiornamento del repository mantenendo i dati nel medesimo dominio/browser. Il Service Worker gestisce le nuove versioni senza interrompere le scansioni attive.
