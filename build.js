// Genera dist/artifact.html: el mateix app en un sol fitxer, sense l'esquelet
// del document (l'Artifact l'embolcalla al publicar).
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
let html = read("index.html");
const scoring = read("scoring.js");
const app = read("app.js");

// 1. Inline dels dos scripts.
html = html.replace('<script src="scoring.js"></script>', `<script>\n${scoring}\n</script>`);
html = html.replace('<script src="app.js"></script>', `<script>\n${app}\n</script>`);

// 2. Treu l'esquelet del document i els meta que l'Artifact ja posa.
let out = html
  .replace(/^[\s\S]*?<head>\s*/i, "")
  .replace(/<\/head>\s*<body>\s*/i, "\n")
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n")
  .replace(/<meta charset="utf-8">\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "");

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist/artifact.html"), out);

// Comprovacions bàsiques abans de publicar.
const problemes = [];
if (/<!doctype|<html|<\/html>|<head>|<body>/i.test(out)) problemes.push("queda esquelet HTML");
if (/<script src=/.test(out)) problemes.push("queda un script extern sense inlinar");
if (!out.includes("<title>")) problemes.push("falta el títol");
if (out.length > 16 * 1024 * 1024) problemes.push("passa dels 16 MB");

console.log(`dist/artifact.html — ${(out.length / 1024).toFixed(1)} kB`);
console.log(problemes.length ? "PROBLEMES: " + problemes.join(", ") : "sense problemes");
process.exit(problemes.length ? 1 : 0);
