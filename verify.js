// Obre l'app en un navegador de veritat i comprova que funciona:
// errors de consola, render de la classificació, i el flux de registrar un bany.
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const problemes = [];
  const ok = (c, m) => { if (!c) problemes.push(m); console.log(`  ${c ? "ok  " : "FAIL"} ${m}`); };

  for (const tema of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 430, height: 900 }, colorScheme: tema,
    });
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tema}] ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`[${tema}] ${e.message}`));
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto("file://" + path.join(__dirname, "index.html"));
    await page.waitForTimeout(900);

    console.log(`\n── tema ${tema} ──`);
    ok((await page.locator(".board > li").count()) === 11, "11 nedadors a la classificació");
    ok((await page.locator("#seaBand i").count()) > 100, "la barra de mar té un dia per registre");
    ok(await page.locator("#sessio b").isVisible(), "la capçalera diu qui ets");
    ok((await page.locator(".entry.jo").count()) === 1, "la teva fila surt destacada");

    const punts = await page.locator(".pts").allTextContents();
    const n = punts.map((p) => parseFloat(p.replace(/[^\d,]/g, "").replace(",", ".")));
    ok(n[0] >= n[1] && n[1] >= n[2], `ordenats de més a menys (${n[0]}, ${n[1]}, ${n[2]})`);
    ok(n[0] > 0, "el líder té punts");

    await page.locator(".entry").first().click();
    await page.waitForTimeout(200);
    ok(await page.locator(".detail .mes").first().isVisible(), "el detall mensual es desplega");

    const c = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { bg: s.backgroundColor, fg: s.color };
    });
    const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    ok(Math.abs(lum(c.bg) - lum(c.fg)) > 110, `text i fons contrasten (${c.bg} / ${c.fg})`);
    ok(tema === "dark" ? lum(c.bg) < 90 : lum(c.bg) > 170, `el fons segueix el tema ${tema}`);

    const desbord = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(desbord <= 1, `sense scroll horitzontal al mòbil (desbordament ${desbord}px)`);

    if (tema === "light") {
      // ── Registrar un bany. Ja no cal que ningú l'aprovi: ha de puntuar sol.
      await page.locator('.tab[data-view="log"]').click();
      await page.waitForTimeout(200);
      ok(await page.locator("#logCard").isVisible(), "el formulari surt, ja identificat");
      ok(!(await page.locator("#authCard").isVisible()), "no demana entrar dues vegades");

      const abans = await page.locator("#mineMeta").textContent();
      await page.fill("#fData", "2026-03-20");
      await page.fill("#fMetres", "2000");
      await page.waitForTimeout(200);
      const prev = await page.locator("#previsio").textContent();
      ok(/punts/.test(prev), `la previsió diu què puntuarà: "${prev.trim().slice(0, 60)}"`);

      await page.click("#logBtn");
      await page.waitForTimeout(400);
      ok(await page.locator("#logMsg .msg.ok").isVisible(), "el formulari confirma");
      const despres = await page.locator("#mineMeta").textContent();
      ok(abans !== despres, `els punts pugen tot sols (${abans.trim()} → ${despres.trim()})`);

      // ── Un dia sense temperatura no puntua, i surt a la safata dels coordinadors.
      await page.fill("#fData", "2026-03-29");
      await page.fill("#fMetres", "1100");
      await page.waitForTimeout(200);
      ok(/AEMET/.test(await page.locator("#previsio").textContent()),
         "avisa que encara no hi ha temperatura");
      await page.click("#logBtn");
      await page.waitForTimeout(400);

      await page.locator('.tab[data-view="coord"]').click();
      await page.waitForTimeout(250);
      ok(await page.locator("#coordPanel").isVisible(), "la coordinació s'obre per al coordinador");
      const fila = page.locator('.pend[data-dia="2026-03-29"]');
      ok(await fila.isVisible(), "el dia sense temperatura surt a la safata");
      await fila.locator(".temp-in").fill("10.5");
      await fila.locator("[data-fixar]").click();
      await page.waitForTimeout(400);
      ok(!(await page.locator('.pend[data-dia="2026-03-29"]').count()),
         "en fixar la temperatura, surt de la safata");

      // ── Anul·lar un bany des de la correcció.
      const primer = page.locator("#corrList [data-toggle]").first();
      const txt = await primer.textContent();
      await primer.click();
      await page.waitForTimeout(400);
      ok((await page.locator("#corrList [data-toggle]").first().textContent()) !== txt,
         "anul·lar un bany canvia el seu estat");

      await page.locator('.tab[data-view="rules"]').click();
      await page.waitForTimeout(150);
      ok((await page.locator("#ramp .r").count()) === 11, "la rampa de temperatures es pinta");

      await page.locator('.tab[data-view="board"]').click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: "dist/board.png" });
      await page.locator('.tab[data-view="log"]').click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: "dist/log.png" });

      // ── Sortir: ha de deixar mirar la classificació però no registrar.
      await page.locator("#sortirBtn").click();
      await page.waitForTimeout(300);
      ok((await page.locator(".board > li").count()) === 11, "en sortir, la classificació es veu igual");
      await page.locator('.tab[data-view="log"]').click();
      await page.waitForTimeout(200);
      ok(await page.locator("#authCard").isVisible(), "en sortir, demana entrar per registrar");
      ok(await page.locator("#googleBtn").isVisible(), "hi ha el botó de Google");
      await page.locator('.tab[data-view="coord"]').click();
      await page.waitForTimeout(200);
      ok(!(await page.locator("#coordPanel").isVisible()), "la coordinació queda tancada");
      await page.screenshot({ path: "dist/auth.png" });
    } else {
      await page.screenshot({ path: "dist/board-dark.png" });
    }
    await page.close();
  }

  console.log("\n── consola ──");
  const reals = errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|fonts\.googleapis/.test(e));
  if (reals.length) { reals.forEach((e) => console.log("  " + e)); problemes.push("errors de consola"); }
  else console.log("  ok   cap error de consola (les fonts les bloqueja el sandbox)");

  await browser.close();
  console.log(problemes.length ? `\n${problemes.length} PROBLEMES\n` : "\nTot correcte\n");
  process.exit(problemes.length ? 1 : 0);
})();
