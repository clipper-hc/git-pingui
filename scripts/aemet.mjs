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

const PLATJA = "0801502";           // Platja del Centre, Badalona
const { AEMET_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!AEMET_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Falten variables d'entorn: AEMET_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const json = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url.split("?")[0]}`);
  return r.json();
};

/* L'AEMET respon en dos passos: primer una fitxa amb l'URL real de les dades. */
async function temperaturesAemet() {
  const fitxa = await json(
    `https://opendata.aemet.es/opendata/api/prediccion/especifica/playa/${PLATJA}`,
    { headers: { api_key: AEMET_API_KEY } }
  );
  if (!fitxa.datos) throw new Error(`l'AEMET no ha donat dades: ${fitxa.descripcion || fitxa.estado}`);
  const dades = await json(fitxa.datos);
  const dies = (dades[0] && dades[0].prediccion && dades[0].prediccion.dia) || [];

  return dies.map((d) => {
    const f = String(d.fecha);
    const data = /^\d{8}$/.test(f)
      ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`
      : f.slice(0, 10);
    const camp = d.tAgua || d.tagua;
    const brut = camp && (camp.valor1 ?? camp.valor ?? camp.value);
    const temp = brut === undefined || brut === null || brut === ""
      ? null : Number(String(brut).replace(",", "."));
    return { data, temp };
  }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.data) && x.temp !== null && !Number.isNaN(x.temp));
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
  const lectures = await temperaturesAemet();
  if (!lectures.length) { console.log("L'AEMET no dona temperatura de l'aigua ara mateix."); return; }

  // No trepitgem el que els coordinadors han fixat a mà.
  const dates = lectures.map((l) => l.data);
  const existents = await rest(
    `dies?data=in.(${dates.join(",")})&select=data,font,temp_c`);
  const aMa = new Set(existents.filter((d) => d.font === "manual").map((d) => d.data));

  const files = lectures
    .filter((l) => !aMa.has(l.data))
    .map((l) => ({ data: l.data, temp_c: l.temp, font: "aemet" }));

  if (!files.length) { console.log("Tots els dies ja estan fixats a mà. Res a fer."); return; }

  await rest("dies?on_conflict=data", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(files),
  }).catch((e) => { throw new Error(`no s'ha pogut desar a Supabase: ${e.message}`); });

  console.log(`Desats ${files.length} dies:`);
  files.forEach((f) => console.log(`  ${f.data}  ${f.temp_c} ºC`));
  if (aMa.size) console.log(`Respectats ${aMa.size} dies fixats a mà.`);
};

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
