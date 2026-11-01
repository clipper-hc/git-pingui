/* ==========================================================================
   COPA PINGÜÍ DE BADALONA — motor de puntuació
   Implementa el reglament. Sense dependències. Funciona a node i al navegador.
   ========================================================================== */

const DEFAULTS = {
  // Banda de distància que compta com "un pont" (~1500 m) -> coeficient 1.
  // Per sota: 0,5. Per sobre: 1,5. El reglament diu "1500 m aprox", així que
  // la banda és configurable pels coordinadors.
  pontMin: 1600,
  pontMax: 1800,
  // Màxim de dies puntuables per mes.
  maxDiesPerMes: 4,
  // Esmorzars: dos CADA MES, els cinc mesos de la temporada.
  minEsmorzarsPerMes: 2,
  // Es poden nedar banys fora de Badalona, però només en compta un per mes.
  // La temperatura que s'hi aplica és sempre la de Badalona.
  maxForaPerMes: 1,
  // Temperatura a partir de la qual no es puntua. El reglament deia 20 ºC;
  // amb els hiverns que fa ara, el novembre no puntuaria gairebé mai.
  tempBase: 23,
  // Punts fixos per sota de 10 ºC.
  puntsExtrem: 15,
  // Bonificacions que el nedador marca en registrar el bany. La llista viu a
  // la taula `modificadors` i els coordinadors hi poden anar afegint coses
  // durant la temporada: [{ id, nom, punts }].
  modificadors: [],
};

/* --- Punts de les bonificacions d'un bany --------------------------------
   Són punts PLANS: no es multipliquen pel coeficient de distància ni es
   dupliquen els dies dobles. Veure un dofí val el mateix nedant 800 m que
   nedant-ne 3000, que és el que vol dir "sumi 10 punts". */
function puntsModificadors(ids, cfg = DEFAULTS) {
  if (!ids || !ids.length) return 0;
  const taula = new Map((cfg.modificadors || []).map((m) => [String(m.id), m]));
  return ids.reduce((s, id) => {
    const m = taula.get(String(id));
    return s + (m ? Number(m.punts) || 0 : 0);
  }, 0);
}

/* --- Punts per temperatura de l'aigua ------------------------------------
   Un punt per cada grau per sota del llindar. Per sota de 10 ºC, punts fixos.
   El llindar és configurable des de Coordinació: el reglament el fixava a
   20 ºC, però l'aigua ja no baixa de 20 fins ben entrat el novembre. */
function puntsTemperatura(tempC, cfg = DEFAULTS) {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return null;
  const base = cfg.tempBase ?? DEFAULTS.tempBase;
  const extrem = cfg.puntsExtrem ?? DEFAULTS.puntsExtrem;
  // "Per sota de 10º sumen 15 punts directament": es mira el valor real,
  // abans d'arrodonir, perquè 9,9 ºC ja és per sota de 10.
  if (tempC < 10) return extrem;
  const t = Math.round(tempC);
  if (t >= base) return 0;
  return base - t;
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
  const pt = puntsTemperatura(tempC, cfg);
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

/* Tots els mesos que toca la temporada, de l'inici al final. */
function mesosDeTemporada(temporada) {
  if (!temporada) return [];
  const mesos = [];
  let [any, mes] = temporada.inici.slice(0, 7).split("-").map(Number);
  const fi = temporada.fi.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const m = `${any}-${String(mes).padStart(2, "0")}`;
    mesos.push(m);
    if (m >= fi) break;
    mes++; if (mes > 12) { mes = 1; any++; }
  }
  return mesos;
}

/* Un mes està tancat quan ja ha passat del tot: només els mesos tancats
   poden deixar algú fora del premi per no haver fet els esmorzars. El mes
   en curs encara es pot arreglar. */
