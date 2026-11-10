// Publica el frontend minificado en app/dist (lo que sirve FastAPI si existe).
// Uso: npm install && npm run build
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("app/dist", { recursive: true });
await build({ entryPoints: ["app/app.js", "app/styles.css"], outdir: "app/dist", minify: true, legalComments: "none", target: ["es2020"] });
const html = readFileSync("app/index.html", "utf8").replace(/\n\s+/g, "\n");
writeFileSync("app/dist/index.html", html);
console.log("app/dist listo");
