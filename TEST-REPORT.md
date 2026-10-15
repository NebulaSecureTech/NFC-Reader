# Report test - NFC Reader v1.4.0

**Ambiente:** Node.js 22, Chromium headless tramite Playwright, Vue 3/DOM/CSS reali con Web NFC/Web Share, audio e storage simulati.

| Verifica | Esito |
| --- | --- |
| Test unitari e PWA simulate | **36 / 36 superati** |
| Scenari UI Chromium | **37 / 37 superati** |
| Condividi in alto nello Storico | Visibile anche a **320px**, senza sovrapposizioni; pulsantiera inferiore rimossa |
| Modale export | CSV/TXT, progressivo, Scarica e Condividi; azioni raggiungibili su 320x568 |
| Dati in esportazione | Intero registro, anche con ricerca applicata; fallback download se condivisione nativa assente |
| Web Share (mock) | CSV e TXT come file, condivisione tag e fallback |
| Record tecnici | Accordion nativo chiuso di default, HEX annidato espandibile; riapertura di un tag reimposta lo stato |
| Compatibilita archivio precedente | Preservate le stesse chiavi localStorage |
| Lettore non scorre | 12 viewport da 320 a 1280 px, portrait e landscape |
| Errore JavaScript nei test browser | Nessuno |
| NFC fisico su Android e condivisione nativa reale | **Da verificare su dispositivo** |
| Installazione PWA/offline su GitHub Pages reale | **Da verificare sul sito pubblicato** |

Il test browser usa Vue, HTML e CSS reali in Chromium, ma gli eventi NFC e le chiamate piattaforma sono simulati: non sostituisce un collaudo fisico. Il service worker e' controllato da test unitari con precache simulata; nell'ambiente di sviluppo la navigazione HTTP localhost e' bloccata, per cui non e' stato possibile eseguire un vero collaudo offline end-to-end.

Esecuzione dei test inclusi nello ZIP Sorgenti:

```sh
node --test tests/*.test.mjs
python tests/browser_smoke.py
```
