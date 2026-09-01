/* ══════════════════════════════════════════════════════════════════════════
   COPA PINGÜÍ DE BADALONA — aplicació
   Un sol fitxer, sense framework. Dos modes:
     · demostració  — dades d'exemple a la memòria del navegador
     · Supabase     — dades reals, si SUPABASE_URL i SUPABASE_ANON_KEY tenen valor

   La classificació la pot mirar tothom. Per apuntar-hi banys cal entrar amb
   Google o amb un enllaç per correu. Els banys compten de seguida: ningú no
   els valida. La temperatura de l'aigua ve de l'AEMET.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
"use strict";

const LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MESOS = ["gener","febrer","març","abril","maig","juny","juliol","agost",
               "setembre","octubre","novembre","desembre"];

/* ── Estat ─────────────────────────────────────────────────────────────── */
const S = {
  temporada: { ...TEMPORADA },
  nedadors: [], banys: [], dies: {}, esmorzars: [],
  config: { pontMin: 1400, pontMax: 1600 },
  usuari: null,      // sessió de Supabase
  jo: null,          // la meva fitxa de nedador
  coordinador: false,
  vista: "board",
  obert: null,       // fila desplegada de la classificació
};

/* ── Color de l'aigua ──────────────────────────────────────────────────────
   Una sola rampa, de turquesa pàl·lid a violeta fred. És l'única escala
   semàntica de l'app; el taronja queda reservat per a les accions. */
function colorAigua(t) {
  if (t === null || t === undefined || Number.isNaN(t)) return "var(--line)";
  const u = Math.min(1, Math.max(0, (20 - t) / 12));
  return `hsl(${(188 + u * 70).toFixed(0)} ${(30 + u * 32).toFixed(0)}% ${(60 - u * 15).toFixed(0)}%)`;
}
const fmtPunts = (n) => (Math.round(n * 100) / 100).toLocaleString("ca-ES");
const fmtTemp  = (t) => (t === null || t === undefined) ? "—" : `${t.toLocaleString("ca-ES")} ºC`;
const fmtDia   = (d) => { const [, m, x] = d.split("-"); return `${+x} ${MESOS[+m-1].slice(0,3)}`; };
const fmtDiaLl = (d) => { const [y, m, x] = d.split("-"); return `${+x} de ${MESOS[+m-1]} de ${y}`; };
const fmtMes   = (m) => { const [y, mm] = m.split("-"); return `${MESOS[+mm-1]} ${y}`; };
const avui     = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

/* ══ CAPA DE DADES ═══════════════════════════════════════════════════════ */
let sb = null;

async function carregar() {
  if (!LIVE) return demoCarregar();
  const [ned, ban, dia, esm, cfg] = await Promise.all([
    sb.from("nedadors").select("*").order("nom"),
    sb.from("banys").select("*").order("data"),
    sb.from("dies").select("*"),
    sb.from("esmorzars").select("*").order("data"),
    sb.from("config").select("*").eq("id", 1).maybeSingle(),
  ]);
  const err = [ned, ban, dia, esm].find((r) => r.error);
  if (err) throw new Error(err.error.message);
  S.nedadors = ned.data.map((n) => ({
    id: n.id, nom: n.nom, userId: n.user_id, esCoordinador: n.es_coordinador }));
  S.banys = ban.data.map((b) => ({
    id: b.id, nedadorId: b.nedador_id, data: b.data, metres: b.metres,
    neopre: b.neopre, competitiu: b.competitiu, nota: b.nota, estat: b.estat,
  }));
  S.dies = Object.fromEntries(dia.data.map((d) =>
    [d.data, { tempC: d.temp_c === null ? null : Number(d.temp_c), doble: d.doble, font: d.font }]));
  S.esmorzars = esm.data.map((e) => ({ id: e.id, data: e.data, assistents: e.assistents || [] }));
  if (cfg && cfg.data) S.config = { pontMin: cfg.data.pont_min, pontMax: cfg.data.pont_max };
  reconeixerme();
}

/* Lliga la sessió amb la fitxa de nedador. */
function reconeixerme() {
  if (!S.usuari) { S.jo = null; S.coordinador = false; return; }
  S.jo = S.nedadors.find((n) => n.userId === S.usuari.id) || null;
  S.coordinador = Boolean(S.jo && S.jo.esCoordinador);
}

