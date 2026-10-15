# Diagnostica — MIFARE Classic 1K

Il lettore ACR122U può autenticare i blocchi MIFARE Classic con APDU `FF 82` (carica chiave volatile), `FF 86` (autenticazione), poi leggere con `FF B0` e scrivere con `FF D6`. Non è equivalente alla scrittura delle pagine NTAG Type 2.

La v1.8.2 supporta **esclusivamente** schede Classic 1K personali già formattate NDEF in modo standard:

1. settore 0 MAD1 leggibile usando chiavi pubbliche standard;
2. MAD1 con CRC valido e AID NFC Forum `03 E1` in settori contigui;
3. settori NDEF autenticabili con chiavi pubbliche note, dati TLV NDEF regolari;
4. bit ACL per i blocchi destinazione validi e effettivamente scrivibili;
5. readback di tutti i blocchi scritti.

Non vengono eseguite operazioni su blocco 0, MAD1 (blocchi 1-2), trailer (`3,7,11,...`), chiavi, ACL, badge o applicazioni riservate. Niente tentativi di indovinare chiavi personali.

- **`Autenticazione settore 0 non riuscita`**: MAD non leggibile con chiavi standard; potrebbe non essere formattata o essere protetta.
- **`senza settori NDEF`**: altri programmi possono scrivere raw, ma manca un'area NDEF dichiarata nel MAD; prepara una **nuova card tua e vuota** usando uno strumento per la formattazione NDEF prima di riprovare.
- **`CRC non valido`**: directory MAD corrotta/non standard; non effettuare scritture.
- **`Settore X ... permessi differenti`**: chiave nota non consente scrittura; non forzare.
- **`write EPIPE` in chiusura**: corretto con handler asincrono dello stream e arresto senza scrivere nel canale stdin chiuso.

Riferimenti: ACS ACR122U API v2.03; NXP AN1305 (MIFARE Classic NDEF) e AN10787 (MAD1).
