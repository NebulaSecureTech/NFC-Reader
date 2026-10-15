# Diagnostica ACS ACR122: errore 6300

`6300` è il codice restituito dal lettore per il fallimento di un'operazione APDU come `FF B0` (READ BINARY), e non specifica da solo la causa.

Il progetto v1.8.0 provava a usare il layout NDEF Type 2 per ogni tessera. Una MIFARE Classic richiede un protocollo di accesso diverso (e spesso l'autenticazione dei settori), quindi leggere pagina 03 della card come fosse NTAG non è corretto.

La v1.8.1 legge l'ATR WinSCard associato al tag, distingue le famiglie riconosciute e salva nel dettaglio UID, tipo PC/SC, ATR e diagnostica NDEF.

## Procedura di verifica su Windows

1. Compila l'eseguibile della v1.8.1 con Actions e aprilo.
2. Collega il lettore ACS ACR122 USB e apri **Leggi**.
3. Avvicina **un solo tag** e apri il suo dettaglio.
4. Controlla **Tipo di tag (PC/SC)** e apri l'accordion **Record e dati tecnici** per copiare l'**ATR**.
5. Se è una **MIFARE Classic**, la lettura UID rimane disponibile ma la scrittura NDEF Type 2 è intenzionalmente disabilitata.
6. Per provare **Scrivi**, utilizza soltanto un **NTAG213/215/216 già formattato NDEF e scrivibile**, di tua proprietà.
7. Se anche quel tag restituisce 6300, condividi il tipo e l'ATR, specificando l'esatto modello del tag. Non ripetere tentativi di scrittura alla cieca.

## Limiti

- Il riconoscimento ATR della famiglia non prova da solo che il tag sia scrivibile.
- L'app non formatta automaticamente tag vergini né autentica i badge Classic o altre carte protette.
- Il 6300 può dipendere da tecnologia, protezioni, memoria, firmware del lettore o compatibilità del comando.
- Il codice è stato testato su bridge simulato; verificare la Release reale su Windows e il lettore fisico.

**Fonti**
- ACS ACR122U API v2.03 (pagine 8-9 e 16-17): https://downloads.acs.com.hk/drivers/en/API-ACR122U-2.03.pdf
- Microsoft PC/SC Storage Card ATR: https://learn.microsoft.com/en-us/windows-hardware/drivers/nfc/pc-sc-interface
