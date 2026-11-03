// Regenerates standalone.html by inlining styles.css + app.js into index.html,
// and inlining the two local images as base64 data URIs.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

let html = read('index.html');
let css = read('styles.css');
let js = read('app.js');
let live = read('live.js');

// images referenced from CSS via url(...)
const cssImages = {
  'mission-bg2.jpg': 'image/jpeg',
  'cover-golf.jpg': 'image/jpeg',
};
for (const [file, mime] of Object.entries(cssImages)) {
  const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
  const dataUri = `data:${mime};base64,${b64}`;
  css = css.split(`url(${file})`).join(`url(${dataUri})`);
}

// images referenced from JS as plain filenames (<img src>, SVG <image href>)
const jsImages = {
  '사람 형태1-small.png': 'image/png',
  'dot-1-address.webp': 'image/webp',
  'dot-2-takeaway.webp': 'image/webp',
  'dot-3-top.webp': 'image/webp',
  'dot-4-downswing.webp': 'image/webp',
  'dot-5-impact.webp': 'image/webp',
  'dot-6-finish.webp': 'image/webp',
  'dot-7-through.webp': 'image/webp',
  'camera-ready.webp': 'image/webp',
  'product-78.webp': 'image/webp',
  'camera-stand.webp': 'image/webp',
  'logo-orvia-word.webp': 'image/webp',
};
for (const [file, mime] of Object.entries(jsImages)) {
  const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
  const dataUri = `data:${mime};base64,${b64}`;
  js = js.split(file).join(dataUri);
  live = live.split(file).join(dataUri);
}

// video referenced from JS as a plain filename (<video src>)
const jsVideos = {};
for (const [file, mime] of Object.entries(jsVideos)) {
  const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
  js = js.split(file).join(`data:${mime};base64,${b64}`);
}

// NB: use function replacers — a string replacement would treat "$$" / "$&"
// in the CSS or JS as special patterns (app.js defines a `$$` helper).
html = html.replace(
  '<link rel="stylesheet" href="styles.css" />',
  () => `<style>\n${css}\n</style>`
);
html = html.replace(
  '<script src="live.js"></script>',
  () => `<script>\n${live}\n</script>`
);
html = html.replace(
  '<script src="app.js"></script>',
  () => `<script>\n${js}\n</script>`
);

fs.writeFileSync(path.join(dir, 'standalone.html'), html);
console.log('standalone.html rebuilt:', fs.statSync(path.join(dir, 'standalone.html')).size, 'bytes');
