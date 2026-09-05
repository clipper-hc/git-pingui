/* ══════════════════════════════════════════════════════════════════════════
   Temperatura de l'aigua de la Platja del Centre (Badalona) → Supabase.

   Llegeix l'API oberta de l'AEMET, que dona la temperatura de l'aigua per als
   propers dies, i la desa a la taula `dies`. Els dies que un coordinador ha
   fixat a mà (font = 'manual') no es toquen mai: el reglament diu que la
   temperatura la fixen els coordinadors, i aquest script només els estalvia
   la consulta.

   Variables d'entorn necessàries:
     AEMET_API_KEY            clau gratuïta de https://opendata.aemet.es
     SUPABASE_URL             https://xxxx.supabase.co
     SUPABASE_SERVICE_KEY     clau service_role (mai la posis al navegador)
   ══════════════════════════════════════════════════════════════════════════ */

import { appendFileSync } from "node:fs";

const PLATJA = "0801502";           // Platja del Centre, Badalona
const { AEMET_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

/* La comprovació va dins del main i no aquí dalt, perquè el fitxer també
   s'importa des de test-aemet.mjs, que prova el parser sense claus. */
function comprovarEntorn() {
  const falten = Object.entries({ AEMET_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY })
    .filter(([, v]) => !v).map(([k]) => k);
  if (falten.length) {
    resum(`## No hi ha res a fer\n\nFalten aquests secrets al repositori: **${falten.join("**, **")}**.`);
    resum("\nSettings → Secrets and variables → Actions. Els noms distingeixen majúscules.");
    console.error("Falten variables d'entorn: " + falten.join(", "));
    process.exit(1);
  }
  // Un error de còpia molt fàcil de fer i molt difícil de veure.
  if (SUPABASE_URL.endsWith("/")) {
    resum("## Atenció\n\n`SUPABASE_URL` acaba amb barra. Ha de ser `https://xxxx.supabase.co`, sense res més.");
  }
}

/* Dues coses que costen una tarda si no es fan aquí:
     · Una escriptura correcta a PostgREST amb `return=minimal` respon 204
       sense cos. Fer-ne r.json() peta, i el treball ja estava fet.
     · Quan Supabase rebutja alguna cosa, el motiu va DINS del cos. Sense
       llegir-lo només es veu "400 Bad Request", que no diu res. */
/* Escriu el resultat al resum de l'execució de GitHub, que surt a la PORTADA
   del run i no cal desplegar cap pas per llegir-lo. Fora de GitHub, no fa res
   i el missatge ja ha anat a la consola. */
const linies = [];
function resum(text) {
  linies.push(text);
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) { try { appendFileSync(f, text + "\n"); } catch (e) { /* tant se val */ } }
}

const json = async (url, opts) => {
  const r = await fetch(url, opts);
  const cos = await r.text();
  if (!r.ok) {
    let motiu = cos.slice(0, 400);
    try { const j = JSON.parse(cos); motiu = j.message || j.error || j.hint || motiu; } catch (e) { /* text pla */ }
    throw new Error(`${r.status} ${r.statusText} — ${url.split("?")[0]}\n         ${motiu}`);
  }
  if (!cos.trim()) return null;          // 204 No Content: correcte i buit
  try { return JSON.parse(cos); }
  catch (e) { throw new Error(`resposta que no és JSON de ${url.split("?")[0]}: ${cos.slice(0, 200)}`); }
};

/* Tradueix la resposta de l'AEMET a [{ data:"YYYY-MM-DD", temp }].

   Dues coses d'aquest format que no són òbvies i que val la pena deixar
   escrites, perquè totes dues fallaven en silenci:
     · `fecha` és un NÚMERO de vuit xifres, 20260905, no una data ISO.
     · la temperatura és `tAgua.valor1`, no `tAgua.valor`. L'AEMET a més
       emet el camp dues vegades, com a `tAgua` i com a `tagua`.
   Exportada a part de la crida perquè es pugui provar sense xarxa, contra
   `aemet-exemple.json`, que és una resposta real. */
