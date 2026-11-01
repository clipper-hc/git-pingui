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
test-scoring.js 69 proves del motor      ·  node test-scoring.js
verify.js       proves de la interfície en un navegador de veritat
build.js        genera dist/artifact.html, el fitxer únic que es publica
schema.sql      les taules i els permisos, per a una instal·lació nova
migracio.sql    els canvis sobre una base de dades ja en marxa
aemet.mjs       la lectura diària de l'AEMET
```

Obrint `index.html` tal com està, l'app arrenca en **mode demostració** amb
nedadors inventats i tu identificat com a coordinador. No cal res més.

---

## Canvis de l'1 de novembre de 2026

Executa **`migracio.sql`** a Supabase → SQL Editor. No esborra cap dada, i
inclou també els canvis del 28 d'octubre per si no els havies passat.

### Els esmorzars passen a ser una porta de punts

Abans deixaven fora del premi. Ara, més senzill: **els punts d'un mes no
entren al global fins que no s'hi ha anat a esmorzar dues vegades aquell
mes.** No és una desqualificació. Els punts hi són, es veuen marcats com "en
espera", i entren tots de cop el dia que s'arriba als dos esmorzars.

L'avantatge és que es regula sol i no cal decidir res al final de la
temporada. L'efecte a vigilar: algú que faci un gener brutal i no vagi a
esmorzar perd el mes sencer, i això es nota molt més que una regla
d'elegibilitat. Es relaxa amb `esmorzars_mes` a `config`.

### Bonificacions

Taula nova `modificadors`. Cada fila és una cosa que pot passar mar endins i
el que val:

| | |
|---|---|
| He vist un tauró | 10 punts |
| He vist un dofí | 10 punts |
| M'ha picat una medusa | 1 punt |

**Per afegir-ne una de nova no cal tocar codi:** una fila a `modificadors`
des del Table Editor de Supabase i apareix sola al formulari de tothom i al
reglament de l'app. `actiu` a false l'amaga sense esborrar l'històric, i
`ordre` decideix en quin ordre surten.

Tres decisions preses en implementar-ho, totes reversibles:

- **Són punts plans.** No es multipliquen pel coeficient de distància ni es
  dupliquen els dies dobles. Veure un dofí val 10 nedant 800 m i nedant-ne
  3000, que és el que vol dir "sumi 10 punts".
- **Només compten als banys que puntuen a l'absoluta.** Amb neoprè o en una
  cursa no se'n cullen, perquè si no serien una via per puntuar saltant-se
  les altres regles.
- **Entren al dia, no al marge.** Un dia amb bonificació pot desbancar un
  altre dins del límit de quatre dies per mes, que és el que té sentit: va
  ser un dia més bo.

### Un pont són uns 1700 m

La banda del coeficient 1 passa de 1400–1600 a **1600–1800**, i el valor per
defecte del formulari de 1500 a 1700. Compte amb això: **1500 m ara val
×0,5**, no ×1. Si algú ja havia registrat banys de 1500 m comptant que eren
un pont, aquells banys baixen de puntuació.

---

## Canvis del 28 d'octubre de 2026

### El llindar de temperatura

El reglament deia "un punt per cada grau per sota de 20 ºC". Amb l'aigua a
21 ºC a finals d'octubre, el novembre no hauria puntuat gairebé mai. El
llindar passa a ser **23 ºC** i es canvia des de Coordinació sense tocar codi.

| Aigua | Abans (20 ºC) | Ara (23 ºC) |
|---|---|---|
| 21 ºC | 0 | 2 |
| 19 ºC | 1 | 4 |
| 15 ºC | 5 | 8 |
| 13 ºC | 7 | 10 |
| 10 ºC | 10 | 13 |
| < 10 ºC | 15 | 15 |

Un efecte secundari a tenir present: amb el llindar a 23, els 15 punts del
fred extrem queden a només dos punts dels 13 que val nedar a 10 ºC. El salt
que premiava els dies de debò durs s'ha aplanat. Si ho voleu recuperar,
`punts_extrem` a la taula `config` ho puja sense tocar res més.

### Fora de Badalona

Camp nou `fora` a la taula `banys`. Es pot nedar fora, però **només compta un
bany de fora cada mes**: si n'hi ha més, puntua el millor i la resta queden
marcats al detall. Un bany de fora descartat per aquesta regla **no** ocupa
cap de les quatre places del mes.

La temperatura que s'aplica a un bany de fora és sempre **la de Badalona**
d'aquell dia. No hi ha cap camp de temperatura al bany: tot surt de la taula
`dies`, o sigui que això ja funcionava sol.

### Esmorzars

Passen a ser **dos cada mes**, els cinc mesos de la temporada. Un mes tancat
sense arribar-hi deixa fora del premi. El mes en curs es veu però no penalitza
ningú: encara s'hi és a temps.

A Coordinació hi ha una taula amb una columna per mes: verd si el mes està
cobert, taronja si és el mes en curs i encara en falten, vermell si el mes ja
ha tancat sense arribar-hi.

### Inscripció

20 €, destinats a una samarreta commemorativa. És text del reglament i un
valor a `config`; l'app no gestiona diners.

---

## Un error que arrossegaven totes les versions publicades

`build.js` inlinava `app.js` dins de l'HTML amb `String.replace`, i
JavaScript interpreta `$$` al text de substitució com un `$` literal. Cada
`$$` del codi (la funció que selecciona diversos elements) arribava a
l'artifact convertida en `$`, cosa que trencava les pestanyes de la versió
publicada. El fitxer servit per GitHub Pages no hi passa, o sigui que només
afectava la demostració.

Ara `build.js` fa servir una funció de substitució i, a més, comprova que el
codi inlinat sigui idèntic al d'origen abans de donar el build per bo.
`verify.js` prova `dist/artifact.html`, no `index.html`, precisament per
aquest motiu.

---

## Posar-la en marxa de zero

### 1. La base de dades

1. Crea un projecte gratuït a [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, enganxa-hi tot `schema.sql` i executa'l.
3. **Settings → API Keys**, copia el `Project URL` i la clau **pública**
   (`anon` o `sb_publishable_…`).

### 2. Connectar l'app

A dalt de tot de `index.html`, dins del primer `<script>`:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Les dates de la temporada ja no es toquen aquí: viuen a `config` i es canvien
des de Coordinació.

### 3. Publicar-la

**Settings → Pages → Deploy from a branch → `main` / `root`.**

### 4. Identificació

A Supabase, **Authentication → URL Configuration**, posa-hi l'adreça de
GitHub Pages com a *Site URL* i també a *Redirect URLs*.

El correu de sèrie de Supabase envia unes dues cartes per hora: digues-los
que entrin amb Google, o connecta un SMTP propi.

Per a Google, mira la guia de desplegament. En resum: **Google Auth Platform
→ Clients**, client de tipus *Web application*, i a *Authorized redirect
URIs* la URL que et dona Supabase (`.../auth/v1/callback`).

### 5. Els coordinadors

Entreu-hi tots dos, poseu-vos el nom, i després executeu les últimes línies
de `schema.sql` amb els vostres correus.

---

## La temperatura de l'aigua

L'AEMET publica la temperatura de la Platja del Centre. El *workflow* de
`.github/workflows/aemet.yml` la llegeix cada matí i l'escriu a `dies`.

Cal `AEMET_API_KEY`, `SUPABASE_URL` i `SUPABASE_SERVICE_KEY` als secrets del
repositori. Aquesta última és la clau **secreta** (`service_role` o
`sb_secret_…`), de **Settings → API Keys**, i no és la mateixa que poses a
`index.html`.

Si algun dia falla, la pestanya *Coordinació* mostra els **dies sense
temperatura** amb els banys que hi esperen, i es poden fixar a mà.

---

## Qui pot fer què

| | Mirar | Apuntar banys | Esborrar els seus | Configuració |
|---|---|---|---|---|
| Qualsevol amb l'enllaç | sí | no | no | no |
| Identificat | sí | els seus | sí | no |
| Coordinador | sí | els seus | qualsevol | sí |

Imposat per les polítiques de `schema.sql`, no per la interfície.

---

## El reglament, en codi

Tot `scoring.js`, amb 69 proves a `test-scoring.js`:

| Regla | On és |
|---|---|
| 1 punt per grau sota el llindar; 15 punts sota 10 ºC | `puntsTemperatura` |
| ×0,5 · ×1 · ×1,5 segons la distància | `coeficientDistancia` |
| Només els 4 millors dies de cada mes | `calcularClassificacio` |
| Només un bany de fora de Badalona per mes | `calcularClassificacio` |
| Doble el 31 de desembre i l'1 de gener | `esDiaDoble` |
| Ni neoprè ni curses | `banyValid` |
| 2 esmorzars cada mes obren els punts del mes | `mesCompta` |
| Bonificacions configurables | `puntsModificadors` |
| Classificacions per dies i per metres | `ordenar` |

### Les tres classificacions

| | Què mesura | Què hi compta |
|---|---|---|
| **Absoluta** | Punts, amb totes les regles | Només sense neoprè ni curses, i un bany de fora al mes |
| **Dies nedats** | Dies diferents amb bany | Tot: neoprè, curses i tots els banys de fora |
| **Metres** | Metres sumats | Tot |

### Decisions que el reglament deixa obertes

- **"1500 m aprox"**: de 1400 a 1600 m compta com un pont. Es canvia des de
  Coordinació.
- **Dos banys el mateix dia**: se sumen, però ocupen una sola de les quatre
  places del mes, i són un sol esmorzar.
- **Un dia amb un bany de Badalona i un de fora**: el dia sencer compta com
  de fora, i per tant entra al límit d'un per mes.
- **Bonificacions i el límit de 4 dies**: un dia amb bonificació compta com
  un dia normal i pot desbancar-ne un altre.
- **9,5 ºC**: compta com "per sota de 10". Es mira el valor real abans
  d'arrodonir.
