// Genera dist/artifact.html: el mateix app en un sol fitxer, sense l'esquelet
// del document (l'Artifact l'embolcalla al publicar).
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
let html = read("index.html");

// Compte: String.replace interpreta $$ al text de substitució com un $
// literal. Amb una funció com a segon argument no passa, i el codi arriba
// a l'artifact byte a byte com és. Això va corrompre totes les versions
// publicades fins al 28 d'octubre de 2026.
const inlinar = (etiqueta, fitxer) => {
  html = html.replace(etiqueta, () => `<script>\n${read(fitxer)}\n</script>`);
};
inlinar('<script src="scoring.js"></script>', "scoring.js");
inlinar('<script src="app.js"></script>', "app.js");

let out = html
  .replace(/^[\s\S]*?<head>\s*/i, "")
  .replace(/<\/head>\s*<body>\s*/i, "\n")
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n")
  .replace(/<meta charset="utf-8">\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "");

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist/artifact.html"), out);

const problemes = [];
// Comprova que el codi ha arribat intacte, no només que hi ha arribat.
for (const f of ["scoring.js", "app.js"]) {
  if (!out.includes(read(f).trim())) problemes.push(`${f} s'ha alterat en inlinar-lo`);
}
if (/<!doctype|<html|<\/html>|<head>|<body>/i.test(out)) problemes.push("queda esquelet HTML");
if (/<script src=/.test(out)) problemes.push("queda un script extern sense inlinar");
if (!out.includes("<title>")) problemes.push("falta el títol");
if (out.length > 16 * 1024 * 1024) problemes.push("passa dels 16 MB");

console.log(`dist/artifact.html — ${(out.length / 1024).toFixed(1)} kB`);
console.log(problemes.length ? "PROBLEMES: " + problemes.join(", ") : "sense problemes");
process.exit(problemes.length ? 1 : 0);
