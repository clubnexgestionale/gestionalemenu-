# Menu digitale per bar e ristoranti

Menu consultabile da smartphone + gestionale per modificarlo, con generazione di QR code, cartellini stampabili e scrittura di tag NFC. Gira interamente su **GitHub Pages**: nessun server, nessun database, nessun costo.

- **Menu pubblico** → `https://TUO-UTENTE.github.io/NOME-REPO/`
- **Gestionale** → `https://TUO-UTENTE.github.io/NOME-REPO/admin/`

## Cosa fa

**Menu per i clienti**
- Nome, logo, sottotitolo, avviso (es. coperto) e colore del locale
- Indicatore «Aperto ora / Chiuso · apre alle…» calcolato dagli orari (gestisce anche le chiusure dopo mezzanotte)
- Sezioni separate (es. *Cucina* e *Bar & Bevande*) con categorie: antipasti, primi, secondi, dolci, pasticceria, caffetteria, cocktail, vini, birre, analcolici… tutte modificabili
- Più prezzi per voce (calice/bottiglia, piccola/media, al banco/al tavolo)
- I 14 allergeni UE, etichette (vegetariano, vegano, senza glutine, piccante, consigliato, novità, surgelato), voci esaurite
- Ricerca, foto facoltative, tema chiaro/scuro automatico
- Mostra «Tavolo 7» o «Bancone» quando il cliente arriva da un QR o da un tag NFC

**Gestionale**
- Modifica di locale, orari, sezioni, categorie e voci, anche da telefono
- Le modifiche restano in bozza sul dispositivo finché non premi **Pubblica**; **Anteprima** mostra la bozza come la vedranno i clienti
- **QR & NFC**: un link per ogni tavolo e punto del bancone, download PNG/SVG, stampa cartellini (tavoli: 4 per A4; bancone: 2 per A4), scrittura dei tag NFC da Chrome su Android con blocco in sola lettura
- Backup e ripristino del menu in un file `.json`

## Messa online (circa 10 minuti, una volta sola)

1. **Crea il repository.** Su github.com → *New repository*. Nome a piacere (es. `menu`), visibilità **Public** (GitHub Pages gratuito richiede un repository pubblico).
2. **Carica i file.** Nel repository: *Add file → Upload files* e trascina **il contenuto** di questa cartella (`index.html`, `admin`, `assets`, `data`, …), non la cartella stessa. Conferma con *Commit changes*.
3. **Attiva GitHub Pages.** *Settings → Pages → Build and deployment*: Source **Deploy from a branch**, branch **main**, cartella **/ (root)** → *Save*. Dopo 1–2 minuti compare l'indirizzo del sito.
4. **Crea il token per il gestionale.** Su GitHub: foto profilo → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - *Repository access*: **Only select repositories** → scegli il repository del menu
   - *Permissions → Repository permissions → Contents*: **Read and write**
   - Scadenza a piacere; copia il token (`github_pat_…`).
5. **Collega il gestionale.** Apri `…/admin/` → scheda **Impostazioni** → utente e repository sono già compilati se usi l'indirizzo github.io → incolla il token → **Salva e verifica**.
6. Personalizza **Locale**, **Orari** e **Menu**, poi **Pubblica**. Il menu online si aggiorna in circa un minuto.

Su ogni nuovo dispositivo (es. il telefono del titolare) basta ripetere il punto 5.

## QR code e NFC

Nella scheda **QR & NFC** imposti quanti tavoli hai, da che numero partire, come chiamarli (Tavolo, Ombrellone, Sala…) e i punti del bancone.

- **Stampa**: stampa su A4 al 100%, senza margini, e ritaglia lungo le linee tratteggiate. Su cartoncino da 250–300 g reggono bene; per i tavoli si possono infilare in un portamenu da tavolo A6.
- **Tag NFC**: consigliati adesivi **NTAG213/NTAG215** (su superfici metalliche servono tag *anti-metal*). Apri il gestionale con **Chrome su Android**, premi **NFC** sotto il QR e avvicina il tag. Spunta *Blocca il tag* per renderlo non riscrivibile da altri. Su iPhone usa l'app gratuita **NFC Tools** (Scrivi → Aggiungi record → URL) incollando il link copiato.

> Decidi l'indirizzo definitivo **prima** di stampare i QR e scrivere i tag: se poi cambi dominio, andrebbero rifatti.

## Dominio personalizzato (facoltativo)

Per usare ad esempio `menu.nomelocale.it`:
1. Presso il provider del dominio aggiungi un record **CNAME**: `menu` → `TUO-UTENTE.github.io`
2. Su GitHub: *Settings → Pages → Custom domain* → `menu.nomelocale.it` → *Save*, poi attiva *Enforce HTTPS* quando disponibile
3. Nel gestionale, scheda **QR & NFC**, scrivi `https://menu.nomelocale.it/` in *Link pubblico*

Il gestionale sarà allora su `https://menu.nomelocale.it/admin/`.

## Sicurezza

- La pagina del gestionale è raggiungibile da chiunque conosca l'indirizzo, ma **senza token non si può pubblicare nulla**.
- Il token è salvato solo nel browser in cui l'hai inserito. Se perdi un dispositivo, revoca il token da GitHub e creane uno nuovo.
- Usa sempre un token *fine-grained* limitato al solo repository del menu.

## Struttura dei file

```
index.html            menu pubblico
admin/index.html      gestionale
assets/menu.*         stile e logica del menu
assets/admin.*        stile e logica del gestionale
assets/common.js      funzioni condivise (allergeni, orari, prezzi)
assets/vendor/        libreria QR code (MIT, Kazuhiko Arase)
data/menu.json        il menu (scritto dal gestionale)
data/img/             foto e logo caricati dal gestionale
```

## Domande frequenti

**Ho pubblicato ma il menu non cambia.** GitHub Pages impiega circa un minuto. Controlla l'avanzamento nella scheda *Actions* del repository.

**Posso modificare da più telefoni?** Sì: collega ogni dispositivo con un token. Le bozze però sono locali a ogni dispositivo, quindi pubblica prima di passare all'altro.

**Più locali?** Crea un repository per ogni locale caricando gli stessi file: ognuno avrà il suo indirizzo e il suo gestionale.
