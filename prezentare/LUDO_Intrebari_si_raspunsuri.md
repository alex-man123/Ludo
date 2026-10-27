# LUDO — întrebări probabile la susținere

Răspunsuri scurte, pentru pregătirea prezentării. Între paranteze este fișierul din proiect în care se vede fiecare lucru.

**1. De ce este necesar un server?**
Doi jucători de pe calculatoare diferite trebuie să vadă aceeași partidă. Starea oficială trebuie să stea într-un singur loc, accesibil amândurora, și acela este serverul Node.js. Tot el generează zarul și verifică mutările, ca nimeni să nu poată trișa din browser (`server/rooms.js`).

**2. Ce rol are Socket.IO?**
Ține o conexiune deschisă între browser și server, prin care mesajele circulă în ambele sensuri, imediat. Browserul trimite evenimente (`game:roll`, `game:move`), iar serverul trimite tuturor starea nouă (`room:state`). Socket.IO e o bibliotecă peste WebSocket: adaugă evenimente cu nume, reconectare automată și, ca rezervă, HTTP long-polling (`public/js/net.js`, `server/online.js`).

**3. De ce nu funcționează `localhost` pentru coleg?**
`localhost` înseamnă întotdeauna „calculatorul pe care rulează browserul”. Un link cu `localhost` deschis de Cosmin duce la calculatorul lui, unde jocul nu rulează. De aceea linkul de invitație folosește adresa prin care gazda a deschis aplicația (`location.origin`, în `public/js/online.js`).

**4. Care este diferența dintre tunel și găzduire?**
Cu tunelul (Cloudflare Tunnel), serverul rulează tot pe calculatorul nostru. `cloudflared` deschide o conexiune spre Cloudflare și primește o adresă publică temporară, prin care traficul ajunge la serverul local. Calculatorul, serverul și tunelul trebuie să rămână pornite.
La găzduire, aplicația rulează pe un server din internet, permanent, iar calculatorul nostru poate fi închis. Noi am folosit tunelul. Pentru găzduire există un fișier pregătit (`render.yaml`), dar aplicația nu a fost publicată.

**5. Unde se păstrează starea jocului?**
În memoria serverului, într-un `Map` din `RoomManager` (`this.rooms`, în `server/rooms.js`). Nu avem bază de date. Browserul păstrează doar o copie pentru afișare și tokenul de reconectare, în `sessionStorage`.

**6. Ce se întâmplă dacă serverul se oprește?**
Camerele și partidele active se pierd, pentru că stau în memorie. Clienții încearcă să se reconecteze, iar dacă serverul a fost repornit primesc mesajul „Camera nu mai există” și pot crea o cameră nouă. Este o limită asumată și documentată în README.

**7. Cum prevenim mutările ilegale?**
Clientul trimite doar intenția („mută pionul 2”). Serverul, în `checkTurn`, verifică:
- ce jucător e legat de acea conexiune;
- dacă e rândul lui și faza e potrivită;
- dacă versiunea stării e cea actuală;
- dacă acțiunea nu a mai fost primită.

Apoi verifică dacă mutarea se află în lista calculată de motorul de reguli (`getLegalMoves`). Zarul îl generează tot serverul.

**8. Cum funcționează AI-ul?**
Este algoritmic, nu un model antrenat și nici un LLM. Alege doar dintre mutările legale, fără să cunoască zarurile viitoare.
- **Ușor:** alege la întâmplare.
- **Mediu:** urmează o ordine fixă — finalizare, capturare, ieșire din bază, intrare în culoar.
- **Dificil:** dă fiecărei mutări un scor: progresul câștigat, +40 pentru finalizare, +20 plus progresul victimei pentru captură, minus riscul de a fi capturat.

Codul e în `shared/ai.js`. Online rulează pe server, cu același cod.

**9. Cum gestionăm reconectarea?**
- **Tokenul:** fiecare jucător primește la intrare un token secret și aleator. Serverul păstrează doar amprenta lui (SHA-256).
- **Reîncărcarea paginii:** browserul trimite tokenul și primește starea completă, fără reluarea animațiilor vechi.
- **Deconectarea:** jocul se oprește 60 de secunde pentru toți. Dacă jucătorul nu revine, AI-ul îi preia locul, iar la întoarcere și-l reia la o limită sigură de tură.
- **Aceeași persoană din două file:** rămâne activă doar conexiunea cea mai nouă.

Codul e în `server/rooms.js` (`resume`, `disconnect`, `expirePause`).

**10. Ce am schimba pentru mai mulți utilizatori?**
- **Stocare comună:** de exemplu Redis, pentru camere și tokenuri, ca serverul să poată fi repornit fără pierderi.
- **Mai multe instanțe de server:** un adaptor Socket.IO care să transmită mesajele între ele și „sticky sessions”.
- **Găzduire permanentă,** în loc de tunel.
- **Mai târziu:** conturi cu parole stocate prin hashing și o listă de prieteni.

**11. De ce SVG și nu Canvas pentru tablă?**
SVG este vectorial: rămâne clar la orice mărime de ecran. Fiecare pion este un element separat, deci primește direct clicuri, focus de la tastatură și etichete pentru cititoarele de ecran. Canvas ar fi cerut să calculăm manual pe ce pion s-a dat clic (`public/js/board-view.js`).

**12. Cum ați verificat că funcționează?**
Pe trei niveluri, separate:
- **55 de teste automate** (`npm test`): 23 pentru reguli, 4 pentru AI, 22 pentru camere, 6 cu clienți Socket.IO reali.
- **Verificări automatizate în două sesiuni de browser,** pe același calculator: cameră, lobby, partidă, reîncărcare, închiderea filei.
- **O partidă reală Alex–Cosmin,** din rețele diferite, prin Cloudflare Tunnel, făcută manual.

**13. Ce înseamnă „versiune” și „actionId”?**
`version` crește cu 1 la fiecare acțiune aplicată. Dacă un clic ajunge după ce starea s-a schimbat, versiunea lui e veche și serverul îl refuză. `actionId` este un identificator unic al fiecărui clic: dacă același mesaj ajunge de două ori, a doua oară e ignorat.

---

## Pregătirea demonstrației

- [ ] Cu 10 minute înainte: `npm start` și tunelul pornite pe laptopul lui Alex; adresa `https://….trycloudflare.com` deschisă pe ambele dispozitive.
- [ ] O partidă online deja în curs, cu pioni ieșiți din bază, ca să nu depindeți de un 6.
- [ ] Sunetul oprit în Setări, dacă sala e liniștită.
- [ ] Planul B: capturile de pe slide-ul 11 și prezentarea în PDF.
- [ ] După prezentare: `Ctrl + C` în ferestrele tunelului și serverului.
