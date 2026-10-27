# LUDO — Nu te supăra, frate!

Proiect pentru materia **Tehnici Web**, realizat de **Alex și Cosmin**.
Joc de societate pentru 2–4 jucători în browser: pe același ecran, împotriva AI-ului sau online, cu prietenii, de pe calculatoare diferite.

## Starea proiectului

| Etapă | Conținut | Stare |
|---|---|---|
| 1 | Tabla, motorul de reguli, teste | ✅ funcțional, testat |
| 2 | Joc local (oameni + AI), 3 niveluri AI | ✅ funcțional, verificat în browser |
| 3 | Camere online cu cod și link, lobby, reconectare, AI pe server (Socket.IO) | ✅ funcțional, testat automat și în două sesiuni de browser pe același calculator |
| 4 | Conturi și listă persistentă de prieteni | ⏳ neînceput |

**Ce nu am verificat încă:** jocul real pe **două calculatoare diferite** și publicarea pe internet. Pașii sunt mai jos; trebuie făcuți de voi.

**Nu există conturi și nici listă de prieteni.** Invitațiile funcționează doar prin cod sau link.

## Instalare și pornire

Cerință: **Node.js 20–24** (testat cu Node 24).

```powershell
cd TPI
npm install        # o singură dată: instalează socket.io (și socket.io-client pentru teste)
npm start          # pornește serverul la http://localhost:3000
npm test           # rulează toate testele (node:test)
```

Pentru alt port: `$env:PORT=3001; npm start` (PowerShell) sau `PORT=3001 npm start` (bash). Variabilele opționale sunt descrise în `.env.example`.

> Fișierul `index.html` nu poate fi deschis direct (dublu-clic). Pagina are nevoie de server, inclusiv pentru jocul local.

## Joc online: cum funcționează pentru utilizator

1. **Gazda** alege **Online → Creează o cameră** și își scrie numele. Primește un **cod de 6 caractere** și un **link de invitație**, fiecare cu buton de copiere.
2. **Prietenul** deschide linkul (codul se completează singur) sau alege **Online → Intră într-o cameră** și scrie codul.
3. **În lobby:**
   - fiecare om își poate alege o culoare liberă și apasă **„Sunt pregătit”**;
   - gazda poate adăuga sau elimina AI pe locurile libere și le poate alege dificultatea.
4. **Gazda pornește partida** când sunt 2–4 participanți și toți oamenii sunt pregătiți. Orice schimbare de configurație (cineva intră sau pleacă, o culoare se schimbă, se adaugă sau se elimină un AI, se schimbă dificultatea) anulează „Pregătit” pentru toți, ca nimeni să nu înceapă cu o configurație neașteptată.
5. **În partidă:**
   - doar jucătorul aflat la rând își poate muta pionii;
   - ceilalți văd pe cine așteaptă („Așteptăm ca Cosmin să arunce zarul”);
   - la final, **„Înapoi în cameră”** readuce toată lumea în lobby, pentru o revanșă.

**Mesaje de eroare explicite:** cod invalid, cameră inexistentă sau expirată, cameră plină, partidă deja începută, nume invalid sau deja folosit, server indisponibil.

## Joc în aceeași rețea (Wi-Fi acasă), pe Windows

Calculatorul pe care rulează `npm start` este **serverul**. Să zicem că acesta este calculatorul lui Alex.

1. **Instalare și pornire,** pe calculatorul lui Alex:
   ```powershell
   npm install
   npm start
   ```
   În terminal apare și adresa din rețeaua locală, de exemplu `în rețeaua locală (Wi-Fi): http://192.168.1.6:3000`.