const api = {
  async apuntarMe(nom) {
    if (!LIVE) {
      S.jo = { id: "jo", nom, userId: S.usuari.id, esCoordinador: true };
      S.nedadors.push(S.jo); S.coordinador = true; return demoDesar();
    }
    const { error } = await sb.from("nedadors")
      .insert({ user_id: S.usuari.id, nom, correu: S.usuari.email });
    if (error) throw new Error(error.message);
    await carregar();
  },
  async apuntarBany(b) {
    if (!LIVE) { S.banys.push({ ...b, id: "d" + Date.now() }); return demoDesar(); }
    const { error } = await sb.from("banys").insert({
      nedador_id: b.nedadorId, data: b.data, metres: b.metres,
      neopre: b.neopre, competitiu: b.competitiu, nota: b.nota, estat: "aprovat",
    });
    if (error) throw new Error(error.code === "23505"
      ? "Ja tens apuntat aquest bany." : error.message);
    await carregar();
  },
  async esborrarBany(id) {
    S.banys = S.banys.filter((b) => b.id !== id);
    if (!LIVE) return demoDesar();
    const { error } = await sb.from("banys").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
  async canviarEstat(id, estat) {
    const b = S.banys.find((x) => x.id === id); if (b) b.estat = estat;
    if (!LIVE) return demoDesar();
    const { error } = await sb.from("banys").update({ estat }).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async desarDia(data, tempC, doble) {
    S.dies[data] = { tempC, doble, font: "manual" };
    if (!LIVE) return demoDesar();
    const { error } = await sb.from("dies")
      .upsert({ data, temp_c: tempC, doble, font: "manual" }, { onConflict: "data" });
    if (error) throw new Error(error.message);
  },
  async afegirEsmorzar(data) {
    if (!LIVE) { S.esmorzars.push({ id: "e" + Date.now(), data, assistents: [] }); return demoDesar(); }
    const { error } = await sb.from("esmorzars").insert({ data, assistents: [] });
    if (error) throw new Error(error.message);
    await carregar();
  },
  async marcarEsmorzar(id, assistents) {
    const e = S.esmorzars.find((x) => x.id === id); if (e) e.assistents = assistents;
    if (!LIVE) return demoDesar();
    const { error } = await sb.from("esmorzars").update({ assistents }).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async desarConfig(c) {
    S.config = c;
    if (!LIVE) return demoDesar();
    const { error } = await sb.from("config")
      .upsert({ id: 1, pont_min: c.pontMin, pont_max: c.pontMax });
    if (error) throw new Error(error.message);
  },
};

/* ── Mode demostració ──────────────────────────────────────────────────── */
const DEMO_KEY = "copa-pingui-demo-v2";
function demoDesar() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({
    nedadors: S.nedadors, banys: S.banys, dies: S.dies,
    esmorzars: S.esmorzars, config: S.config, joId: S.jo && S.jo.id })); } catch (e) { /* sense desar */ }
}
function demoCarregar() {
  S.temporada = { inici: "2025-11-01", fi: "2026-03-31" };
  S.usuari = { id: "demo-user", email: "demo@exemple.com" };
  let joId = null;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) { const d = JSON.parse(raw); Object.assign(S, d); joId = d.joId; }
    else { demoSembrar(); }
  } catch (e) { demoSembrar(); }
  if (!S.nedadors.length) demoSembrar();
  // A la demostració entres com un dels nedadors, i a més com a coordinador,
  // perquè es puguin veure totes les pantalles.
  S.jo = S.nedadors.find((n) => n.id === joId) || S.nedadors[1];
  S.jo.userId = S.usuari.id; S.jo.esCoordinador = true;
  S.coordinador = true;
  demoDesar();
}
function demoSembrar() {
  const noms = ["Hugo López","Jordi Piera","Núria Bassols","Marc Estivill","Laia Ferrer",
    "Pau Sendra","Ariadna Roig","Quim Vidal","Berta Comas","Xavier Ollé","Rosa Miralles"];
  S.nedadors = noms.map((nom, i) => ({ id: "n" + i, nom, userId: null, esCoordinador: i < 2 }));
  S.dies = {}; S.banys = [];

  // Una corba d'hivern plausible: 18 ºC al novembre, mínim al febrer, remunta al març.
  const rnd = (() => { let s = 20260101; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
  const dies = [];
  for (let d = new Date("2025-11-01"); d <= new Date("2026-03-31"); d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const t = (d - new Date("2025-11-01")) / 86400000 / 150;
    const base = 18 - 9.2 * Math.sin(Math.PI * Math.min(1, t) * 0.94);
    S.dies[iso] = { tempC: Math.round((base + (rnd() - 0.5) * 1.4) * 10) / 10,
                    doble: false, font: "aemet" };
    dies.push(iso);
  }
  S.dies["2026-02-11"].doble = true;   // el dia sorpresa
  // Un parell de dies recents sense lectura, perquè es vegi la safata dels
  // coordinadors amb feina de debò.
  delete S.dies["2026-03-29"]; delete S.dies["2026-03-30"];

  S.nedadors.forEach((n, i) => {
    const ganes = 0.08 + rnd() * 0.62;               // com de constant és cadascú
    const fons  = 600 + Math.floor(rnd() * 1900);    // distància habitual
    dies.forEach((iso) => {
      if (rnd() > ganes * 0.34) return;
      const metres = Math.max(400, Math.round((fons + (rnd() - 0.5) * 900) / 100) * 100);
      S.banys.push({
        id: `b${i}-${iso}`, nedadorId: n.id, data: iso, metres,
        neopre: rnd() < 0.05, competitiu: rnd() < 0.03,
        nota: "", estat: rnd() < 0.02 ? "anullat" : "aprovat",
      });
    });
  });
  S.banys.push(
    { id: "r1", nedadorId: "n4", data: "2026-03-29", metres: 1500, neopre: false,
      competitiu: false, nota: "Fins al pont i tornar", estat: "aprovat" },
    { id: "r2", nedadorId: "n7", data: "2026-03-30", metres: 2400, neopre: false,
      competitiu: false, nota: "", estat: "aprovat" });

  S.esmorzars = [
    { id: "e1", data: "2025-11-16", assistents: ["n0","n1","n2","n3","n5","n8"] },
    { id: "e2", data: "2025-12-21", assistents: ["n0","n1","n4","n5","n6","n9","n10"] },
    { id: "e3", data: "2026-01-25", assistents: ["n0","n2","n3","n5","n7","n8"] },
    { id: "e4", data: "2026-03-08", assistents: ["n1","n2","n4","n6","n7","n10"] },
  ];
}

/* ══ RENDER ══════════════════════════════════════════════════════════════ */
function classificacio() {
  return calcularClassificacio({
    banys: S.banys, dies: S.dies, nedadors: S.nedadors,
    esmorzars: S.esmorzars, temporada: S.temporada, config: S.config,
  });
}

function pintarSessio() {
  const box = $("#sessio");
  if (!S.usuari) {
    box.innerHTML = `<button class="linkbtn" id="entrarBtn">Entrar per registrar banys</button>`;
    return;
  }
  box.innerHTML = `${S.jo ? `<b>${esc(S.jo.nom)}</b>` : esc(S.usuari.email || "")}${
    S.coordinador ? ' <span class="flag">Coordinació</span>' : ""}
    <button class="linkbtn" id="sortirBtn">Sortir</button>`;
}

function pintarCapcalera() {
  const [ai, af] = [S.temporada.inici, S.temporada.fi];
  $("#seasonRange").textContent = `${fmtDiaLl(ai).replace(/ de \d{4}/, "")} → ${fmtDiaLl(af)}`;
  const hui = avui();
  $("#phase").textContent = hui < ai ? "Comença aviat" : hui > af ? "Temporada tancada" : "En marxa";

  const dies = Object.entries(S.dies)
    .filter(([d, v]) => d >= ai && d <= af && v.tempC !== null && v.tempC !== undefined)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const band = $("#seaBand");
  if (!dies.length) { band.className = "sea empty"; band.innerHTML = "";
    $("#seaKeyRight").textContent = "encara sense registres"; return; }
  band.className = "sea";
  band.innerHTML = dies.map(([d, v]) =>
    `<i style="background:${colorAigua(v.tempC)}" title="${fmtDiaLl(d)}: ${fmtTemp(v.tempC)}"></i>`).join("");
  const temps = dies.map(([, v]) => v.tempC);
  $("#seaKeyRight").textContent = `${dies.length} dies · mínima ${fmtTemp(Math.min(...temps))}`;
}

function pintarClassificacio() {
  const res = classificacio();
  const board = $("#board");
  const ambPunts = res.filter((r) => r.total > 0).length;
  $("#boardMeta").textContent = `${res.length} inscrits · ${ambPunts} amb punts`;

  if (!res.length) {
    board.innerHTML = `<li><div class="card-b note">Encara no hi ha ningú apuntat.
      Entra des de la pestanya <b>Registrar</b> i sigues el primer.</div></li>`;
    return;
  }

  board.innerHTML = res.map((r) => {
    const obert = S.obert === r.nedador.id;
    const jo = S.jo && r.nedador.id === S.jo.id;
    const dies = r.mesos.flatMap((m) => m.dies).sort((a, b) => a.data.localeCompare(b.data));
    const strip = dies.map((d) =>
      `<span class="sw${d.compta ? "" : " out"}" style="background:${colorAigua(d.tempC)}"
        title="${fmtDiaLl(d.data)} · ${fmtTemp(d.tempC)} · ${fmtPunts(d.punts)} punts${
          d.compta ? "" : " (fora del límit de 4)"}"></span>`).join("");
    return `<li>
      <button class="entry${r.posicio === 1 && r.total > 0 ? " lead" : ""}${jo ? " jo" : ""}"
              data-ned="${esc(r.nedador.id)}" aria-expanded="${obert}">
        <span class="pos num">${r.total > 0 ? r.posicio : "—"}</span>
        <span class="who">
          <span class="nom">${esc(r.nedador.nom)}${jo ? ' <span class="tu">tu</span>' : ""}</span>
          <span class="sub">${r.diesTotals} dies · ${(r.metresTotals / 1000).toLocaleString("ca-ES",{maximumFractionDigits:1})} km${
            r.tempMinima !== null ? ` · mínima ${fmtTemp(r.tempMinima)}` : ""}${
            r.elegible ? "" : ` · ${r.esmorzars}/2 esmorzars`}</span>
        </span>
        <span class="pts num">${fmtPunts(r.total)}<small>punts</small></span>
        <span class="strip">${strip}</span>
      </button>
      ${obert ? detall(r) : ""}
    </li>`;
  }).join("");
}

function detall(r) {
  if (!r.mesos.length) {
    return `<div class="detail"><p class="why" style="padding-top:14px">
      Encara no té cap bany que puntuï${r.descartats.length
        ? `. Té ${r.descartats.length} registre${r.descartats.length > 1 ? "s" : ""} que no suma${
          r.descartats.length > 1 ? "n" : ""}: ${
          [...new Set(r.descartats.map((d) => d.motiu))].join(", ")}.` : "."}
      </p></div>`;
  }
  const mesos = r.mesos.map((m) => `
    <div class="mes">
      <div class="mes-h">
        <span class="nom">${fmtMes(m.mes)}</span>
        <span class="tot num">${fmtPunts(m.subtotal)} punts${
          m.descartatsPerLimit ? ` <span style="color:var(--muted);font-weight:400">· ${m.descartatsPerLimit} fora</span>` : ""}</span>
      </div>
      <div class="dies">${m.dies.map((d) => `
        <div class="dia${d.compta ? "" : " out"}">
          <span class="temp-chip" style="background:${colorAigua(d.tempC)}">${
            d.tempC.toLocaleString("ca-ES")}º</span>
          <span class="d-info">
            <span>${fmtDia(d.data)}</span>
            <span style="color:var(--muted)">${d.banys.reduce((s,b)=>s+b.metres,0).toLocaleString("ca-ES")} m</span>
            ${d.doble ? '<span class="flag">Doble</span>' : ""}
            ${d.banys.length > 1 ? `<span style="color:var(--muted)">${d.banys.length} banys</span>` : ""}
          </span>
          <span class="d-pts">${fmtPunts(d.punts)}</span>
        </div>`).join("")}</div>
    </div>`).join("");

  const avisos = [];
  if (!r.elegible) avisos.push(`<b>Li falten esmorzars.</b> N'ha fet ${r.esmorzars} de 2.`);
  if (r.descartats.length) {
    const per = {}; r.descartats.forEach((d) => per[d.motiu] = (per[d.motiu] || 0) + 1);
    avisos.push(`<b>Registres que no sumen:</b> ${
      Object.entries(per).map(([m, n]) => `${n} per ${m}`).join(", ")}.`);
  }
  const fora = r.mesos.reduce((s, m) => s + m.descartatsPerLimit, 0);
  if (fora) avisos.push(`<b>${fora} dia${fora > 1 ? "s" : ""} fora del límit</b> de quatre per mes. Surten ratllats.`);

  return `<div class="detail">${mesos}${avisos.length ? `<p class="why">${avisos.join(" ")}</p>` : ""}</div>`;
}

/* ── Registrar ─────────────────────────────────────────────────────────── */
function pintarRegistre() {
  const dins = Boolean(S.usuari);
  $("#authCard").classList.toggle("hidden", dins);
  $("#onboardCard").classList.toggle("hidden", !(dins && !S.jo));
  $("#logCard").classList.toggle("hidden", !(dins && S.jo));
  $("#mineCard").classList.toggle("hidden", !(dins && S.jo));
  if (!(dins && S.jo)) return;

  $("#fData").max = avui();
  if (!$("#fData").value) $("#fData").value = avui();
  pintarPrevisio();
  pintarElsMeus();
}

/* Ensenya què puntuarà el bany abans d'apuntar-lo. Fa visible que la
   temperatura ve de fora, i que sense lectura encara no puntua. */
function pintarPrevisio() {
  const box = $("#previsio");
  const data = $("#fData").value, metres = parseInt($("#fMetres").value, 10);
  if (!data || !metres) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  if ($("#fNeopre").checked || $("#fCompeti").checked) {
    box.className = "msg info";
    box.textContent = $("#fNeopre").checked
      ? "Amb neoprè no suma punts, però queda registrat."
      : "Les proves competitives no sumen punts, però queden registrades.";
    return;
  }
  const d = S.dies[data];
  if (!d || d.tempC === null || d.tempC === undefined) {
    box.className = "msg info";
    box.textContent = "Encara no hi ha la temperatura d'aquest dia. El bany quedarà "
      + "apuntat i puntuarà tot sol quan arribi la lectura de l'AEMET.";
    return;
  }
  const pt = puntsTemperatura(d.tempC), coef = coeficientDistancia(metres, S.config);
  const doble = esDiaDoble(data, { [data]: d.doble === true });
  box.className = "msg ok";
  box.textContent = `${fmtTemp(d.tempC)} → ${pt} punts × ${coef.toLocaleString("ca-ES")}`
    + `${doble ? " × 2 (dia doble)" : ""} = ${fmtPunts(pt * coef * (doble ? 2 : 1))} punts.`;
}

function pintarElsMeus() {
  const box = $("#mySubs");
  const meus = S.banys.filter((b) => b.nedadorId === S.jo.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const r = classificacio().find((x) => x.nedador.id === S.jo.id);
  $("#mineMeta").textContent = r ? `${fmtPunts(r.total)} punts · ${r.diesTotals} dies` : "—";

  if (!meus.length) {
    box.className = "note"; box.textContent = "Encara no has apuntat cap bany."; return;
  }
  const totsElsDies = r ? r.mesos.flatMap((m) => m.dies) : [];
  box.className = "scroll-x";
  box.innerHTML = `<table class="tbl">
    <thead><tr><th>Dia</th><th>Metres</th><th>Aigua</th><th>Punts</th><th></th></tr></thead>
    <tbody>${meus.slice(0, 20).map((b) => {
      const d = S.dies[b.data] || {};
      const dia = totsElsDies.find((x) => x.data === b.data);
      const motiu = b.estat === "anullat" ? "anul·lat" : b.neopre ? "neoprè"
        : b.competitiu ? "competitiva"
        : (d.tempC === null || d.tempC === undefined) ? "sense temperatura" : null;
      return `<tr>
        <td class="n">${fmtDia(b.data)}</td>
        <td class="n">${b.metres.toLocaleString("ca-ES")}</td>
        <td class="n">${fmtTemp(d.tempC)}</td>
        <td class="n">${motiu ? `<span class="pill warn">${motiu}</span>`
          : dia ? fmtPunts(dia.punts) + (dia.compta ? "" : " (fora)") : "—"}</td>
        <td><button class="linkbtn" data-esborrar="${esc(b.id)}">esborrar</button></td>
      </tr>`; }).join("")}</tbody></table>`;
}

/* ── Coordinació ───────────────────────────────────────────────────────── */
function pintarCoordinacio() {
  // La safata de feina ja no són banys per aprovar, sinó dies sense lectura.
  const senseTemp = [...new Set(S.banys
    .filter((b) => b.estat === "aprovat" && !b.neopre && !b.competitiu &&
      b.data >= S.temporada.inici && b.data <= S.temporada.fi)
    .map((b) => b.data))]
    .filter((d) => { const v = S.dies[d]; return !v || v.tempC === null || v.tempC === undefined; })
    .sort();

  const badge = $("#pendBadge");
  badge.textContent = senseTemp.length;
  badge.classList.toggle("hidden", !senseTemp.length || !S.coordinador);
  $("#pendMeta").textContent = senseTemp.length
    ? `${senseTemp.length} per completar` : "cap dia pendent";

  $("#pendList").innerHTML = senseTemp.length ? `
    <p class="note" style="margin:0 0 10px">Hi ha banys apuntats aquests dies però
      l'AEMET encara no n'ha donat la temperatura. Fins que no la poseu, no puntuen.</p>
    ${senseTemp.map((d) => {
      const n = S.banys.filter((b) => b.data === d && b.estat === "aprovat").length;
      return `<div class="pend" data-dia="${esc(d)}">
        <div>
          <div class="nm">${fmtDiaLl(d)}</div>
          <div class="meta">${n} bany${n > 1 ? "s" : ""} esperant</div>
        </div>
        <div class="acts">
          <span class="tempbox">
            <label for="td-${esc(d)}">Aigua ºC</label>
            <input type="number" step="0.1" id="td-${esc(d)}" class="temp-in" placeholder="—">
          </span>
          <button class="btn sm ok" data-fixar="${esc(d)}">Fixar</button>
        </div>
      </div>`; }).join("")}`
    : `<p class="note">Tots els dies amb banys tenen temperatura. L'AEMET va sol.</p>`;

  // Historial de dies
  const dies = Object.entries(S.dies)
    .filter(([d]) => d >= S.temporada.inici && d <= S.temporada.fi)
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
  $("#daysTbl").innerHTML = dies.length ? `
    <thead><tr><th>Dia</th><th>Aigua</th><th>Font</th><th>Doble</th><th>Banys</th></tr></thead>
    <tbody>${dies.map(([d, v]) => {
      const n = S.banys.filter((b) => b.data === d && b.estat === "aprovat").length;
      const doble = v.doble || d.slice(5) === "12-31" || d.slice(5) === "01-01";
      return `<tr>
        <td class="n">${fmtDia(d)}</td>
        <td class="n"><span class="temp-chip" style="background:${colorAigua(v.tempC)}">${
          v.tempC != null ? v.tempC.toLocaleString("ca-ES") + "º" : "—"}</span></td>
        <td class="n" style="color:var(--muted)">${v.font === "aemet" ? "AEMET" : "a mà"}</td>
        <td>${doble ? '<span class="flag">Doble</span>' : ""}</td>
        <td class="n">${n || ""}</td></tr>`; }).join("")}</tbody>`
    : `<tbody><tr><td class="note">Encara no s'ha fixat cap temperatura.</td></tr></tbody>`;

  // Corregir banys
  const recents = [...S.banys].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 40);
  $("#corrList").innerHTML = recents.length ? `<table class="tbl">
    <thead><tr><th>Dia</th><th>Qui</th><th>Metres</th><th>Estat</th><th></th></tr></thead>
    <tbody>${recents.map((b) => {
      const n = S.nedadors.find((x) => x.id === b.nedadorId);
      const anul = b.estat === "anullat";
      return `<tr>
        <td class="n">${fmtDia(b.data)}</td>
        <td>${esc(n ? n.nom : "?")}</td>
        <td class="n">${b.metres.toLocaleString("ca-ES")}${b.neopre ? " · neoprè" : ""}${
          b.competitiu ? " · comp." : ""}</td>
        <td>${anul ? '<span class="pill warn">Anul·lat</span>' : '<span class="pill ok">Compta</span>'}</td>
        <td><button class="linkbtn" data-toggle="${esc(b.id)}">${
          anul ? "reactivar" : "anul·lar"}</button></td>
      </tr>`; }).join("")}</tbody></table>` : `<p class="note">Cap bany encara.</p>`;

  // Esmorzars
  const res = classificacio();
  $("#bList").innerHTML = S.esmorzars.length ? [...S.esmorzars]
    .sort((a, b) => a.data.localeCompare(b.data)).map((e) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line-soft)">
        <div class="row" style="justify-content:space-between">
          <span style="font-family:var(--display);text-transform:uppercase">${fmtDiaLl(e.data)}</span>
          <span class="eyebrow">${e.assistents.length} assistents</span>
        </div>
        <div class="row" style="margin-top:8px;gap:6px">${S.nedadors.map((n) => {
          const hi = e.assistents.includes(n.id);
          return `<button class="btn ghost sm" data-esm="${esc(e.id)}" data-ned2="${esc(n.id)}"
            style="${hi ? "border-color:var(--good);color:var(--good)" : "opacity:.62"}">${
            hi ? "✓ " : ""}${esc(n.nom.split(" ")[0])}</button>`; }).join("")}</div>
      </div>`).join("")
    : `<p class="note">Cap esmorzar registrat encara.</p>`;

  const curts = res.filter((r) => !r.elegible);
  if (curts.length && S.esmorzars.length) {
    $("#bList").insertAdjacentHTML("beforeend",
      `<p class="why" style="margin-top:12px"><b>Encara no arriben als 2 esmorzars:</b> ${
        curts.map((r) => `${esc(r.nedador.nom.split(" ")[0])} (${r.esmorzars})`).join(", ")}.</p>`);
  }

  $("#nCount").textContent = `${S.nedadors.length} apuntats de 20 places`;
  $("#nList").innerHTML = S.nedadors.map((n) =>
    `<span class="pill ok" style="background:var(--surface-2);color:var(--ink)">${esc(n.nom)}${
      n.esCoordinador ? " ·" : ""}</span>`).join("");
  $("#cPontMin").value = S.config.pontMin;
  $("#cPontMax").value = S.config.pontMax;
}

function pintarRampa() {
  const graus = [19,18,17,16,15,14,13,12,11,10,9];
  $("#ramp").innerHTML = graus.map((t) =>
    `<span class="r"><i style="background:${colorAigua(t)}">${t < 10 ? "&lt;10" : t + "º"}</i>
      <span>${t < 10 ? 15 : 20 - t}</span></span>`).join("");
}

function pintar() {
  pintarSessio();
  pintarCapcalera();
  pintarClassificacio();
  pintarRegistre();
  if (S.coordinador) pintarCoordinacio(); else $("#pendBadge").classList.add("hidden");
  aplicarBloqueig();
}

/* ══ VISTES ══════════════════════════════════════════════════════════════ */
function mostrar(v) {
  S.vista = v;
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === v)));
  ["board","log","coord","rules"].forEach((k) =>
    $(`#view-${k}`).classList.toggle("hidden", k !== v));
  if (v === "coord") aplicarBloqueig();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function aplicarBloqueig() {
  const bloquejat = !S.coordinador;
  $("#coordLocked").classList.toggle("hidden", !bloquejat);
  $("#coordPanel").classList.toggle("hidden", bloquejat);
  $("#coordLockedMsg").textContent = S.usuari
    ? "Aquesta secció és per a Hugo i Jordi: fixar temperatures que l'AEMET no doni, marcar el dia sorpresa, apuntar els esmorzars i corregir errors."
    : "Aquesta secció és per a Hugo i Jordi. Si ets un d'ells, entra des de la pestanya Registrar.";
}

/* ══ ESDEVENIMENTS ═══════════════════════════════════════════════════════ */
function missatge(sel, text, tipus = "ok") {
  $(sel).innerHTML = `<div class="msg ${tipus}">${esc(text)}</div>`;
  if (tipus === "ok") setTimeout(() => { const e = $(sel); if (e) e.innerHTML = ""; }, 8000);
}
const retorn = () => location.href.split("#")[0];

/* A la demostració no hi ha autenticació de debò: els botons només et
   tornen a posar a dins, perquè no quedi un carreró sense sortida. */
function demoEntrar() {
  S.usuari = { id: "demo-user", email: "demo@exemple.com" };
  reconeixerme();
  if (!S.jo) { S.jo = S.nedadors[1]; S.jo.userId = S.usuari.id;
    S.jo.esCoordinador = true; S.coordinador = true; }
  pintar(); mostrar("board");
}

async function entrarGoogle() {
  if (!LIVE) return demoEntrar();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google", options: { redirectTo: retorn() } });
  if (error) missatge("#authMsg", "No s'ha pogut obrir Google: " + error.message, "err");
}

async function entrarCorreu() {
  const email = ($("#fMail2").value || "").trim();
  if (!LIVE) return demoEntrar();
  if (!email) return missatge("#authMsg", "Escriu el teu correu.", "err");
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: retorn() } });
  if (error) return missatge("#authMsg", "No s'ha pogut enviar: " + error.message, "err");
  missatge("#authMsg", "Enllaç enviat. Obre'l des d'aquest mateix mòbil o ordinador.");
}