const mesTancat = (mes, avui) => mes < avui.slice(0, 7);

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
function calcularClassificacio({ banys, dies = {}, nedadors, temporada, config = {},
                                 avui = new Date().toISOString().slice(0, 10) }) {
  const cfg = { ...DEFAULTS, ...config };
  const mesosTemporada = mesosDeTemporada(temporada);

  // 1. Agrupa els banys vàlids per nedador i per dia.
  //    Diversos banys el mateix dia se sumen i compten com UN sol dia.
  const perNedador = new Map();
  for (const n of nedadors) perNedador.set(n.id, {
    nedador: n, dies: new Map(), descartats: [],
    // Volum brut: compta qualsevol bany registrat dins de temporada, també
    // amb neoprè i també de proves competitives. Són classificacions de
    // constància i de quilòmetres, no de fred.
    diesBruts: new Set(), metresBruts: 0,
    // Esmorzars per mes: { "2026-11": Set("2026-11-08", ...) }
    esmorzarsPerMes: new Map(),
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
      if (b.esmorzar) {
        const m = mesDe(b.data);
        if (!fitxa.esmorzarsPerMes.has(m)) fitxa.esmorzarsPerMes.set(m, new Set());
        fitxa.esmorzarsPerMes.get(m).add(b.data);
      }
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
        puntsExtres: 0,      // bonificacions: s'hi sumen planes, sense doblar
        extres: [],          // quines, per poder-les ensenyar
        fora: false,         // cert si algun bany d'aquell dia va ser fora de Badalona
      });
    }
    const dia = fitxa.dies.get(b.data);
    const extres = puntsModificadors(b.modificadors, cfg);
    dia.banys.push({ ...b, punts, extres });
    dia.puntsBase += punts;
    dia.puntsExtres += extres;
    for (const id of b.modificadors || []) {
      const m = (cfg.modificadors || []).find((x) => String(x.id) === String(id));
      if (m) dia.extres.push(m);
    }
    if (b.fora) dia.fora = true;
  }

  // 2. Aplica el doble, després el límit de 4 millors dies per mes.
  const resultats = [];
  for (const fitxa of perNedador.values()) {
    const dies_ = [...fitxa.dies.values()].map((d) => ({
      ...d,
      punts: d.puntsBase * (d.doble ? 2 : 1) + d.puntsExtres,
    }));

    const mesos = new Map();
    for (const d of dies_) {
      const m = mesDe(d.data);
      if (!mesos.has(m)) mesos.set(m, []);
      mesos.get(m).push(d);
    }

    // Esmorzars: en calen dos CADA MES. Un mes sense els dos esmorzars no
    // suma res al global. No és una desqualificació: els punts hi són i es
    // recuperen tots en el moment que s'arriba als dos esmorzars del mes.
    const esmorzars = mesosTemporada.map((mes) => {
      const fets = (fitxa.esmorzarsPerMes.get(mes) || new Set()).size;
      return {
        mes, fets,
        falten: Math.max(0, cfg.minEsmorzarsPerMes - fets),
        tancat: mesTancat(mes, avui),
        comencat: mes <= avui.slice(0, 7),
      };
    });
    const esmorzarsDe = new Map(esmorzars.map((e) => [e.mes, e]));
    const esmorzarsAssistits = esmorzars.reduce((s, e) => s + e.fets, 0);

    let total = 0;
    let puntsPerduts = 0;   // els que no compten per falta d'esmorzars
    const detallMesos = [];
    for (const [mes, llista] of [...mesos.entries()].sort()) {
      const perPunts = (a, b) => b.punts - a.punts || a.data.localeCompare(b.data);

      // Primer, el límit de banys fora de Badalona. Dels dies amb algun bany
      // de fora només en compta el millor; la resta cauen aquí i NO ocupen
      // cap de les quatre places del mes.
      const deFora = llista.filter((d) => d.fora).sort(perPunts);
      const foraAdmesos = new Set(deFora.slice(0, cfg.maxForaPerMes).map((d) => d.data));
      const foraDescartats = new Set(deFora.slice(cfg.maxForaPerMes).map((d) => d.data));

      // Després, els millors N dies d'entre els que han passat el filtre.
      const elegibles = llista.filter((d) => !foraDescartats.has(d.data)).sort(perPunts);
      const compten = elegibles.slice(0, cfg.maxDiesPerMes);
      const sobren = elegibles.slice(cfg.maxDiesPerMes);
      const comptenSet = new Set(compten.map((d) => d.data));
      const subtotal = compten.reduce((s, d) => s + d.punts, 0);

      // La porta dels esmorzars: el mes només entra al global si s'hi ha
      // anat les vegades que toca.
      const esm = esmorzarsDe.get(mes) || { fets: 0, falten: cfg.minEsmorzarsPerMes };
      const mesCompta = esm.falten === 0;
      if (mesCompta) total += subtotal; else puntsPerduts += subtotal;

      detallMesos.push({
        mes,
        subtotal,
        mesCompta,
        esmorzarsFets: esm.fets,
        esmorzarsFalten: esm.falten,
        diesTotals: llista.length,
        diesQueCompten: compten.length,
        dies: [...llista]
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((d) => ({
            ...d,
            compta: comptenSet.has(d.data),
            motiuFora: foraDescartats.has(d.data) ? "més d'un fora de Badalona" : null,
          })),
        descartatsPerLimit: sobren.length,
        descartatsPerFora: foraDescartats.size,
        foraAdmesos: foraAdmesos.size,
      });
    }

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
      esmorzarsPerMes: esmorzars,
      // Mesos amb punts bloquejats per falta d'esmorzars, ara mateix.
      mesosBloquejats: detallMesos.filter((m) => !m.mesCompta && m.subtotal > 0)
        .map((m) => m.mes),
      puntsPerduts: Math.round(puntsPerduts * 100) / 100,
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
                     coeficientDistancia, puntsModificadors, esDiaDoble,
                     mesosDeTemporada, DEFAULTS };
}