export function llegirDies(dades) {
  const dies = (dades[0] && dades[0].prediccion && dades[0].prediccion.dia) || [];

  return dies.map((d) => {
    const f = String(d.fecha);
    const data = /^\d{8}$/.test(f)
      ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`   // 20260905
      : f.slice(0, 10);                                        // 2026-09-05T00:00:00
    const camp = d.tAgua || d.tagua;
    const brut = camp && (camp.valor1 ?? camp.valor ?? camp.value);
    const temp = brut === undefined || brut === null || brut === ""
      ? null : Number(String(brut).replace(",", "."));
    return { data, temp };
  }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.data) && x.temp !== null && !Number.isNaN(x.temp));
}

/* L'AEMET respon en dos passos: primer una fitxa amb l'URL real de les dades. */
async function temperaturesAemet() {
  const fitxa = await json(
    `https://opendata.aemet.es/opendata/api/prediccion/especifica/playa/${PLATJA}`,
    { headers: { api_key: AEMET_API_KEY } }
  );
  if (!fitxa.datos) throw new Error(`l'AEMET no ha donat dades: ${fitxa.descripcion || fitxa.estado}`);
  const dades = await json(fitxa.datos);
  const lectures = llegirDies(dades);

  // Si arriben dies però cap amb temperatura, el format ha canviat. Val més
  // dir-ho fort que no pas acabar amb un "no hi ha dades" que no ho és.
  const nDies = (dades[0] && dades[0].prediccion && dades[0].prediccion.dia || []).length;
  if (nDies && !lectures.length) {
    console.error(`L'AEMET ha donat ${nDies} dies però no n'he pogut llegir cap temperatura.`);
    console.error("Sembla un canvi de format. Primer dia rebut, per mirar-lo:");
    console.error(JSON.stringify(dades[0].prediccion.dia[0], null, 2));
  }
  return lectures;
}

const rest = (cami, opts = {}) => json(`${SUPABASE_URL}/rest/v1/${cami}`, {
  ...opts,
  headers: {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...opts.headers,
  },
});

const main = async () => {
  comprovarEntorn();
  const lectures = await temperaturesAemet();
  console.log(`L'AEMET dona ${lectures.length} dies amb temperatura de l'aigua:`);
  lectures.forEach((l) => console.log(`  ${l.data}  ${l.temp} ºC`));
  if (!lectures.length) return;
  console.log(`Escrivint a ${SUPABASE_URL}/rest/v1/dies ...`);

  // No trepitgem el que els coordinadors han fixat a mà.
  const dates = lectures.map((l) => l.data);
  const existents = await rest(
    `dies?data=in.(${dates.join(",")})&select=data,font,temp_c`);
  const aMa = new Set((existents || []).filter((d) => d.font === "manual").map((d) => d.data));

  const files = lectures
    .filter((l) => !aMa.has(l.data))
    .map((l) => ({ data: l.data, temp_c: l.temp, font: "aemet" }));

  if (!files.length) {
    resum("\nTots aquests dies ja estaven fixats a mà pels coordinadors. No s'ha tocat res.");
    console.log("Tots els dies ja estan fixats a mà. Res a fer.");
    return;
  }

  await rest("dies?on_conflict=data", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(files),
  }).catch((e) => { throw new Error(`no s'ha pogut desar a Supabase: ${e.message}`); });

  resum(`\n**Desats ${files.length} dies a la taula \`dies\`.**`);
  if (aMa.size) resum(`Respectats ${aMa.size} dies que els coordinadors havien fixat a mà.`);
  console.log(`Desats ${files.length} dies:`);
  files.forEach((f) => console.log(`  ${f.data}  ${f.temp_c} ºC`));
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => {
    resum(`## Ha fallat\n\n\`\`\`\n${e.message}\n\`\`\``);
    console.error("Error:", e.message);
    process.exit(1);
  });
}
