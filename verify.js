// Obre l'app en un navegador de veritat i comprova que funciona. Es fa servir
// dist/artifact.html i no index.html: és el fitxer que es publica, i ja hem
// tingut un cas d'un build que corrompia el codi en inlinar-lo.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const problemes = [];
  const ok = (c, m) => { if (!c) problemes.push(m); console.log(`  ${c ? "ok  " : "FAIL"} ${m}`); };

  // Envolta el build amb l'esquelet que hi posa el servei d'artifacts.
  const cos = fs.readFileSync(path.join(__dirname, "dist/artifact.html"), "utf8");
  const pagina = `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>body{margin:0}</style></head><body>${cos}</body></html>`;

  for (const tema of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 }, colorScheme: tema });
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tema}] ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`[${tema}] ${e.message}`));
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.setContent(pagina);
    await page.waitForTimeout(900);

    console.log(`\n── tema ${tema} ──`);
    ok((await page.locator(".board > li").count()) === 11, "11 nedadors a la classificació");
    ok(await page.locator("#sessio b").isVisible(), "la capçalera diu qui ets");

    const c = await page.evaluate(() => {
      const s = getComputedStyle(document.body); return [s.backgroundColor, s.color];
    });
    const lum = (r) => { const [x, y, z] = r.match(/\d+/g).map(Number); return .2126*x + .7152*y + .0722*z; };
    ok(Math.abs(lum(c[0]) - lum(c[1])) > 110, `text i fons contrasten (${c[0]} / ${c[1]})`);
    ok(tema === "dark" ? lum(c[0]) < 90 : lum(c[0]) > 170, `el fons segueix el tema ${tema}`);
    const desbord = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(desbord <= 1, `sense scroll horitzontal al mòbil (${desbord}px)`);

    if (tema !== "light") { await page.close(); continue; }

    // ── Les pestanyes han de respondre. Això és el que el build trencava.
    await page.locator('.tab[data-view="log"]').click();
    await page.waitForTimeout(250);
    ok(await page.locator("#logCard").isVisible(), "les pestanyes canvien de vista");

    // ── Valors per defecte del formulari
    ok((await page.inputValue("#fMetres")) === "1700", "la distància ve a 1700, que és un pont");
    ok((await page.inputValue("#fNeopre")) === "no", "el vestit ve sense neoprè");
    ok((await page.inputValue("#fFora")) === "badalona", "el lloc ve com a Badalona");

    // ── A 21 ºC s'ha de puntuar: era el problema de fons.
    await page.locator('.tab[data-view="coord"]').click();
    await page.waitForTimeout(200);
    ok((await page.inputValue("#cTempBase")) === "23", "el llindar és configurable i val 23");
    await page.fill("#tDia", "2026-03-10");
    await page.fill("#tTemp", "21");
    await page.click("#tSave");
    await page.waitForTimeout(350);

    await page.locator('.tab[data-view="log"]').click();
    await page.waitForTimeout(200);
    await page.fill("#fData", "2026-03-10");
    await page.waitForTimeout(250);
    const prev = await page.locator("#previsio").textContent();
    ok(/2 punts ×/.test(prev), `a 21 ºC ja puntua: "${prev.trim().slice(0, 48)}"`);

    // ── Bany fora de Badalona
    await page.selectOption("#fFora", "fora");
    await page.waitForTimeout(250);
    ok(/Badalona/.test(await page.locator("#previsio").textContent()),
       "avisa que la temperatura que s'aplica és la de Badalona");
    await page.click("#logBtn");
    await page.waitForTimeout(400);
    ok(await page.locator("#logMsg .msg.ok").isVisible(), "el bany de fora s'apunta");
    // La taula va per data descendent i el nedador de la demostració ja té
    // banys posteriors, així que es busca la fila del dia, no la primera.
    const files = await page.locator("#mySubs tbody tr").allTextContents();
    const fila = files.find((t) => t.includes("10 mar"));
    ok(fila && fila.includes("Fora"),
       `surt marcat com a fora a la seva taula (${(fila || "cap fila").trim()})`);

    // Un segon de fora el mateix mes ha d'avisar.
    await page.locator('.tab[data-view="coord"]').click();
    await page.waitForTimeout(150);
    await page.fill("#tDia", "2026-03-12");
    await page.fill("#tTemp", "14");
    await page.click("#tSave");
    await page.waitForTimeout(300);
    await page.locator('.tab[data-view="log"]').click();
    await page.waitForTimeout(200);
    await page.fill("#fData", "2026-03-12");
    await page.selectOption("#fFora", "fora");
    await page.fill("#fMetres", "1600");
    await page.waitForTimeout(250);
    ok(/només en comptarà el millor/.test(await page.locator("#previsio").textContent()),
       "avisa que aquest mes ja en té un de fora");

    // ── Bonificacions ──
    ok(await page.locator("#modsBox").isVisible(), "les bonificacions surten al formulari");
    const fitxes = await page.locator(".mod").allTextContents();
    ok(fitxes.length === 3, `n'hi ha tres (${fitxes.map((t) => t.trim()).join(" · ")})`);
    ok(fitxes.some((t) => /tauró/.test(t) && /\+10/.test(t)), "el tauró val 10 punts");

    await page.fill("#fData", "2026-03-18");
    await page.locator('.tab[data-view="coord"]').click();
    await page.waitForTimeout(150);
    await page.fill("#tDia", "2026-03-18");
    await page.fill("#tTemp", "13");
    await page.click("#tSave");
    await page.waitForTimeout(300);
    await page.locator('.tab[data-view="log"]').click();
    await page.waitForTimeout(200);
    await page.fill("#fData", "2026-03-18");
    await page.fill("#fMetres", "1700");
    await page.selectOption("#fFora", "badalona");
    await page.waitForTimeout(250);
    const sense = await page.locator("#previsio").textContent();
    await page.locator('.mod:has-text("dofí") input').check();
    await page.waitForTimeout(250);
    const amb = await page.locator("#previsio").textContent();
    ok(/bonificació/.test(amb), `la previsió hi suma la bonificació: "${amb.trim().slice(0, 70)}"`);
    ok(sense !== amb, "i canvia el total respecte de sense marcar-la");

    // ── La porta dels esmorzars ──
    ok(/esmorzar/.test(amb), "avisa dels esmorzars que falten aquell mes");

    // ── Esmorzars mes a mes
    await page.locator('.tab[data-view="coord"]').click();
    await page.waitForTimeout(250);
    const caps = await page.locator("#bList thead th").allTextContents();
    ok(caps.length === 7, `la taula d'esmorzars té una columna per mes (${caps.join(" ")})`);
    ok((await page.locator("#bList tbody tr").count()) === 11, "hi surten els 11 nedadors");
    ok(/no entren al global/.test(await page.locator("#bList .note").textContent()),
       "explica que sense esmorzars els punts del mes no compten");

    // ── Reglament
    await page.locator('.tab[data-view="rules"]').click();
    await page.waitForTimeout(200);
    const regla = await page.locator("#reglaTemp").textContent();
    ok(/23 ºC/.test(regla), `el reglament diu el llindar bo: "${regla.trim().slice(0, 44)}"`);
    const text = await page.locator("#view-rules").textContent();
    ok(/20 €/.test(text), "diu la inscripció de 20 €");
    ok(/samarreta commemorativa/.test(text), "diu a què es destinen");
    ok(/només compta un bany de fora/i.test(text), "explica el límit de fora de Badalona");
    ok(/2 esmorzars cada mes/.test(text), "explica els dos esmorzars al mes");
    ok(/no compten/.test(text), "i que sense ells els punts del mes no compten");
    ok(/He vist un tauró/.test(text), "el reglament llista les bonificacions");
    ok(/punts plans/.test(text), "i diu que són punts plans");
    ok((await page.locator("#ramp .r").count()) === 14, "la rampa arriba fins als 22 ºC");

    await page.locator('.tab[data-view="board"]').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: "dist/board.png" });
    await page.locator('.tab[data-view="coord"]').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: "dist/coord.png", fullPage: false });
    await page.close();
  }

  console.log("\n── consola ──");
  const reals = errors.filter((e) => !/ERR_|fonts\.googleapis|net::/.test(e));
  if (reals.length) { reals.forEach((e) => console.log("  " + e)); problemes.push("errors de consola"); }
  else console.log("  ok   cap error de consola");

  await browser.close();
  console.log(problemes.length ? `\n${problemes.length} PROBLEMES\n` : "\nTot correcte\n");
  process.exit(problemes.length ? 1 : 0);
})();