function connectar() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => mostrar(t.dataset.view)));

  $("#board").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ned]"); if (!b) return;
    S.obert = S.obert === b.dataset.ned ? null : b.dataset.ned;
    pintarClassificacio();
  });

  $("#sessio").addEventListener("click", async (e) => {
    if (e.target.id === "entrarBtn") return mostrar("log");
    if (e.target.id === "sortirBtn") {
      if (LIVE) await sb.auth.signOut();
      S.usuari = null; S.jo = null; S.coordinador = false;
      pintar(); mostrar("board");
    }
  });

  $("#googleBtn").addEventListener("click", entrarGoogle);
  $("#magicBtn").addEventListener("click", entrarCorreu);
  $("#fMail2").addEventListener("keydown", (e) => { if (e.key === "Enter") entrarCorreu(); });

  $("#onboardBtn").addEventListener("click", async () => {
    const nom = $("#fNom").value.trim();
    if (nom.length < 2) return missatge("#onboardMsg", "Escriu el teu nom.", "err");
    if (S.nedadors.length >= 20 &&
        !confirm("Ja hi ha 20 apuntats. El reglament en posa 20 com a màxim. Vols apuntar-t'hi igualment?"))
      return;
    try { await api.apuntarMe(nom); pintar(); }
    catch (err) { missatge("#onboardMsg", "No s'ha pogut apuntar: " + err.message, "err"); }
  });

  ["#fData","#fMetres","#fNeopre","#fCompeti"].forEach((s) =>
    $(s).addEventListener("input", pintarPrevisio));

  $("#logForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!S.jo) return;
    const bany = {
      nedadorId: S.jo.id,
      data: $("#fData").value,
      metres: parseInt($("#fMetres").value, 10),
      neopre: $("#fNeopre").checked,
      competitiu: $("#fCompeti").checked,
      nota: $("#fNota").value.trim(),
      estat: "aprovat",
    };
    if (!bany.data || !bany.metres) return missatge("#logMsg", "Falta el dia o la distància.", "err");
    if (bany.data > avui()) return missatge("#logMsg", "Aquest dia encara no ha arribat.", "err");
    if (bany.data < S.temporada.inici || bany.data > S.temporada.fi)
      return missatge("#logMsg", "Aquest dia queda fora de la temporada.", "err");

    $("#logBtn").disabled = true;
    try {
      await api.apuntarBany(bany);
      $("#fMetres").value = ""; $("#fNota").value = "";
      $("#fNeopre").checked = false; $("#fCompeti").checked = false;
      $("#previsio").classList.add("hidden");
      missatge("#logMsg", "Apuntat.");
      pintar();
    } catch (err) { missatge("#logMsg", err.message, "err"); }
    finally { $("#logBtn").disabled = false; }
  });

  $("#mySubs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-esborrar]"); if (!b) return;
    if (!confirm("Segur que vols esborrar aquest bany?")) return;
    try { await api.esborrarBany(b.dataset.esborrar); pintar(); }
    catch (err) { alert("No s'ha pogut esborrar: " + err.message); }
  });

  $("#pendList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fixar]"); if (!b) return;
    const dia = b.dataset.fixar;
    const camp = $(`#td-${CSS.escape(dia)}`);
    if (!camp || camp.value === "") return alert("Escriu la temperatura.");
    try {
      await api.desarDia(dia, parseFloat(camp.value), (S.dies[dia] || {}).doble === true);
      pintar();
    } catch (err) { alert("No s'ha pogut desar: " + err.message); }
  });

  $("#corrList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-toggle]"); if (!b) return;
    const bany = S.banys.find((x) => x.id === b.dataset.toggle); if (!bany) return;
    try { await api.canviarEstat(bany.id, bany.estat === "anullat" ? "aprovat" : "anullat"); pintar(); }
    catch (err) { alert("No s'ha pogut desar: " + err.message); }
  });

  $("#tSave").addEventListener("click", async () => {
    const data = $("#tDia").value;
    if (!data) return alert("Tria un dia.");
    const t = $("#tTemp").value === "" ? null : parseFloat($("#tTemp").value);
    try { await api.desarDia(data, t, $("#tDoble").checked); pintar(); }
    catch (err) { alert("No s'ha pogut desar: " + err.message); }
  });

  $("#tDia").addEventListener("change", () => {
    const d = S.dies[$("#tDia").value] || {};
    $("#tTemp").value = d.tempC ?? "";
    $("#tDoble").checked = d.doble === true;
  });

  $("#bAdd").addEventListener("click", async () => {
    const d = $("#bDia").value; if (!d) return alert("Tria el dia de l'esmorzar.");
    try { await api.afegirEsmorzar(d); $("#bDia").value = ""; pintar(); }
    catch (err) { alert("No s'ha pogut afegir: " + err.message); }
  });

  $("#bList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-esm]"); if (!b) return;
    const esm = S.esmorzars.find((x) => String(x.id) === b.dataset.esm); if (!esm) return;
    const id = b.dataset.ned2;
    const nous = esm.assistents.includes(id)
      ? esm.assistents.filter((x) => x !== id) : [...esm.assistents, id];
    try { await api.marcarEsmorzar(esm.id, nous); pintar(); }
    catch (err) { alert("No s'ha pogut desar: " + err.message); }
  });

  $("#cSave").addEventListener("click", async () => {
    const min = parseInt($("#cPontMin").value, 10), max = parseInt($("#cPontMax").value, 10);
    if (!(min > 0 && max >= min)) return alert("La banda no és vàlida.");
    try { await api.desarConfig({ pontMin: min, pontMax: max }); pintar(); }
    catch (err) { alert("No s'ha pogut desar: " + err.message); }
  });
}

