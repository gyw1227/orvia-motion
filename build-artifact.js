// Extracts the <style>/body-inner/<script>s from standalone.html into a
// head/body-free fragment suitable for publishing as an Artifact.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'standalone.html'), 'utf8');

const title = (src.match(/<title>[\s\S]*?<\/title>/) || ['<title>ARVIA — Posture Coach</title>'])[0];
const style = src.match(/<style>[\s\S]*?<\/style>/)[0];
const bodyInner = src.match(/<body>([\s\S]*?)<script>/)[1].trim();
const scripts = (src.match(/<script>[\s\S]*?<\/script>/g) || []).join('\n');   // live.js + app.js

const out = `${title}\n${style}\n${bodyInner}\n${scripts}\n`;

const outPath = path.join(dir, 'calibr-artifact.html');
fs.writeFileSync(outPath, out);
console.log('artifact fragment written:', outPath, out.length, 'bytes');