2. **Adresa IPv4.** Dacă terminalul nu o afișează, rulează `ipconfig` și caută la adaptorul **Wi-Fi** (sau **Ethernet**) linia **IPv4 Address**, de exemplu `192.168.1.6`. Ignoră adaptoarele virtuale: VMware, „vEthernet”, WSL.
3. **Pe calculatorul lui Cosmin,** deschide în browser `http://192.168.1.6:3000`, cu adresa lui Alex și portul afișat.
4. **Windows Firewall:** permite aplicația **doar pentru rețeaua privată**. Nu dezactiva firewallul.
   - **Varianta simplă:** la primul `npm start`, Windows poate întreba dacă permiți „Node.js JavaScript Runtime”. Bifează doar **Rețele private** și apasă **Permite accesul**.
   - **Varianta manuală:** deschide PowerShell **ca administrator** și rulează:
     ```powershell
     New-NetFirewallRule -DisplayName "LUDO (port 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
     ```
   - **Profilul rețelei:** rețeaua Wi-Fi de acasă trebuie să fie de tip **Privată** (Setări → Rețea și internet → Wi-Fi → proprietățile rețelei). Verifici cu `Get-NetConnectionProfile`. Regula de mai sus nu se aplică rețelelor publice.
   - **Pentru a șterge regula mai târziu:** `Remove-NetFirewallRule -DisplayName "LUDO (port 3000)"`.
5. **Camera:**
   - Alex deschide aplicația **tot prin adresa IP** (`http://192.168.1.6:3000`, nu `localhost`), creează camera și copiază linkul;
   - Cosmin deschide linkul și intră cu numele lui.

**De ce nu merge un link cu `localhost`:** linkul de invitație folosește adresa prin care gazda a deschis aplicația. `localhost` înseamnă întotdeauna „acest calculator”, așa că pe calculatorul lui Cosmin ar trimite către propriul lui calculator, unde nu rulează jocul. Dacă gazda deschide aplicația prin `localhost`, lobby-ul afișează un avertisment și linkul corect, cu adresa locală, gata de copiat.

**Când nu merge în rețeaua locală:**
- **Rețelele „guest” sau publice** (hoteluri, cămine, unele routere) au adesea **izolarea dispozitivelor** activă: calculatoarele nu se văd între ele, iar jocul nu poate fi accesat. Folosiți rețeaua principală sau varianta prin internet.
- **Alt antivirus sau firewall** decât cel din Windows poate bloca portul.
- **Laptopul gazdei nu trebuie să intre în repaus:** serverul se oprește.

## Joc prin internet (fiecare de acasă)

O găzduire **doar statică** (GitHub Pages, Netlify static etc.) **nu este suficientă**: jocul are nevoie de un server Node.js care rulează permanent și acceptă conexiuni Socket.IO (WebSocket).

### Varianta recomandată: Render, „Web Service”, planul Free

