# Analisi dell’app e dei trasferimenti

Data: 9 settembre 2026.

## Ambito

Revisione del client Angular P2P (interfaccia, lifecycle, socket e WebRTC), API Express/Socket.IO, configurazione STUN/TURN, interfacce condivise, SSR, configurazioni di build e test. Esaminato anche `svotao-client`, il prototipo separato di ricerca ingredienti: non partecipa ai trasferimenti.

## Problemi corretti

| Area | Problema | Intervento |
| --- | --- | --- |
| Invio | Blocchi fissi da 256 KiB, potenzialmente oltre il limite SCTP negoziato | Messaggi fino a 64 KiB, ulteriormente limitati da `sctp.maxMessageSize` |
| I/O locale | Una lettura del file per ogni messaggio | Letture da 1 MiB, suddivise in viste `Uint8Array`, senza copiare ciascun blocco con `slice` |
| Backpressure | Coda da 8 MiB e attesa del buffer senza timeout | Soglia alta 2 MiB, bassa 512 KiB, timeout e interruzione tramite `AbortSignal` |
| Completamento | 100% quando i byte erano soltanto accodati nel mittente | Conferma `ack` del ricevitore dopo verifica della dimensione e preparazione del download |
| Ricezione | Nessun controllo su file tronchi, metadata duplicati o dati fuori sequenza; `Blob` non gestito | Validazione del protocollo, supporto esplicito `ArrayBuffer` e `Blob`, nessun download di file con dimensione errata |
| Memoria | Un oggetto ArrayBuffer trattenuto per ogni messaggio fino al download | Raggruppamento in Blob da circa 4 MiB; rilascio di handler e riferimenti alla chiusura |
| Interfaccia | Aggiornamento per ogni blocco ricevuto | Progressione ogni 150 ms, eventi dei canali e ciclo di invio fuori da Angular; rientro solo per progressione/errori |
| Direzione | Anche un ricevitore con un file pubblicato poteva iniziare a inviarlo | Invio automatico solo nelle sessioni outbound |
| Concorrenza | Una nuova richiesta sostituiva peer, canale e handshake attivi | Prenotazione della sessione prima delle operazioni asincrone; rifiuto esplicito delle richieste quando occupati |
| Lifecycle | Peer precedenti non chiusi, attese bloccate e callback asincrone obsolete | Chiusura centralizzata, abort, controllo della generazione e dell’istanza peer, watchdog di inattività di 120 s |
| Errori | Errori visibili solo in console | Messaggi in interfaccia, annullamento durante connessione e trasferimento |
| Socket | Sottoscrizione persistente aggiunta a ogni aggiornamento stanza | Lettura dello stato corrente senza sottoscrizioni annidate; pulizia alla distruzione e riconnessione |
| Segnalazione | `from` alternava UUID applicativo e ID del trasporto | Identità applicativa coerente in offerte, risposte e candidati; filtro sul peer atteso |
| API | Accessi a peer inesistenti, nessun limite sui payload, esclusione dei file vuoti | Validazione di metadati/SDP/ICE, controllo appartenenza alla stanza, supporto size=0, handshake malformati rifiutati |
| Server Socket.IO | Buffer HTTP fino a 100 MB, compressione WebSocket e ping timeout di 5 s ereditati dalla libreria | Configurazione esplicita: payload max 256 KiB, niente compressione WebSocket, ping timeout 20 s |
| Riconnessione | File pubblicato e stanza generata potevano andare persi | Ripubblicazione dei metadati e conservazione della stanza nell’autenticazione di riconnessione |
| Configurazione RTC | HTTP senza timeout, fallback STUN memorizzato dopo un errore transitorio | Timeout di 5 s; fallback non memorizzato, così TURN può tornare disponibile al tentativo successivo |
| Download | Revoca immediata dell’URL del Blob | Link inserito nel DOM e URL revocato dopo 60 s |
| Bundle | Modulo e provider dei form presenti senza utilizzo | Rimossi dal client P2P |
| Test | Test avatar non eseguibile per risoluzione exports e dichiarazione di componente standalone | Mapping Jest degli entrypoint Angular e uso di `imports` |

