/* ==========================================================================
   COPA PINGÜÍ DE BADALONA — motor de puntuació
   Implementa el reglament. Sense dependències. Funciona a node i al navegador.
   ========================================================================== */

const DEFAULTS = {
  // Banda de distància que compta com "un pont" (~1500 m) -> coeficient 1.
  // Per sota: 0,5. Per sobre: 1,5. El reglament diu "1500 m aprox", així que
  // la banda és configurable pels coordinadors.
  pontMin: 1400,
  pontMax: 1600,
  // Màxim de dies puntuables per mes.
  maxDiesPerMes: 4,
  // Mínim d'esmorzars per optar al premi.
  minEsmorzars: 2,
};

/* --- Punts per temperatura de l'aigua ------------------------------------
   1 punt per cada grau per sota de 20 ºC. Per sota de 10 ºC, 15 punts fixos. */
function puntsTemperatura(tempC) {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return null;
  // "Per sota de 10º sumen 15 punts directament": es mira el valor real,
  // abans d'arrodonir, perquè 9,9 ºC ja és per sota de 10.
  if (tempC < 10) return 15;
  const t = Math.round(tempC);
  if (t >= 20) return 0;
  return 20 - t;
}

/* --- Coeficient de correcció per distància ------------------------------- */
function coeficientDistancia(metres, cfg = DEFAULTS) {
  if (metres < cfg.pontMin) return 0.5;
  if (metres <= cfg.pontMax) return 1;
  return 1.5;
}

/* --- Un bany compta? ------------------------------------------------------
   No sumen: neoprè, proves competitives, banys fora de temporada.
   Sí sumen: proves no competitives (mini de Sant Esteve, benèfiques). */
function banyValid(bany, temporada) {
  if (bany.neopre) return { ok: false, motiu: "neoprè" };
  if (bany.competitiu) return { ok: false, motiu: "prova competitiva" };
  if (temporada && (bany.data < temporada.inici || bany.data > temporada.fi))
    return { ok: false, motiu: "fora de temporada" };
  if (bany.estat !== "aprovat") return { ok: false, motiu: "anul·lat" };
  return { ok: true };
}

/* --- Punts bruts d'un bany (sense doble ni límit mensual) ----------------- */
function puntsBany(bany, tempC, cfg = DEFAULTS) {
  const pt = puntsTemperatura(tempC);
  if (pt === null) return null; // temperatura encara no fixada pels coordinadors
  return pt * coeficientDistancia(bany.metres, cfg);
}

/* --- Dies de doble puntuació ---------------------------------------------
   31 de desembre i 1 de gener sempre. A més, els dies marcats a mà pels
   coordinadors (el dia sorpresa comunicat amb menys de 24 h). */
function esDiaDoble(data, diesMarcats = {}) {
  const md = data.slice(5); // "MM-DD"
  if (md === "12-31" || md === "01-01") return true;
  return diesMarcats[data] === true;
}

const mesDe = (data) => data.slice(0, 7); // "YYYY-MM"

/* ==========================================================================
   Càlcul complet de la classificació.

   banys      : [{ id, nedadorId, data:"YYYY-MM-DD", metres, neopre, competitiu,
                   esmorzar, estat:"aprovat"|"anullat", nota }]
   dies       : { "YYYY-MM-DD": { tempC, doble } }
   nedadors   : [{ id, nom }]

   Retorna, per a cada nedador, les tres classificacions alhora:
     · total              punts de la classificació absoluta (sense neoprè,
                          amb el límit de 4 dies per mes i els dobles)
     · diesNedats         dies diferents dins de temporada, tot inclòs
     · metresNedats       metres sumats dins de temporada, tot inclòs
   ========================================================================== */
