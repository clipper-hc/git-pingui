const { calcularClassificacio, ordenar, puntsTemperatura, coeficientDistancia, esDiaDoble } = require("./scoring.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};

console.log("\n-- Taula de temperatures (reglament) --");
eq("20 graus -> 0", puntsTemperatura(20), 0);
eq("19 graus -> 1", puntsTemperatura(19), 1);
eq("16 graus -> 4", puntsTemperatura(16), 4);
eq("13 graus -> 7", puntsTemperatura(13), 7);
eq("10 graus -> 10", puntsTemperatura(10), 10);
eq("9,9 graus -> 15", puntsTemperatura(9.9), 15);
eq("8 graus -> 15", puntsTemperatura(8), 15);
eq("sense temperatura -> null", puntsTemperatura(null), null);
eq("14,4 arrodoneix a 14 -> 6", puntsTemperatura(14.4), 6);
eq("14,6 arrodoneix a 15 -> 5", puntsTemperatura(14.6), 5);

console.log("\n-- Coeficient de distancia --");
eq("900 m -> 0,5", coeficientDistancia(900), 0.5);
eq("1399 m -> 0,5", coeficientDistancia(1399), 0.5);
eq("1500 m -> 1", coeficientDistancia(1500), 1);
eq("1600 m -> 1", coeficientDistancia(1600), 1);
eq("2000 m -> 1,5", coeficientDistancia(2000), 1.5);

console.log("\n-- Dies dobles --");
eq("31 desembre", esDiaDoble("2026-12-31"), true);
eq("1 gener", esDiaDoble("2027-01-01"), true);
eq("dia normal", esDiaDoble("2027-01-15"), false);
eq("dia sorpresa marcat", esDiaDoble("2027-01-15", { "2027-01-15": true }), true);

const temporada = { inici: "2026-11-01", fi: "2027-03-31" };
const nedadors = [{ id: "a", nom: "Anna" }, { id: "h", nom: "Hugo" }, { id: "j", nom: "Jordi" }];
const run = (banys, dies) =>
  calcularClassificacio({ banys, dies, nedadors, temporada });
const bany = (o) => ({ estat: "aprovat", neopre: false, competitiu: false,
                       esmorzar: false, ...o });
const de = (res, id) => res.find((r) => r.nedador.id === id);

console.log("\n-- Cas 1: un sol bany --");
// 13 graus = 7 punts, 2000 m = x1,5  ->  10,5
let r = run(
  [bany({ id: "1", nedadorId: "a", data: "2027-01-10", metres: 2000 })],
  { "2027-01-10": { tempC: 13 } }
);
eq("7 x 1,5 = 10,5", de(r, "a").total, 10.5);

console.log("\n-- Cas 2: dia doble de Cap d'Any --");
// 11 graus = 9 punts, 1500 m = x1, dia 1 de gener = x2  ->  18
r = run(
  [bany({ id: "1", nedadorId: "a", data: "2027-01-01", metres: 1500 })],
  { "2027-01-01": { tempC: 11 } }
);
eq("9 x 1 x 2 = 18", de(r, "a").total, 18);

console.log("\n-- Cas 3: aigua sota 10 graus, distancia curta --");
// <10 graus = 15 punts fixos, 800 m = x0,5  ->  7,5
r = run(
  [bany({ id: "1", nedadorId: "a", data: "2027-02-05", metres: 800 })],
  { "2027-02-05": { tempC: 9 } }
);
eq("15 x 0,5 = 7,5", de(r, "a").total, 7.5);

console.log("\n-- Cas 4: limit de 4 dies per mes --");
// Cinc banys identics al gener (12 graus = 8 punts, 1500 m = x1 -> 8 cadascun).
// Nomes compten els 4 millors: 32, no 40.
r = run(
  [5, 6, 7, 8, 9].map((d, i) =>
    bany({ id: "b" + i, nedadorId: "a", data: `2027-01-0${d}`, metres: 1500 })
  ),
  Object.fromEntries([5, 6, 7, 8, 9].map((d) => [`2027-01-0${d}`, { tempC: 12 }]))
);
eq("4 millors dies = 32", de(r, "a").total, 32);
eq("cinc dies registrats", de(r, "a").diesTotals, 5);
eq("un dia descartat pel limit", de(r, "a").mesos[0].descartatsPerLimit, 1);

console.log("\n-- Cas 5: el limit tria els millors, no els primers --");
// Quatre dies fluixos (19 graus, 800 m = 1 x 0,5 = 0,5) i despres un dia fort
// (8 graus, 2000 m = 15 x 1,5 = 22,5). El dia fort ha d'entrar i fer fora un fluix.
r = run(
  [
    ...[1, 2, 3, 4].map((d, i) =>
      bany({ id: "f" + i, nedadorId: "a", data: `2027-02-0${d}`, metres: 800 })
    ),
    bany({ id: "fort", nedadorId: "a", data: "2027-02-20", metres: 2000 }),
  ],
  {
    ...Object.fromEntries([1, 2, 3, 4].map((d) => [`2027-02-0${d}`, { tempC: 19 }])),
    "2027-02-20": { tempC: 8 },
  }
);
eq("22,5 + 0,5 x 3 = 24", de(r, "a").total, 24);
const feb = de(r, "a").mesos[0];
eq("el dia fort compta", feb.dies.find((d) => d.data === "2027-02-20").compta, true);
eq("un dels fluixos queda fora", feb.dies.filter((d) => !d.compta).length, 1);

console.log("\n-- Cas 6: el limit es per mes, no per temporada --");
// Quatre dies el gener i quatre el febrer: tots vuit compten.
// S'eviten l'1 de gener i el 31 de desembre, que doblen.
r = run(
  [
    ...[5, 6, 7, 8].map((d, i) => bany({ id: "g" + i, nedadorId: "a", data: `2027-01-0${d}`, metres: 1500 })),
    ...[5, 6, 7, 8].map((d, i) => bany({ id: "h" + i, nedadorId: "a", data: `2027-02-0${d}`, metres: 1500 })),
  ],
  Object.fromEntries(
    [...[5, 6, 7, 8].map((d) => `2027-01-0${d}`), ...[5, 6, 7, 8].map((d) => `2027-02-0${d}`)]
      .map((k) => [k, { tempC: 12 }])
  )
);
eq("8 dies x 8 punts = 64", de(r, "a").total, 64);

console.log("\n-- Cas 6b: el doble de Cap d'Any conviu amb el limit mensual --");
// Gener: dies 1, 5, 6, 7, 8 a 12 graus i 1500 m. L'1 de gener val 16, la resta 8.
// Els 4 millors dies: 16 + 8 + 8 + 8 = 40.
r = run(
  [1, 5, 6, 7, 8].map((d, i) => bany({ id: "k" + i, nedadorId: "a", data: `2027-01-0${d}`, metres: 1500 })),
  Object.fromEntries([1, 5, 6, 7, 8].map((d) => [`2027-01-0${d}`, { tempC: 12 }]))
);
eq("16 + 8 + 8 + 8 = 40", de(r, "a").total, 40);
eq("l'1 de gener sempre compta", de(r, "a").mesos[0].dies.find((d) => d.data === "2027-01-01").compta, true);

console.log("\n-- Cas 7: dos banys el mateix dia son UN dia --");
// 1000 m + 1000 m el mateix dia a 12 graus. Es sumen (8x0,5 + 8x0,5 = 8)
// pero consumeixen una sola de les 4 places del mes.
r = run(
  [
    bany({ id: "m1", nedadorId: "a", data: "2027-01-10", metres: 1000 }),
    bany({ id: "m2", nedadorId: "a", data: "2027-01-10", metres: 1000 }),
  ],
  { "2027-01-10": { tempC: 12 } }
);
eq("4 + 4 = 8 punts", de(r, "a").total, 8);
eq("compta com un sol dia", de(r, "a").diesTotals, 1);

console.log("\n-- Cas 8: exclusions --");
r = run(
  [
    bany({ id: "n", nedadorId: "a", data: "2027-01-10", metres: 2000, neopre: true }),
    bany({ id: "c", nedadorId: "h", data: "2027-01-10", metres: 2000, competitiu: true }),
    bany({ id: "p", nedadorId: "j", data: "2027-01-10", metres: 2000, estat: "anullat" }),
  ],
  { "2027-01-10": { tempC: 12 } }
);
eq("neopre no suma", de(r, "a").total, 0);
eq("prova competitiva no suma", de(r, "h").total, 0);
eq("anul·lat no suma", de(r, "j").total, 0);
eq("motiu del neopre", de(r, "a").descartats[0].motiu, "neoprè".normalize("NFC"));

console.log("\n-- Cas 9: fora de temporada i sense temperatura --");
r = run(
  [
    bany({ id: "x", nedadorId: "a", data: "2026-10-31", metres: 2000 }),
    bany({ id: "y", nedadorId: "h", data: "2027-01-10", metres: 2000 }),
  ],
  { "2026-10-31": { tempC: 12 }, "2027-01-10": {} }
);
eq("31 octubre fora de temporada", de(r, "a").total, 0);
eq("motiu fora de temporada", de(r, "a").descartats[0].motiu, "fora de temporada");
eq("sense temperatura no puntua encara", de(r, "h").total, 0);
eq("motiu sense temperatura", de(r, "h").descartats[0].motiu, "sense temperatura");

console.log("\n-- Cas 10: dia sorpresa marcat pels coordinadors --");
r = run(
  [bany({ id: "s", nedadorId: "a", data: "2027-02-11", metres: 1500 })],
  { "2027-02-11": { tempC: 12, doble: true } }
);
eq("8 x 2 = 16", de(r, "a").total, 16);

console.log("\n-- Cas 11: esmorzars, reportats pel mateix nedador --");
r = run(
  [
    bany({ id: "e1", nedadorId: "a", data: "2027-01-10", metres: 1500, esmorzar: true }),
    bany({ id: "e2", nedadorId: "h", data: "2027-01-10", metres: 1500, esmorzar: true }),
    bany({ id: "e3", nedadorId: "h", data: "2027-01-17", metres: 1500, esmorzar: true }),
  ],
  { "2027-01-10": { tempC: 12 }, "2027-01-17": { tempC: 12 } }
);
eq("Anna: 1 esmorzar, no elegible", de(r, "a").elegible, false);
eq("Hugo: 2 esmorzars, elegible", de(r, "h").elegible, true);
eq("recompte d'Anna", de(r, "a").esmorzars, 1);

console.log("\n-- Cas 11b: dos banys el mateix mati son UN esmorzar --");
r = run(
  [
    bany({ id: "x1", nedadorId: "a", data: "2027-01-10", metres: 1000, esmorzar: true }),
    bany({ id: "x2", nedadorId: "a", data: "2027-01-10", metres: 1000, esmorzar: true }),
    bany({ id: "x3", nedadorId: "a", data: "2027-01-24", metres: 1000, esmorzar: true }),
  ],
  { "2027-01-10": { tempC: 12 }, "2027-01-24": { tempC: 12 } }
);
eq("2 esmorzars, no 3", de(r, "a").esmorzars, 2);

console.log("\n-- Cas 11c: l'esmorzar compta encara que el bany no puntui --");
// Va amb neopre: el bany no suma punts, pero a esmorzar hi va anar igual.
r = run(
  [
    bany({ id: "y1", nedadorId: "a", data: "2027-01-10", metres: 1500, neopre: true, esmorzar: true }),
    bany({ id: "y2", nedadorId: "a", data: "2027-01-17", metres: 1500, neopre: true, esmorzar: true }),
  ],
  { "2027-01-10": { tempC: 12 }, "2027-01-17": { tempC: 12 } }
);
eq("0 punts amb neopre", de(r, "a").total, 0);
eq("pero 2 esmorzars i elegible", de(r, "a").elegible, true);

console.log("\n-- Cas 11d: un bany anul·lat no dona esmorzar --");
r = run(
  [bany({ id: "z1", nedadorId: "a", data: "2027-01-10", metres: 1500, esmorzar: true, estat: "anullat" })],
  { "2027-01-10": { tempC: 12 } }
);
eq("cap esmorzar", de(r, "a").esmorzars, 0);

console.log("\n-- Cas 13: classificacions de dies i de metres --");
// El neopre no puntua a l'absoluta pero SI que compta com a dia i com a metres.
r = run(
  [
    // Anna: 1 dia sense neopre, 2000 m -> puntua
    bany({ id: "d1", nedadorId: "a", data: "2027-01-10", metres: 2000 }),
    // Hugo: 3 dies amb neopre, 1000 m cadascun -> 0 punts, 3 dies, 3000 m
    bany({ id: "d2", nedadorId: "h", data: "2027-01-10", metres: 1000, neopre: true }),
    bany({ id: "d3", nedadorId: "h", data: "2027-01-11", metres: 1000, neopre: true }),
    bany({ id: "d4", nedadorId: "h", data: "2027-01-12", metres: 1000, neopre: true }),
    // Jordi: 1 dia, 2 banys, prova competitiva -> 0 punts, 1 dia, 3000 m
    bany({ id: "d5", nedadorId: "j", data: "2027-01-10", metres: 1500, competitiu: true }),
    bany({ id: "d6", nedadorId: "j", data: "2027-01-10", metres: 1500, competitiu: true }),
  ],
  Object.fromEntries(["2027-01-10","2027-01-11","2027-01-12"].map((d) => [d, { tempC: 12 }]))
);
eq("Anna guanya l'absoluta", de(r, "a").total, 12);
eq("Hugo no puntua a l'absoluta", de(r, "h").total, 0);
eq("Hugo te 3 dies nedats", de(r, "h").diesNedats, 3);
eq("Anna te 1 dia nedat", de(r, "a").diesNedats, 1);
eq("Jordi: 2 banys el mateix dia = 1 dia", de(r, "j").diesNedats, 1);
eq("Jordi: 3000 m", de(r, "j").metresNedats, 3000);
eq("Hugo: 3000 m", de(r, "h").metresNedats, 3000);

eq("ordre absoluta", ordenar(r, "absoluta").map((x) => [x.posicio, x.nedador.nom]),
  [[1, "Anna"], [2, "Hugo"], [2, "Jordi"]]);
// Anna i Jordi empaten a 1 dia i comparteixen la posició 2; entre ells
// s'ordenen pels metres, que és el desempat d'aquesta classificació.
eq("ordre per dies", ordenar(r, "dies").map((x) => [x.posicio, x.nedador.nom]),
  [[1, "Hugo"], [2, "Jordi"], [2, "Anna"]]);
eq("ordre per metres", ordenar(r, "metres").map((x) => [x.posicio, x.nedador.nom]),
  [[1, "Hugo"], [1, "Jordi"], [3, "Anna"]]);

console.log("\n-- Cas 14: fora de temporada no compta enlloc --");
r = run(
  [bany({ id: "f1", nedadorId: "a", data: "2026-10-15", metres: 3000, esmorzar: true })],
  { "2026-10-15": { tempC: 12 } }
);
eq("ni dies", de(r, "a").diesNedats, 0);
eq("ni metres", de(r, "a").metresNedats, 0);
eq("ni esmorzars", de(r, "a").esmorzars, 0);

console.log("\n-- Cas 12: ordre i empats --");
r = run(
  [
    bany({ id: "p1", nedadorId: "a", data: "2027-01-10", metres: 2000 }), // 8 x 1,5 = 12
    bany({ id: "p2", nedadorId: "h", data: "2027-01-10", metres: 1500 }), // 8 x 1   =  8
    bany({ id: "p3", nedadorId: "j", data: "2027-01-10", metres: 1500 }), // 8 x 1   =  8
  ],
  { "2027-01-10": { tempC: 12 } }
);
eq("classificacio ordenada", r.map((x) => [x.posicio, x.nedador.nom, x.total]),
  [[1, "Anna", 12], [2, "Hugo", 8], [2, "Jordi", 8]]);

console.log(`\n${pass} correctes, ${fail} errors\n`);
process.exit(fail ? 1 : 0);