/* ══ ARRENCADA ═══════════════════════════════════════════════════════════ */
async function iniciar() {
  pintarRampa();
  connectar();

  if (LIVE) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
      s.onload = res; s.onerror = () => rej(new Error("no s'ha pogut carregar Supabase"));
      document.head.appendChild(s);
    });
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    S.usuari = data && data.session ? data.session.user : null;
    sb.auth.onAuthStateChange(async (_e, sess) => {
      const abans = S.usuari && S.usuari.id;
      S.usuari = sess ? sess.user : null;
      if ((S.usuari && S.usuari.id) !== abans) {
        try { await carregar(); } catch (err) { /* ja avisat */ }
        pintar();
        if (S.usuari && !S.jo) mostrar("log");
      }
    });
    $("#footMode").textContent = "Dades reals";
  } else {
    $("#demoBar").classList.remove("hidden");
    $("#demoBar").textContent =
      "Demostració · nedadors inventats, temporada 2025-26 · hi entres com a coordinador";
    $("#footMode").textContent = "Mode demostració";
  }

  try { await carregar(); }
  catch (err) {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<div class="msg err" style="margin-bottom:16px">No s'han pogut carregar les dades: ${esc(err.message)}</div>`);
  }
  pintar();
  mostrar("board");
}

iniciar();
})();