function calcularClassificacio({ banys, dies = {}, nedadors, temporada, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };

  // 1. Agrupa els banys vàlids per nedador i per dia.
  //    Diversos banys el mateix dia se sumen i compten com UN sol dia.
  const perNedador = new Map();
  for (const n of nedadors) perNedador.set(n.id, {
    nedador: n, dies: new Map(), descartats: [],
    // Volum brut: compta qualsevol bany registrat dins de temporada, també
    // amb neoprè i també de proves competitives. Són classificacions de
    // constància i de quilòmetres, no de fred.
    diesBruts: new Set(), metresBruts: 0, esmorzars: new Set(),
  });

  for (const b of banys) {
    const fitxa = perNedador.get(b.nedadorId);
    if (!fitxa) continue;

    const dinsTemporada = b.estat === "aprovat" &&
      (!temporada || (b.data >= temporada.inici && b.data <= temporada.fi));
    if (dinsTemporada) {
      fitxa.diesBruts.add(b.data);
      fitxa.metresBruts += b.metres;
      // L'esmorzar el reporta el mateix nedador en registrar el bany. Compta
      // el dia, no el bany: dos banys el mateix matí són un sol esmorzar.
      if (b.esmorzar) fitxa.esmorzars.add(b.data);
    }

    const v = banyValid(b, temporada);
    if (!v.ok) {
      fitxa.descartats.push({ ...b, motiu: v.motiu });
      continue;
    }
    const info = dies[b.data] || {};
    const punts = puntsBany(b, info.tempC, cfg);
    if (punts === null) {
      fitxa.descartats.push({ ...b, motiu: "sense temperatura" });
      continue;
    }
    if (!fitxa.dies.has(b.data)) {
      fitxa.dies.set(b.data, {
        data: b.data,
        tempC: info.tempC,
        doble: esDiaDoble(b.data, { [b.data]: info.doble === true }),
        banys: [],
        puntsBase: 0,
      });
    }
    const dia = fitxa.dies.get(b.data);
    dia.banys.push({ ...b, punts });
    dia.puntsBase += punts;
  }

  // 2. Aplica el doble, després el límit de 4 millors dies per mes.
  const resultats = [];
  for (const fitxa of perNedador.values()) {
    const dies_ = [...fitxa.dies.values()].map((d) => ({
      ...d,
      punts: d.puntsBase * (d.doble ? 2 : 1),
    }));

    const mesos = new Map();
    for (const d of dies_) {
      const m = mesDe(d.data);
      if (!mesos.has(m)) mesos.set(m, []);
      mesos.get(m).push(d);
    }

    let total = 0;
    const detallMesos = [];
    for (const [mes, llista] of [...mesos.entries()].sort()) {
      // Els millors N dies compten; la resta queden descartats però visibles.
      const ordenats = [...llista].sort((a, b) => b.punts - a.punts || a.data.localeCompare(b.data));
      const compten = ordenats.slice(0, cfg.maxDiesPerMes);
      const fora = ordenats.slice(cfg.maxDiesPerMes);
      const comptenSet = new Set(compten.map((d) => d.data));
      const subtotal = compten.reduce((s, d) => s + d.punts, 0);
      total += subtotal;
      detallMesos.push({
        mes,
        subtotal,
        diesTotals: llista.length,
        diesQueCompten: compten.length,
        dies: [...llista]
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((d) => ({ ...d, compta: comptenSet.has(d.data) })),
        descartatsPerLimit: fora.length,
      });
    }

    const esmorzarsAssistits = fitxa.esmorzars.size;

    resultats.push({
      nedador: fitxa.nedador,
      total: Math.round(total * 100) / 100,
      // Dies i metres que puntuen a l'absoluta.
      diesTotals: dies_.length,
      metresTotals: dies_.reduce((s, d) => s + d.banys.reduce((x, b) => x + b.metres, 0), 0),
      // Volum brut, per a les altres dues classificacions.
      diesNedats: fitxa.diesBruts.size,
      metresNedats: fitxa.metresBruts,
      tempMinima: dies_.length ? Math.min(...dies_.map((d) => d.tempC)) : null,
      mesos: detallMesos,
      descartats: fitxa.descartats,
      esmorzars: esmorzarsAssistits,
      elegible: esmorzarsAssistits >= cfg.minEsmorzars,
    });
  }

  ordenar(resultats, "absoluta");
  return resultats;
}

/* Ordena la llista segons quina de les tres classificacions es miri, i hi
   escriu la posició. Els empats comparteixen posició. */
const CRITERIS = {
  absoluta: { valor: (r) => r.total,        desempat: (r) => r.diesNedats },
  dies:     { valor: (r) => r.diesNedats,   desempat: (r) => r.metresNedats },
  metres:   { valor: (r) => r.metresNedats, desempat: (r) => r.diesNedats },
};

function ordenar(resultats, criteri = "absoluta") {
  const c = CRITERIS[criteri] || CRITERIS.absoluta;
  resultats.sort((a, b) =>
    c.valor(b) - c.valor(a) ||
    c.desempat(b) - c.desempat(a) ||
    a.nedador.nom.localeCompare(b.nedador.nom, "ca"));
  let posicio = 0, anterior = null;
  resultats.forEach((r, i) => {
    const v = c.valor(r);
    if (v !== anterior) { posicio = i + 1; anterior = v; }
    r.posicio = posicio;
  });
  return resultats;
}

if (typeof module !== "undefined") {
  module.exports = { calcularClassificacio, ordenar, puntsTemperatura,
                     coeficientDistancia, esDiaDoble, DEFAULTS };
}
