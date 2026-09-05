/* Prova el parser de l'AEMET contra una resposta real de l'API, desada a
   aemet-exemple.json. No necessita xarxa ni clau.        node scripts/test-aemet.mjs */
import { readFileSync } from "node:fs";
import { llegirDies } from "./aemet.mjs";

let ok = 0, ko = 0;
const eq = (nom, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log(`  ok   ${nom}`); }
  else { ko++; console.log(`  FAIL ${nom}\n         rebut  ${g}\n         esperat ${w}`); }
};

const real = JSON.parse(readFileSync(new URL("./aemet-exemple.json", import.meta.url)));

console.log("\n-- Resposta real de la Platja del Centre (5 de setembre de 2026) --");
eq("tres dies amb temperatura", llegirDies(real),
  [{ data: "2026-09-05", temp: 29 },
   { data: "2026-09-06", temp: 28 },
   { data: "2026-09-07", temp: 29 }]);

console.log("\n-- Variants que ha d'aguantar igualment --");
const amb = (dia) => llegirDies([{ prediccion: { dia: [dia] } }]);
eq("data ISO en comptes de número",
  amb({ fecha: "2026-12-24T00:00:00", tAgua: { valor1: 12 } }),
  [{ data: "2026-12-24", temp: 12 }]);
eq("només tagua en minúscules",
  amb({ fecha: 20261224, tagua: { valor1: 11 } }),
  [{ data: "2026-12-24", temp: 11 }]);
eq("valor en comptes de valor1",
  amb({ fecha: 20261224, tAgua: { valor: 11 } }),
  [{ data: "2026-12-24", temp: 11 }]);
eq("decimal amb coma", amb({ fecha: 20261224, tAgua: { valor1: "11,5" } }),
  [{ data: "2026-12-24", temp: 11.5 }]);

console.log("\n-- Dies que s'han de descartar --");
eq("sense tAgua", amb({ fecha: 20261224, tMaxima: { valor1: 14 } }), []);
eq("tAgua buida", amb({ fecha: 20261224, tAgua: { value: "", valor1: "" } }), []);
eq("resposta sense predicció", llegirDies([{ nombre: "Del Centre" }]), []);
eq("resposta buida", llegirDies([]), []);

console.log(`\n${ok} correctes, ${ko} errors\n`);
process.exit(ko ? 1 : 0);