Am verificat documentația Render pe 27 octombrie 2026 ([render.com/docs/free](https://render.com/docs/free), [render.com/docs/websocket](https://render.com/docs/websocket), [render.com/docs/node-version](https://render.com/docs/node-version)):

- **Ce oferă:** serviciile web Render acceptă conexiuni WebSocket din internet și oferă automat HTTPS, pe o adresă de forma `https://NUME.onrender.com`.
- **Planul Free:**
  - **Ore:** 750 de ore de instanță pe lună. Dacă se termină, serviciul este suspendat până luna următoare.
  - **Oprire automată:** serviciul se oprește după **15 minute fără trafic**. Pornirea următoare durează **aproximativ un minut** (prima persoană care deschide linkul așteaptă).
  - **Repornire:** Render poate reporni oricând un serviciu gratuit.
  - **Instanțe:** una singură.
- **Efecte asupra jocului:**
  - **Camerele sunt ținute în memorie**, așa că după o oprire sau o repornire camerele și partidele active se pierd. Jucătorii văd „Camera nu mai există” și creează o cameră nouă.
  - **În timpul unei partide serviciul nu se oprește:** cât timp cineva e conectat, Socket.IO trimite periodic pachete de control, care contează ca trafic.
- **Costuri:** planul Free nu costă nimic. Pentru un server care nu se oprește niciodată e nevoie de un plan plătit. **Prețurile nu le-am verificat aici**; consultați [render.com/pricing](https://render.com/pricing) înainte să alegeți. Nu am creat niciun cont și nu am publicat nimic.

**Fișiere pregătite în proiect:**
- `render.yaml` — configurația serviciului: plan `free`, `npm ci --omit=dev`, `npm start`, verificare de sănătate pe `/healthz`, `TRUST_PROXY=1`;
- `.node-version` — Node 24;
- `package.json` — versiunea Node permisă: `>=20 <25`.

**Pași de publicare (îi faceți voi):**
1. **Un depozit GitHub.** Creați unul, de exemplu `ludo-tpi`, public sau privat, și urcați proiectul. `node_modules/` este exclus prin `.gitignore`.
   ```powershell
   git init
   git add .
   git commit -m "LUDO online"
   git branch -M main
   git remote add origin https://github.com/UTILIZATOR/ludo-tpi.git
   git push -u origin main
   ```
2. **Contul Render.** Pe [render.com](https://render.com) creați un cont (se poate cu GitHub) și alegeți **New → Blueprint**.
3. **Blueprint-ul.** Selectați depozitul. Render citește `render.yaml` și propune serviciul `ludo-nu-te-supara-frate`, pe planul **Free**. Confirmați.
4. **Așteptați build-ul** (`npm ci --omit=dev`) și pornirea. Adresa apare în dashboard: `https://ludo-nu-te-supara-frate.onrender.com` sau similar.
5. **Testul:** Alex deschide adresa HTTPS, creează o cameră și trimite linkul copiat. Linkul conține adresa publică, deci funcționează pentru Cosmin, acasă la el.

**Variabile:**
- **Pe Render nu e nevoie să setați nimic:** `PORT` este setat de platformă, iar `TRUST_PROXY` vine din `render.yaml`.
- **`ALLOWED_ORIGINS`** e necesară doar dacă interfața ar fi găzduită pe alt domeniu decât serverul (nu e cazul).

**Alternative:** orice serviciu care rulează un proces Node.js persistent și acceptă WebSocket (de exemplu Railway sau un VPS). Railway nu mai are un plan gratuit permanent clar documentat; consultați condițiile actuale înainte.

## Arhitectura online

```
browser (public/js)                         server (server/)
───────────────────                         ────────────────
online.js     ── room:create / join ──►     online.js  (Socket.IO, limitări de frecvență)
online-game.js ── game:roll {version, actionId} ─►  rooms.js (RoomManager)
              ── game:move {pawn, version, actionId} ─►   └─ shared/engine.js, shared/ai.js, shared/dice.js
              ◄── room:state (starea completă) ──
```

- **Serverul este autoritatea:**
  - **camere:** participanți, gazdă, configurație;
  - **partidă:** ordinea turelor, zarul (`crypto`, pe server), validarea și aplicarea mutărilor, capturi, victorie;
  - **AI:** mutările locurilor AI.
- **Clientul trimite doar intenții:** „aruncă” sau „mută pionul 2”. Nu trimite valori de zar, poziții sau identități.
  - Fiecare conexiune este legată pe server de participantul ei (`socketId → pid`), deci un jucător nu poate acționa în numele altuia.
- **Versiuni și identificatori de acțiune:**
  - Fiecare intenție conține `version`, versiunea stării pe care o vede clientul. Dacă între timp starea s-a schimbat, serverul răspunde `stale` și clientul se sincronizează.
  - Fiecare intenție are și un `actionId` unic. Dacă același clic ajunge de două ori, a doua oară este ignorat.
  - Rezultatul: nu există mutări duble, nici acțiuni întârziate aplicate unei ture noi.
- **Aplicarea stărilor pe client:**
  - stările sunt aplicate în ordine, iar cele mai vechi decât cea afișată sunt ignorate (interfața nu „sare înapoi”);
  - dacă versiunea crește cu 1, clientul animă evenimentele (zar, deplasare, capturare);
  - la un salt mai mare (reconectare), afișează direct starea curentă, fără să reia animațiile istorice.
- **Animațiile nu influențează rezultatul:** sunt pur vizuale. Serverul doar așteaptă, înaintea unei mutări AI, cât durează aproximativ animațiile, ca toată lumea să poată urmări jocul.
- **Siguranță:**
  - **Coduri de cameră:** 6 caractere din 31 posibile (aproximativ 887 de milioane de combinații), generate cu `crypto.randomInt`, verificate contra coliziunilor.
  - **Limitări de frecvență:** 8 camere noi la 10 minute pentru fiecare IP, 20 de încercări de intrare pe minut pentru fiecare IP, maximum 6 acțiuni pe secundă pentru fiecare conexiune.
  - **Validare:** numele sunt validate pe server și afișate ca text, niciodată ca HTML.
  - **Origini:** conexiunile Socket.IO sunt acceptate implicit doar de pe aceeași origine ca pagina.

### Deconectare, revenire, gazdă

- **Tokenul de reconectare:**
  - fiecare participant primește la intrare un token aleator de 192 de biți;
  - serverul păstrează doar amprenta lui (SHA-256), iar tokenul nu apare în linkul de invitație și nu este trimis altor jucători;
  - nici numele, nici `socket.id` nu sunt dovadă de identitate.
- **După reîncărcarea paginii:** fila își păstrează tokenul în `sessionStorage` și reintră automat.
- **Dacă fila a fost închisă:** la redeschiderea aplicației, ecranul online oferă „Revino în cameră”. Revenirea se face numai la cerere, ca să nu închidă din greșeală o altă filă.
- **Același loc din două conexiuni:** cea mai nouă conexiune preia locul, iar cea veche primește un mesaj și este închisă.
- **Deconectare în timpul partidei:**
  - jocul se **suspendă 60 de secunde**, iar toți văd „Așteptăm să revină X (45 s)”;
  - mutările deja acceptate rămân aplicate (fiecare acțiune e atomică pe server), dar nu se mai acceptă altele, nici ale AI-ului;
  - **dacă jucătorul revine** în acest interval, jocul continuă din starea existentă;
  - **dacă intervalul expiră,** AI-ul preia locul („AI temporar”);
  - **proprietarul poate reveni oricând.** Dacă nu este rândul lui, își reia locul imediat. Dacă este chiar tura lui, îl reia la începutul turei următoare, ca să nu se schimbe controlul în mijlocul unei ture.
- **„Părăsește” în timpul partidei:** plecarea este definitivă. AI-ul preia imediat locul, iar tokenul nu mai este valid.
- **În lobby:**
  - un om deconectat își păstrează locul 60 de secunde, apoi locul se eliberează;
  - dacă gazda pleacă sau expiră, rolul de gazdă trece la alt om conectat;
  - în partidă jocul nu depinde de browserul gazdei: totul rulează pe server.
- **Curățare:**
  - o cameră fără niciun om este ștearsă imediat;
  - o cameră în care nu mai e nimeni conectat este ștearsă după 10 minute, iar una inactivă după 2 ore;
  - toate temporizatoarele ei sunt oprite;
  - cât nu e conectat nimeni, AI-ul nu mai joacă.

### Stocare și limite

- **Repornirea serverului pierde toate camerele și partidele active:** camerele sunt ținute **în memoria serverului**.
- **O singură instanță de server.** Scalarea la mai multe instanțe ar necesita:
  - o stocare comună (de exemplu Redis) pentru camere și tokenuri;
  - un adaptor Socket.IO pentru mesaje între instanțe;
  - „sticky sessions” sau o coordonare echivalentă.
- **Fără conturi, parole sau listă de prieteni** (etapa 4).

## Structura proiectului

```
TPI/
├── shared/                 cod comun pentru browser, server și teste (fără DOM)
│   ├── engine.js           motorul de reguli: stare, mutări legale, aruncare, mutare
│   ├── geometry.js         coordonatele tablei, definite prin date
│   ├── ai.js               adversarii AI (ușor / mediu / dificil)
│   ├── messages.js         evenimente → mesaje în limba română
│   ├── dice.js             zar corect (crypto.getRandomValues)
│   └── validation.js       validarea numelor
├── server/
│   ├── server.js           HTTP static + Socket.IO, /healthz, adrese LAN, verificarea originii
│   ├── online.js           evenimentele Socket.IO → RoomManager, limitări de frecvență
│   ├── rooms.js            camere, lobby, partidă, deconectare, AI pe server, curățare
│   └── rate-limit.js       limitare de tip „găleată cu jetoane”
├── public/
│   ├── index.html          toate ecranele și dialogurile
│   ├── css/style.css       tema, layout responsive
│   └── js/
│       ├── app.js          ecranul principal, configurarea partidei locale, navigare
│       ├── game-screen.js  ecranul de joc comun (tablă, zar, carduri, istoric, victorie)
│       ├── local-game.js   controlerul partidei locale (motor + AI în browser)
│       ├── online.js       creare/intrare în cameră, lobby, invitații, reconectare
│       ├── online-game.js  controlerul partidei online (intenții, versiuni, animații)
│       ├── net.js          conexiunea Socket.IO (aceeași origine)
│       ├── board-view.js   randarea SVG a tablei și animațiile pionilor
│       ├── dice-view.js, theme.js, icons.js, settings.js, sound.js, ui.js
├── test/                   engine, ai, rooms (RoomManager), online (Socket.IO real)
├── render.yaml, .node-version, .env.example, .gitignore
└── package.json
```

## Design-ul interfeței

- **Paleta:** gri-albăstrui desaturat (#B8C2D0), tava tablei gri-lavandă (#949EB4), celule #D0D7E2, carduri #C3CCDA, text bleumarin (#20283B). Culorile jucătorilor sunt închise (#BF3546, #23734F, #C49619, #315DB5). Pe galben textul este bleumarin, pentru contrast.
- **Piesele „fizice”:** butoanele și cardurile au contur ferm și umbră solidă, iar la apăsare „coboară”. Pionii au formă reală, cu bază, corp, guler și cap, și un contur bleumarin care îi separă de celulele de aceeași culoare.
- **Culoarele finale** au exact culoarea triunghiului central corespunzător.
- **Ecranul de joc:**
  - pe desktop, cardurile jucătorilor stau lângă colțul culorii lor;
  - zarul are o zonă dedicată în dreapta, iar istoricul pliabil stă în stânga;
  - pe mobil ordinea este: tabla, aruncarea, jucătorii, restul.
- **Animațiile:**
  - deplasarea este controlată din JavaScript cu `requestAnimationFrame` (`BoardView.tween`), din timpul scurs;
  - mișcarea începe din primul cadru, fără salturi, iar pionul capturat alunecă înapoi în bază;
  - nu există pulsări permanente.

## Regulile acestei aplicații

Edițiile LUDO diferă între ele. Am implementat o variantă explicită:

- **Tabla:** traseu comun de 52 de poziții; fiecare culoare are bază, poziție de start și culoar final de 6 poziții (ultima este triunghiul din centru).
- **Ieșirea:** doar cu 6. Pionul se așază pe start și nu mai avansează. Un pion propriu aflat pe start blochează ieșirea.
- **Ture:** ordinea este fixă (Roșu → Verde → Galben → Albastru). Fiecare aruncare mută un singur pion.
- **6:** dă o nouă aruncare după mutare. Dacă nu există mutări cu 6, aruncarea bonus se păstrează.
- **Trei de 6:** al treilea 6 consecutiv nu produce mutare și încheie tura; mutările anterioare rămân.
- **Fără mutări:** la o valoare diferită de 6, tura trece automat, cu explicație.
- **Deplasare:** exact cu valoarea zarului. Se poate sări peste pioni. Doi pioni proprii nu pot sta pe aceeași poziție (excepție: capătul). Nu există blocaje.
- **Capturare:** ajungi exact pe un adversar și acesta revine în bază. **Nu există poziții sigure** pe traseu, nici pozițiile de start. Ieșirea din bază poate captura. Culoarul final este protejat.
- **Final:** e nevoie de valoarea exactă. Pionii terminați nu se mai mută. Capturarea și finalizarea nu dau aruncări bonus.
- **Victorie:** primul jucător cu toți cei 4 pioni la capăt. Partida se încheie atunci.

## Cum funcționează motorul (explicat simplu)

**Progresul relativ.** Nu memorăm coordonate pentru fiecare pion, ci un singur număr, *progresul*, relativ la culoarea pionului:

| Progres | Semnificație |
|---|---|
| `-1` | în bază |
| `0 … 50` | pe traseul comun; celula absolută = `(start + progres) % 52`, cu start = 0 / 13 / 26 / 39 |
| `51 … 56` | în culoarul propriu; `56` = capăt |

Pe traseul comun progresul se oprește la 50 și continuă doar în culoarul propriu. De aceea un pion nu poate face o tură în plus și nu poate intra pe culoarul altei culori.

**Geometria prin date.** În `geometry.js` sunt scrise de mână doar celulele sfertului roșu. Celelalte trei culori se obțin prin rotiri de 90° în jurul centrului: `(x, y) → (14 − y, x)`.

**Funcții pure.** `applyRoll(stare, valoare)` și `applyMove(stare, pion)` întorc o stare **nouă** și o listă de evenimente (`roll`, `move`, `no-moves`, `three-sixes`, `win` …). Motorul nu generează zarul și nu atinge pagina. Din acest motiv:
- poate fi testat în Node, fără browser;
- **rulează identic** în browser (jocul local) și pe server (jocul online);
- interfața doar afișează și animează evenimentele.

**Fazele partidei.** `roll` → `move` → `roll` … → `over`. O acțiune în faza greșită sau o mutare care nu se află în `legalMoves` aruncă o eroare, iar serverul o transmite clientului ca mesaj.

## Adversarii AI

AI-ul primește doar starea curentă, cu zarul deja aruncat, și alege din mutările legale calculate de motor. Nu cunoaște aruncările viitoare. În jocul local rulează în browser; în jocul online rulează **pe server**, cu același cod (`shared/ai.js`).

- **Ușor:** alege aleatoriu o mutare legală.
- **Mediu:** priorități fixe: finalizare > capturare > ieșire din bază > intrare în culoar. La egalitate avansează pionul cel mai înaintat.
- **Dificil:** calculează un scor pentru fiecare mutare:

```
scor = progresul câștigat
     + 40  dacă pionul ajunge la capăt
     + 15  dacă intră în culoarul final (devine protejat)
     + 25  dacă scoate un pion din bază
     + Σ (20 + progresul victimei)            pentru fiecare captură
     − risc(destinație) × (destinație + 15)   cât pierdem dacă suntem capturați
     + risc(origine)    × (origine + 15)      cât câștigăm fugind dintr-o poziție periculoasă

risc(celulă) = Σ 1/6 pentru fiecare pion advers aflat la 1–6 poziții în urmă
               (+ 1/6 dacă celula este startul unui adversar care poate ieși), plafonat la 1
```

**Limitele nivelului dificil:**
- privește o singură aruncare înainte;
- nu presupune că adversarul ar alege altă mutare;
- nu planifică mai multe ture.

## Testele

`npm test` rulează **55 de teste**, toate trecute la ultima rulare:

- **`engine.test.js` (23):** regulile. Ieșirea din bază la 6, blocarea startului, capturarea (inclusiv pe start), suprapunerea pionilor proprii, culoarul corect pentru toate culorile, valoarea exactă, 6 și trei de 6, lipsa mutărilor, victoria, plecarea unui jucător.
- **`ai.test.js` (4):** legalitatea tuturor mutărilor AI (100 de partide simulate), dificil contra ușor, prioritățile nivelului mediu, calculul riscului.
- **`rooms.test.js` (22):** `RoomManager`, cu un ceas fals ca să nu se aștepte timp real:
  - creare și intrare, coduri unice;
  - cod invalid sau inexistent, nume invalid sau duplicat, cameră plină, partidă începută;
  - culori duplicate, anularea „Pregătit”, drepturile gazdei, pornirea fără condiții;
  - aruncare și mutare în afara turei, pionul altui jucător;
  - acțiuni repetate (același `actionId`) și învechite (`stale`);
  - pauza de 60 s și revenirea, preluarea de către AI, reluarea locului la limită de tură;
  - token greșit, aceeași persoană din două conexiuni;
  - transferul gazdei, plecarea în partidă, curățarea camerelor și a temporizatoarelor, revanșa.
- **`online.test.js` (6):** un server real și clienți Socket.IO reali:
  - sincronizarea aceleiași stări la doi clienți;
  - erori pentru cod sau nume, acțiuni în afara turei;
  - reconectarea cu token și refuzul unui token greșit;
  - închiderea conexiunii vechi;
  - refuzul conexiunilor de pe alt site.

**Verificări în browser** (Microsoft Edge fără fereastră, două contexte independente, pe același calculator):
- **Camera și lobby-ul:** Alex creează camera pe desktop, Cosmin intră prin link pe un ecran de mobil (390×844); gazda adaugă un AI, ambii sunt pregătiți, gazda pornește partida.
- **Partida:**
  - 53–70 de acțiuni jucate de ambii, plus AI-ul;
  - la verificările făcute la aceeași versiune a stării, pozițiile pionilor au fost identice pe ambele ecrane;
  - Cosmin își reîncarcă pagina în mijlocul partidei și revine direct în joc.
- **Închiderea filei:** Cosmin închide fila; Alex vede „Așteptăm să revină Cosmin (58 s)” și „Deconectat”, iar butonul de aruncare este dezactivat. Cosmin redeschide linkul, apasă „Revino în cameră”, iar ambele ecrane ajung la aceeași versiune și aceleași poziții.
- **Erori afișate:** cod inexistent și nume duplicat.
- **Acces prin IP-ul local** (`http://192.168.1.6:…`): linkul de invitație conține IP-ul, copierea funcționează fără HTTPS, iar a doua sesiune intră în cameră.

Toate acestea au rulat **pe un singur calculator**. Testul pe două calculatoare și publicarea pe Render trebuie făcute de voi.

## Limitări actuale

- **Camerele sunt în memorie:** se pierd la repornirea serverului (sau la oprirea automată a planului Free de pe Render).
- **O singură instanță de server**, fără conturi și fără listă de prieteni.
- **Revenirea după închiderea filei** funcționează în același browser („Revino în cameră”); de pe alt dispozitiv nu se poate reveni într-un loc ocupat.
- **O partidă locală nu se salvează:** la reîncărcare se pierde.
- **Fonturile** se încarcă de la Google Fonts; fără internet se folosește fontul sistemului.

## Împărțirea muncii

| Alex | Cosmin |
|---|---|
| Motorul de reguli (`engine.js`) și testele lui | Tabla SVG și animațiile (`board-view.js`, `geometry.js`) |
| AI-ul (`ai.js`) și testele de simulare | Ecranele, CSS-ul responsive, dialogurile, zarul |
| Etapa 3: serverul (`rooms.js`, `online.js`), testele de server | Etapa 3: lobby-ul și invitațiile (`online.js` client), `online-game.js` |
| Etapa 4: conturile (hashing parole, sesiuni) | Etapa 4: interfața pentru prieteni și invitații |

Fiecare ar trebui să poată explica și partea celuilalt. Recomandăm citirea în comun a fișierelor `engine.js`, `rooms.js` și `online-game.js`.

## Scenariu de demonstrație (aproximativ 7 minute)

1. **Ecranul principal:** design-ul și creditul autorilor; „Cum se joacă”.
2. **Joc împotriva AI:** 1 adversar dificil. Aruncați zarul, arătați pionii evidențiați, ieșirea din bază, capturarea.
3. **Online, pe două laptopuri în aceeași rețea:**
   - Alex creează camera și copiază linkul; Cosmin îl deschide și intră;
   - gazda adaugă un AI, apoi amândoi apasă „Sunt pregătit”;
   - arătați că partida nu pornește până nu sunt toți pregătiți.
4. **În partidă:**
   - Cosmin încearcă să arunce în tura lui Alex: butonul e dezactivat, iar serverul ar refuza oricum;
   - Cosmin reîncarcă pagina și revine în joc;
   - Cosmin închide fila: Alex vede numărătoarea de 60 s;
   - Cosmin revine prin „Revino în cameră”.
5. **Codul:**
   - `engine.js`: progresul relativ;
   - `rooms.js`: verificarea `checkTurn`, cu tura, versiunea și `actionId`;
   - rulați `npm test`.
6. **Încheiere:** limitele (camere în memorie, o singură instanță) și cum ar arăta etapa 4.