Le soglie di buffer limitano i byte accodati dall’app al valore alto più un messaggio. Non rappresentano un limite all’intera memoria interna del browser. La conferma attesta che il browser ricevente ha ricostruito il file e avviato il download, non che l’utente lo abbia salvato su disco.

Riferimento tecnico: [specifica W3C WebRTC](https://www.w3.org/TR/webrtc/), per `maxMessageSize`, `send`, `bufferedAmountLowThreshold` e tipi binari.

## Verifiche

- Test client: 14 test passati. Copertura: invio byte per byte, limite negoziato, ACK, file vuoti, backpressure, cancellazione, timeout, ricezione Blob/ArrayBuffer, file incompleti, dati fuori sequenza e metadata duplicati; più il test avatar esistente.
- Test API: 5 test passati. Copertura: file vuoti, file non disponibili, identità applicativa coerente, payload malformati, destinazioni esterne alla stanza e proprietà ereditate.
- Controllo TypeScript di client P2P e API e lint dei servizi/client modificati.
- Build produzione di client P2P e API riuscite. Il bundle iniziale P2P passa da 883,42 kB nella prima build di questa revisione a 855,49 kB nella build finale, inclusa la rimozione dei form inutilizzati. Non è una misura del throughput di rete.
- La build estesa a `svotao-client` evidenzia un problema preesistente: CSS di `liquid-glass-container` da 12,53 kB rispetto al limite di errore di 8 kB. Quel progetto non è stato modificato.

Comandi ripetibili:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true npx nx run-many -t build -p svotao-p2p-share-client svotao-share-api
npx jest --config apps/svotao-p2p-share-client/jest.config.ts --runInBand
npx jest --config apps/svotao-share-api/jest.config.ts --runInBand
```

## Limiti e verifiche su dispositivi reali

- Nessuna misura di velocità su LAN, rete mobile o relay TURN è stata eseguita. I test automatizzati usano peer simulati: non sostituiscono un trasferimento reale fra browser.
- Ricezione ancora basata su Blob completo: non garantisce memoria costante per file di molti GB. Per quel requisito serve un percorso di scrittura su disco con gestione della quota e backpressure anche sul ricevitore.
- Una sessione alla volta, senza ripresa automatica dal byte interrotto. Dopo un errore l’utente può riprovare; le risorse della sessione precedente vengono liberate.
- Distribuire insieme API e client e ricaricare entrambe le pagine coinvolte. Il nuovo mittente richiede l’ACK: un ricevitore precedente potrebbe scaricare il file ma non confermarlo, causando un timeout sul mittente. Il nuovo ricevitore accetta anche il vecchio formato senza richiesta di ACK.
- Il filtro di provenienza usa il peer, non un ID univoco del singolo trasferimento nel protocollo di segnalazione: messaggi molto ritardati dello stesso peer possono ancora far fallire una nuova negoziazione.
- Le stanze sono ancora identificate da un nome condiviso e gli ID client non sono identità autenticate. La validazione aggiunta non costituisce un sistema di autorizzazione per documenti riservati.
- Rimangono warning di bundle, CommonJS/CSS e dataset Browserslist nel client P2P. La suite avatar può stampare il limite di parsing CSS di jsdom sulla dipendenza grafica, pur passando.

Prima del rilascio verificare due browser con entrambi i peer che pubblicano file, file vuoto e file grande, hash del download confrontato con l’originale, richieste contemporanee, annullamento, disconnessione e successivo tentativo, nonché rete con TURN forzato. Per confronti di performance usare stesso file/dispositivi/rete e misurare tempo totale fino all’ACK e picco di memoria.
