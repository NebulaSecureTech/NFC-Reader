# NFC Reader v1.8.3 — Verifica scrittura NDEF + Lettura multipla

**Data:** 15 ottobre 2026  
**Distribuzione:** repository unico GitHub Pages + Electron portable Windows x64

## Novità

- Lettura multipla **disattivata di default**, un tag e dettaglio automatico quando OFF.
- Lo Storico rinfresca i dati NDEF dello stesso UID se il contenuto cambia; non crea un doppione.
- NDEF post-scrittura verificato a livello di record: se contenuto e tipo non corrispondono, non viene dichiarato un successo.
- Diagnostica di TLV vuoti e GPB del formato MIFARE Classic 1K. Le mappature non standard sono bloccate in scrittura; nessun formato automatico.
- Altezza minima della finestra Windows 720 px (larghezza 1024 px) e maggiore stabilità della vista Lettore.

## Build

Carica il contenuto dello ZIP nel repository GitHub. In **Actions → Compila EXE portable Windows → Run workflow** avvia la build; scarica l'artefatto `NFC-Reader-Portable-Windows-x64` con `NFC-Reader-Portable-1.8.3-x64.exe` e allegalo alla Release tag **v1.8.3**.

## Verifica

**86 test JavaScript superati** (39 Web + 47 Electron). La compilazione Windows e le prove con hardware reale devono ancora essere eseguite: non dichiarare supporto produttivo finché il test con il tuo lettore e la card non è riuscito.
