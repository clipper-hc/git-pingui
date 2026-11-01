const { calcularClassificacio, ordenar, puntsTemperatura, coeficientDistancia,
        esDiaDoble, mesosDeTemporada, puntsModificadors } = require("./scoring.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};

console.log("\n-- Taula de temperatures (llindar als 23 ºC) --");
eq("23 graus -> 0", puntsTemperatura(23), 0);
eq("22 graus -> 1", puntsTemperatura(22), 1);
eq("21 graus -> 2", puntsTemperatura(21), 2);
eq("19 graus -> 4", puntsTemperatura(19), 4);
eq("13 graus -> 10", puntsTemperatura(13), 10);
eq("10 graus -> 13", puntsTemperatura(10), 13);
eq("9,9 graus -> 15", puntsTemperatura(9.9), 15);
eq("8 graus -> 15", puntsTemperatura(8), 15);
eq("sense temperatura -> null", puntsTemperatura(null), null);
eq("14,4 arrodoneix a 14 -> 9", puntsTemperatura(14.4), 9);

console.log("\n-- El llindar es pot moure des de Coordinació --");
eq("amb llindar 20, 21 graus -> 0", puntsTemperatura(21, { tempBase: 20 }), 0);
eq("amb llindar 20, 13 graus -> 7", puntsTemperatura(13, { tempBase: 20 }), 7);
eq("amb llindar 25, 21 graus -> 4", puntsTemperatura(21, { tempBase: 25 }), 4);

console.log("\n-- Coeficient de distancia (un pont son uns 1700 m) --");
eq("900 m -> 0,5", coeficientDistancia(900), 0.5);
eq("1500 m -> 0,5", coeficientDistancia(1500), 0.5);
eq("1600 m -> 1", coeficientDistancia(1600), 1);
eq("1700 m -> 1", coeficientDistancia(1700), 1);
eq("1800 m -> 1", coeficientDistancia(1800), 1);
eq("2000 m -> 1,5", coeficientDistancia(2000), 1.5);

console.log("\n-- Dies dobles --");
eq("31 desembre", esDiaDoble("2026-12-31"), true);
eq("1 gener", esDiaDoble("2027-01-01"), true);
eq("dia normal", esDiaDoble("2027-01-15"), false);
eq("dia sorpresa marcat", esDiaDoble("2027-01-15", { "2027-01-15": true }), true);

console.log("\n-- Mesos de la temporada --");
eq("novembre a marc", mesosDeTemporada({ inici: "2026-11-01", fi: "2027-03-31" }),
  ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);

const temporada = { inici: "2026-11-01", fi: "2027-03-31" };
const nedadors = [{ id: "a", nom: "Anna" }, { id: "h", nom: "Hugo" }, { id: "j", nom: "Jordi" }];
// Es fixa "avui" al final de la temporada perque els mesos surtin tancats.
const run = (banys, dies, avui = "2027-04-05") =>
  calcularClassificacio({ banys, dies, nedadors, temporada, avui });
const bany = (o) => ({ estat: "aprovat", neopre: false, competitiu: false,
                       esmorzar: false, fora: false, modificadors: [], ...o });
// La porta dels esmorzars taparia el que volen mesurar la majoria de casos,
// així que s'obre el mes MARCANT els banys que ja hi ha, en comptes
// d'afegir-ne de nous: així dies, metres i punts no es mouen.
let nEsm = 0;
const obreMes = (ned, mes) => [1, 2].map((d) =>
  bany({ id: `esm${nEsm++}`, nedadorId: ned, data: `${mes}-0${d}`, metres: 100, esmorzar: true }));
const obert = (dates) => Object.fromEntries(
  [...new Set(dates)].map((d) => [d, { tempC: 23 }]));

const de = (res, id) => res.find((r) => r.nedador.id === id);
const aigua = (...dates) => Object.fromEntries(dates.map((d) => [d, { tempC: 12 }]));
// Marca com a "amb esmorzar" els dos primers dies de cada mes i de cada
// nedador. Si un mes només té un dia, hi afegeix un bany de farciment en un
// dia lliure i a 23 graus, que no puntua.
const MIN_ESM = 2;
const ambEsmorzars = (banys, dies) => {
  const fora = [];
  const extraDies = {};
  const grups = new Map();
  for (const b of banys) {
    const k = `${b.nedadorId}|${b.data.slice(0, 7)}`;
    if (!grups.has(k)) grups.set(k, []);
    grups.get(k).push(b);
  }
  for (const [k, llista] of grups) {
    const [ned, mes] = k.split("|");
    const dies_ = [...new Set(llista.map((b) => b.data))].sort();
    dies_.slice(0, MIN_ESM).forEach((d) => {
      llista.filter((b) => b.data === d)[0].esmorzar = true;
    });
    // Falten dies: s'omplen amb banys de farciment que no puntuen.
    for (let i = dies_.length; i < MIN_ESM; i++) {
      let dia, n = 20;
      do { dia = `${mes}-${String(n++).padStart(2, "0")}`; } while (dies_.includes(dia));
      dies_.push(dia);
      fora.push(bany({ id: `esm${nEsm++}`, nedadorId: ned, data: dia,
                       metres: 100, esmorzar: true }));
      extraDies[dia] = { tempC: 23 };
    }
  }
  return [banys.concat(fora), { ...extraDies, ...dies }];
};
const runE = (banys, dies, avui) => run(...ambEsmorzars(banys, dies), avui);
// 12 ºC amb llindar 23 = 11 punts. A 1500 m, coeficient 1 -> 11 punts el dia.

console.log("\n-- Cas 1: un sol bany --");
// 13 graus = 10 punts, 2000 m = x1,5  ->  15
let r = runE(
  [bany({ id: "1", nedadorId: "a", data: "2027-01-10", metres: 2000 })],
  { "2027-01-10": { tempC: 13 } }
);
eq("10 x 1,5 = 15", de(r, "a").total, 15);

console.log("\n-- Cas 2: dia doble de Cap d'Any --");
// 11 graus = 12 punts, 1500 m = x1, 1 de gener = x2  ->  24
r = runE(
  [bany({ id: "1", nedadorId: "a", data: "2027-01-01", metres: 1700 })],
  { "2027-01-01": { tempC: 11 } }
);
eq("12 x 1 x 2 = 24", de(r, "a").total, 24);

console.log("\n-- Cas 3: el novembre ja puntua --");
// Era el problema: a 21 ºC amb el llindar vell no sumava res.
r = runE(
  [bany({ id: "n", nedadorId: "a", data: "2026-11-02", metres: 1700 })],
  { "2026-11-02": { tempC: 21 } }
);
eq("21 graus al novembre = 2 punts", de(r, "a").total, 2);

console.log("\n-- Cas 4: limit de 4 dies per mes --");
r = runE(
  [5, 6, 7, 8, 9].map((d, i) =>
    bany({ id: "b" + i, nedadorId: "a", data: `2027-01-0${d}`, metres: 1700 })),
  aigua("2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09")
);
eq("4 millors dies x 11 = 44", de(r, "a").total, 44);
eq("un dia descartat pel limit", de(r, "a").mesos[0].descartatsPerLimit, 1);

console.log("\n-- Cas 5: fora de Badalona, nomes un per mes --");
// Tres banys de fora el mateix mes, tots iguals. Nomes n'ha de comptar un.
r = runE(
  [10, 11, 12].map((d, i) =>
    bany({ id: "f" + i, nedadorId: "a", data: `2027-02-${d}`, metres: 1700, fora: true })),
  aigua("2027-02-10", "2027-02-11", "2027-02-12")
);
eq("nomes 11 punts, no 33", de(r, "a").total, 11);
eq("dos descartats per fora", de(r, "a").mesos[0].descartatsPerFora, 2);
eq("un de fora admes", de(r, "a").mesos[0].foraAdmesos, 1);

console.log("\n-- Cas 5b: dels de fora compta el MILLOR --");
// Un de fora fluix (21 ºC) i un de fora fort (10 ºC). Ha de comptar el fort.
r = runE(
  [
    bany({ id: "ff", nedadorId: "a", data: "2027-02-10", metres: 1700, fora: true }),
    bany({ id: "fb", nedadorId: "a", data: "2027-02-20", metres: 1700, fora: true }),
  ],
  { "2027-02-10": { tempC: 21 }, "2027-02-20": { tempC: 10 } }
);
eq("compta el de 10 graus: 13 punts", de(r, "a").total, 13);
const feb = de(r, "a").mesos[0];
eq("el fluix queda marcat", feb.dies.find((d) => d.data === "2027-02-10").motiuFora,
  "més d'un fora de Badalona");

console.log("\n-- Cas 5c: el limit de fora es per mes --");
// Un de fora al gener i un al febrer: tots dos compten.
r = runE(
  [
    bany({ id: "g", nedadorId: "a", data: "2027-01-10", metres: 1700, fora: true }),
    bany({ id: "h", nedadorId: "a", data: "2027-02-10", metres: 1700, fora: true }),
  ],
  aigua("2027-01-10", "2027-02-10")
);
eq("11 + 11 = 22", de(r, "a").total, 22);

console.log("\n-- Cas 5d: un dia de fora descartat NO ocupa placa de les quatre --");
// Quatre dies de Badalona i dos de fora. Han de comptar els 4 de Badalona
// mes el millor de fora? No: el limit de 4 dies mana. Pero el de fora
// descartat per la seva propia regla no ha de robar lloc a cap altre.
r = runE(
  [
    ...[1, 2, 3, 4].map((d, i) =>
      bany({ id: "b" + i, nedadorId: "a", data: `2027-02-0${d}`, metres: 1700 })),
    bany({ id: "x1", nedadorId: "a", data: "2027-02-20", metres: 1700, fora: true }),
    bany({ id: "x2", nedadorId: "a", data: "2027-02-21", metres: 1700, fora: true }),
  ],
  aigua("2027-02-01", "2027-02-02", "2027-02-03", "2027-02-04", "2027-02-20", "2027-02-21")
);
eq("4 dies x 11 = 44", de(r, "a").total, 44);
eq("un descartat per fora", de(r, "a").mesos[0].descartatsPerFora, 1);
eq("un descartat pel limit de 4", de(r, "a").mesos[0].descartatsPerLimit, 1);

console.log("\n-- Cas 5e: la temperatura dels banys de fora es la de Badalona --");
// No hi ha cap camp de temperatura al bany: sempre surt de `dies`.
r = runE(
  [bany({ id: "t", nedadorId: "a", data: "2027-02-10", metres: 1700, fora: true })],
  { "2027-02-10": { tempC: 8 } }
);
eq("8 graus a Badalona = 15 punts", de(r, "a").total, 15);

console.log("\n-- Cas 6: exclusions --");
r = runE(
  [
    bany({ id: "n", nedadorId: "a", data: "2027-01-10", metres: 2000, neopre: true }),
    bany({ id: "c", nedadorId: "h", data: "2027-01-10", metres: 2000, competitiu: true }),
    bany({ id: "p", nedadorId: "j", data: "2027-01-10", metres: 2000, estat: "anullat" }),
  ],
  aigua("2027-01-10")
);
eq("neopre no suma", de(r, "a").total, 0);
eq("cursa no suma", de(r, "h").total, 0);
eq("anul·lat no suma", de(r, "j").total, 0);

console.log("\n-- Cas 7: els esmorzars obren els punts del mes --");
// Un bany de 13 graus i 1700 m = 10 punts. Sense esmorzars, no compta.
const unBany = [bany({ id: "p1", nedadorId: "a", data: "2026-11-05", metres: 1700 })];
r = run(unBany, { "2026-11-05": { tempC: 13 } });
eq("sense esmorzars, 0 al global", de(r, "a").total, 0);
eq("pero els punts hi son, en espera", de(r, "a").puntsPerduts, 10);
eq("i el mes surt bloquejat", de(r, "a").mesosBloquejats, ["2026-11"]);

r = run([...unBany, ...obreMes("a", "2026-11")],
  { "2026-11-05": { tempC: 13 }, ...obert(["2026-11-01", "2026-11-02"]) });
eq("amb 2 esmorzars, els punts entren", de(r, "a").total, 10);
eq("res en espera", de(r, "a").puntsPerduts, 0);

console.log("\n-- Cas 7b: un esmorzar no n'hi ha prou --");
r = run(
  [...unBany, bany({ id: "e1", nedadorId: "a", data: "2026-11-02", metres: 100, esmorzar: true })],
  { "2026-11-05": { tempC: 13 }, "2026-11-02": { tempC: 23 } }
);
eq("amb 1 esmorzar encara no compta", de(r, "a").total, 0);
eq("en falta un", de(r, "a").esmorzarsPerMes[0].falten, 1);

console.log("\n-- Cas 7c: la porta es per mes, no per temporada --");
// Novembre amb esmorzars, desembre sense: nomes compta el novembre.
r = run(
  [
    bany({ id: "n1", nedadorId: "a", data: "2026-11-05", metres: 1700 }),
    ...obreMes("a", "2026-11"),
    bany({ id: "d1", nedadorId: "a", data: "2026-12-05", metres: 1700 }),
  ],
  { "2026-11-05": { tempC: 13 }, "2026-12-05": { tempC: 13 },
    ...obert(["2026-11-01", "2026-11-02"]) }
);
eq("nomes els punts del novembre", de(r, "a").total, 10);
eq("els del desembre en espera", de(r, "a").puntsPerduts, 10);
eq("i nomes el desembre bloquejat", de(r, "a").mesosBloquejats, ["2026-12"]);

console.log("\n-- Cas 7d: dos banys el mateix mati son UN esmorzar --");
r = run(
  [
    bany({ id: "m1", nedadorId: "a", data: "2026-11-03", metres: 1000, esmorzar: true }),
    bany({ id: "m2", nedadorId: "a", data: "2026-11-03", metres: 1000, esmorzar: true }),
  ],
  obert(["2026-11-03"])
);
eq("un sol esmorzar al novembre", de(r, "a").esmorzarsPerMes[0].fets, 1);

console.log("\n-- Cas 10: bonificacions --");
const mods = [
  { id: "tauro", nom: "He vist un tauró", punts: 10 },
  { id: "dofi", nom: "He vist un dofí", punts: 10 },
  { id: "medusa", nom: "M'ha picat una medusa", punts: 1 },
];
const runM = (banys, dies, avui = "2027-04-05") => {
  const [b2, d2] = ambEsmorzars(banys, dies);
  return calcularClassificacio({ banys: b2, dies: d2, nedadors, temporada, avui,
    config: { modificadors: mods } });
};
eq("suma dues bonificacions", puntsModificadors(["tauro", "medusa"], { modificadors: mods }), 11);
eq("una que no existeix val 0", puntsModificadors(["cranc"], { modificadors: mods }), 0);
eq("cap bonificacio val 0", puntsModificadors([], { modificadors: mods }), 0);

// 13 graus = 10 punts, 1700 m = x1, mes un dofi = +10  ->  20
r = runM(
  [bany({ id: "b1", nedadorId: "a", data: "2027-01-10", metres: 1700, modificadors: ["dofi"] })],
  { "2027-01-10": { tempC: 13 } }
);
eq("10 + 10 = 20", de(r, "a").total, 20);

console.log("\n-- Cas 10b: les bonificacions son PLANES --");
// No es multipliquen pel coeficient: 800 m fa x0,5 nomes sobre la temperatura.
r = runM(
  [bany({ id: "b2", nedadorId: "a", data: "2027-01-10", metres: 800, modificadors: ["dofi"] })],
  { "2027-01-10": { tempC: 13 } }
);
eq("10 x 0,5 + 10 = 15", de(r, "a").total, 15);

// Ni es dupliquen els dies dobles.
r = runM(
  [bany({ id: "b3", nedadorId: "a", data: "2027-01-01", metres: 1700, modificadors: ["dofi"] })],
  { "2027-01-01": { tempC: 13 } }
);
eq("(10 x 2) + 10 = 30, no 40", de(r, "a").total, 30);

console.log("\n-- Cas 10c: no es poden collir bonificacions amb neopre --");
r = runM(
  [bany({ id: "b4", nedadorId: "a", data: "2027-01-10", metres: 1700,
          neopre: true, modificadors: ["tauro"] })],
  { "2027-01-10": { tempC: 13 } }
);
eq("amb neopre no suma ni la bonificacio", de(r, "a").total, 0);

console.log("\n-- Cas 10d: dues bonificacions el mateix bany --");
r = runM(
  [bany({ id: "b5", nedadorId: "a", data: "2027-01-10", metres: 1700,
          modificadors: ["tauro", "medusa"] })],
  { "2027-01-10": { tempC: 13 } }
);
eq("10 + 10 + 1 = 21", de(r, "a").total, 21);
eq("les dues surten al detall",
  de(r, "a").mesos[0].dies.find((d) => d.data === "2027-01-10").extres.map((m) => m.id),
  ["tauro", "medusa"]);

console.log("\n-- Cas 10e: una bonificacio pot salvar un dia del limit de 4 --");
// Cinc dies iguals al gener; el cinque porta un tauro i ha d'entrar.
r = runM(
  [
    ...[5, 6, 7, 8].map((d, i) =>
      bany({ id: "c" + i, nedadorId: "a", data: `2027-01-0${d}`, metres: 1700 })),
    bany({ id: "ct", nedadorId: "a", data: "2027-01-09", metres: 1700, modificadors: ["tauro"] }),
  ],
  aigua("2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09")
);
// 12 graus = 11 punts. El del tauro val 21 i desbanca un dels de 11.
eq("21 + 11 x 3 = 54", de(r, "a").total, 54);

console.log("\n-- Cas 8: dies i metres compten tot --");
r = runE(
  [
    bany({ id: "v1", nedadorId: "a", data: "2027-01-10", metres: 2000, neopre: true }),
    bany({ id: "v2", nedadorId: "a", data: "2027-01-11", metres: 1000, fora: true }),
    bany({ id: "v3", nedadorId: "a", data: "2027-01-12", metres: 1000, fora: true }),
  ],
  aigua("2027-01-10", "2027-01-11", "2027-01-12")
);
eq("3 dies nedats", de(r, "a").diesNedats, 3);
eq("4000 metres", de(r, "a").metresNedats, 4000);
eq("pero a l'absoluta nomes un de fora", de(r, "a").total, 5.5);

console.log("\n-- Cas 9: ordre de les tres classificacions --");
r = runE(
  [
    bany({ id: "o1", nedadorId: "a", data: "2027-01-10", metres: 2000 }),
    bany({ id: "o2", nedadorId: "h", data: "2027-01-10", metres: 1000, neopre: true }),
    bany({ id: "o3", nedadorId: "h", data: "2027-01-11", metres: 1000, neopre: true }),
    bany({ id: "o4", nedadorId: "h", data: "2027-01-12", metres: 1000, neopre: true }),
  ],
  aigua("2027-01-10", "2027-01-11", "2027-01-12")
);
eq("Anna guanya l'absoluta", ordenar(r, "absoluta")[0].nedador.nom, "Anna");
eq("Hugo guanya els dies", ordenar(r, "dies")[0].nedador.nom, "Hugo");
eq("Hugo guanya els metres", ordenar(r, "metres")[0].nedador.nom, "Hugo");

console.log(`\n${pass} correctes, ${fail} errors\n`);
process.exit(fail ? 1 : 0);
