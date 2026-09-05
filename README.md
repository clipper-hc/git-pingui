# Copa Pingüí de Badalona

Classificació de la copa. La taula la pot mirar tothom. Per apuntar-hi banys
cal entrar amb Google o amb un enllaç per correu, i els banys **compten de
seguida**: ningú no els ha de validar. La temperatura de l'aigua la posa
l'AEMET cada matí.

No hi ha framework, ni build, ni `npm install`. Són tres fitxers que el
navegador obre directament.

```
index.html      l'estructura i l'estil
app.js          la interfície, la identificació i la connexió amb la base de dades
scoring.js      el motor de puntuació (el reglament, en codi)
test-scoring.js 63 proves del motor      ·  node test-scoring.js
verify.js       proves de la interfície en un navegador de veritat
schema.sql      les taules i els permisos de Supabase
scripts/        la lectura diària de l'AEMET
```

Obrint `index.html` tal com està, l'app arrenca en **mode demostració** amb
nedadors inventats i tu identificat com a coordinador, per veure totes les
pantalles. No cal res més.

---

## Posar-la en marxa de debò

Mitja hora llarga, una sola vegada. La part de Google és el tros més llarg.

### 1. La base de dades

1. Crea un projecte gratuït a [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, enganxa-hi tot `schema.sql` i executa'l.
3. **Project Settings → API**, copia `Project URL` i la clau `anon public`.

### 2. Connectar l'app

A dalt de tot de `index.html`, dins del primer `<script>`:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
const TEMPORADA = { inici: "2026-11-01", fi: "2027-03-31" };
```

La clau `anon` és pública per disseny: va al navegador de tothom. Qui la
tingui només pot fer el que diuen les polítiques de `schema.sql`. La clau
`service_role` no apareix mai aquí.

### 3. Publicar-la

**Settings → Pages → Deploy from a branch → `main` / `root`.** Al cap d'un
minut queda a `https://<usuari>.github.io/<repositori>/`. Aquest és l'enllaç
que passes al grup de WhatsApp.

### 4. L'enllaç per correu

Ja funciona de sèrie. L'únic que cal és que a Supabase, a **Authentication →
URL Configuration**, hi posis l'adreça de GitHub Pages com a *Site URL*, i
també a *Redirect URLs*. Sense això l'enllaç del correu porta a un lloc que
no existeix.

**El correu de sèrie de Supabase envia unes dues cartes per hora.** Si passeu
l'enllaç al grup i tots proven l'opció del correu alhora, la majoria rebrà un
error `429`. Digueu-los que entrin amb Google, que no gasta correus, o
connecteu un SMTP propi (Resend, Brevo) a **Authentication → Emails**.

### 5. Google

Google ha reorganitzat la consola: ara tot penja de **Google Auth Platform**,
no de l'antiga "OAuth consent screen".

1. A [Google Cloud Console](https://console.cloud.google.com/), crea un
   projecte i busca **Google Auth Platform → Get started**.
2. Tipus d'audiència **External**. No es pot canviar després sense començar
   un projecte de zero.
3. A **Data Access**, afegeix `openid`, `userinfo.email` i `userinfo.profile`.
4. A **Clients**, crea un client **Web application**. A *Authorized redirect
   URIs* enganxa la que et dona Supabase a **Authentication → Providers →
   Google**: `https://xxxxxxxx.supabase.co/auth/v1/callback`.
5. Copia el *Client ID* i el *Client secret* i enganxa'ls a Supabase. Activa'l.

Mentre l'audiència estigui en *Testing*, només hi poden entrar els correus que
hagis afegit com a test users. Amb aquests permisos bàsics, publicar-la és
immediat i no passa per cap revisió: per a vint amics és molt més còmode.

### 6. Els coordinadors

Entreu-hi tots dos un cop, poseu-vos el nom, i després executeu a l'SQL
Editor les últimes línies de `schema.sql` amb els vostres correus. És l'únic
pas manual, i és a posta: si es pogués fer des de l'app, es podria fer
coordinador qualsevol.

### 7. Els nedadors

No has de fer res. Cadascú entra amb l'enllaç, escriu el seu nom i ja hi és.
Quan s'arriba a 20 l'app avisa, però no bloqueja: el reglament diu "per ordre
d'inscripció i amb dret d'admissió", i el dret d'admissió el teniu vosaltres,
no el programa.

---

## La temperatura de l'aigua

**Amb aquest model és imprescindible, no un extra.** Com que ningú no aprova
els banys, si un dia no té temperatura els banys d'aquell dia queden apuntats
però no puntuen fins que algú la posi.

L'AEMET publica la temperatura de l'aigua de la Platja del Centre. El
*workflow* de `.github/workflows/aemet.yml` la llegeix cada matí i l'escriu a
la taula `dies`.

1. Demana una clau gratuïta a
   [opendata.aemet.es](https://opendata.aemet.es/centrodedescargas/altaUsuario).
2. Al repositori, **Settings → Secrets and variables → Actions**, afegeix
   `AEMET_API_KEY`, `SUPABASE_URL` i `SUPABASE_SERVICE_KEY` (aquesta última és
   la clau `service_role` de Supabase, i no surt mai del repositori).

Si algun dia falla, la pestanya *Coordinació* us el mostra a la safata **Dies
sense temperatura**, amb els banys que hi ha esperant, i el podeu fixar a mà.
Els dies fixats a mà queden marcats com a `manual` i l'script no els torna a
tocar mai.

---

## Qui pot fer què

Imposat per les polítiques de `schema.sql`, no per la interfície, de manera
que aguanta encara que algú obri la consola del navegador.

| | Mirar la classificació | Apuntar banys | Esborrar els seus | Temperatures, dobles, configuració |
|---|---|---|---|---|
| Qualsevol amb l'enllaç | sí | no | no | no |
| Identificat | sí | els seus | sí | no |
| Coordinador | sí | els seus | qualsevol | sí |

Ningú no pot apuntar banys en nom d'un altre: la política comprova que el
`nedador_id` sigui el de la teva pròpia fitxa. Ningú no es pot fer coordinador
a si mateix. Els coordinadors no aproven res, però poden **anul·lar** un bany
equivocat des de *Corregir banys*, que és el que el reglament ja els donava:
resoldre el que no estava previst.

---

## El reglament, en codi

Tot `scoring.js`, amb 63 proves a `test-scoring.js`:

| Regla | On és |
|---|---|
| 1 punt per grau sota 20 ºC; 15 punts sota 10 ºC | `puntsTemperatura` |
| ×0,5 · ×1 · ×1,5 segons la distància | `coeficientDistancia` |
| Només els 4 millors dies de cada mes | `calcularClassificacio` |
| Doble el 31 de desembre i l'1 de gener | `esDiaDoble` |
| Doble el dia sorpresa | `dies[data].doble` |
| Ni neoprè ni proves competitives | `banyValid` |
| Mínim 2 esmorzars per optar al premi | `elegible` |
| Classificacions per dies i per metres | `ordenar` |

### Les tres classificacions

Els mateixos banys, mirats des de tres angles. Es canvien amb els filtres de
sobre de la taula.

| | Què mesura | Què hi compta |
|---|---|---|
| **Absoluta** | Punts, amb totes les regles del reglament | Només sense neoprè i sense proves competitives |
| **Dies nedats** | Dies diferents amb bany registrat | Tot: neoprè i proves incloses |
| **Metres** | Metres sumats | Tot: neoprè i proves incloses |

Només l'absoluta és la copa. Les altres dues són per mirar-se, i fan que qui
neda molt amb neoprè tingui també un lloc on sortir.

### L'esmorzar

El reporta el mateix nedador, marcant la casella quan registra el bany. Compta
el dia, no el bany: dos banys el mateix matí són un sol esmorzar. I compta
encara que el bany no puntuï, perquè a esmorzar hi va anar igualment. Els
coordinadors només veuen el recompte.

### El formulari

La distància ve informada amb **1500**, que és la mesura d'un pont i el que
neda gairebé tothom. El vestit és un desplegable que ve **amb neoprè** de
sèrie: per puntuar a l'absoluta cal triar activament "sense neoprè", de manera
que reclamar punts és sempre un acte explícit. Si ho voleu a l'inrevés, es
canvia l'atribut `selected` d'una de les dues `<option>` a `index.html`.

Tres punts que el reglament deixa oberts i que aquí s'han hagut de decidir:

- **Què és "1500 m aprox"**. Per defecte, entre 1400 i 1600 m compta com un
  pont. La banda es canvia des de la pestanya de coordinació, sense tocar codi.
- **Dos banys el mateix dia**. Se sumen entre ells, però ocupen una sola de
  les quatre places del mes.
- **9,5 ºC**. Compta com "per sota de 10", o sigui 15 punts, mirant el valor
  real abans d'arrodonir.

Si en decidiu una altra cosa, es canvia a `scoring.js` i s'executa
`node test-scoring.js` per comprovar que no s'ha trencat res.

---

## Configuració, sense tocar codi

Des de la pestanya *Coordinació* es canvien, i queden desats a la taula
`config`:

- **Les dates de la temporada.** Al novembre següent només cal moure-les.
  Les dades velles es queden a la base de dades i deixen de comptar soles,
  perquè el motor descarta el que cau fora del període.
- **La banda del pont**, que decideix el coeficient de distància.
- **El mode de proves.** Mentre està actiu, l'app avisa amb una franja que les
  dades no valen, deixa registrar banys fora de temporada, i dona als
  coordinadors un botó per esborrar tots els banys d'una tacada. Poseu-lo a
  false l'1 de novembre, quan comenci de debò.

El `TEMPORADA` de `index.html` només s'usa mentre l'app encara no ha llegit la
configuració, i com a valor de partida del mode de demostració.
