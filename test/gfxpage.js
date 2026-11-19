// Shared by test/modelshot.js and test/gfxdemo.js: builds a standalone HTML page with the REAL engine
// (vendor/three.bundle.min.js + src/50-gfx-toon.js, 50-gfx.js, 51-assets.js, 53-stagekit.js, 54-vfx.js), the given
// models embedded the way build.py embeds them (<script id="sj-model-<name>">), and test/gfxstage.js (GfxTest).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ENGINE = ['50-gfx-toon.js', '50-gfx.js', '51-assets.js', '53-stagekit.js', '54-vfx.js'];

// 'hero' -> vendor/models/hero.glb, else test/fixtures/models/hero.glb; or a path to a .glb
function findModel(nameOrPath){
  if (/\.glb$/i.test(nameOrPath) && fs.existsSync(nameOrPath)) return { name: path.basename(nameOrPath).replace(/\.glb$/i, '').replace(/[^A-Za-z0-9_]/g, '_'), file: path.resolve(nameOrPath) };
  for (const dir of ['vendor/models', 'test/fixtures/models']) { const f = path.join(ROOT, dir, nameOrPath + '.glb'); if (fs.existsSync(f)) return { name: nameOrPath, file: f }; }
  throw new Error('no model "' + nameOrPath + '" in vendor/models or test/fixtures/models');
}
function fontCss(){
  const f = (fam, file, w) => "@font-face{font-family:'" + fam + "';font-weight:" + w + ";src:url(data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, 'vendor/fonts', file)).toString('base64') + ") format('woff2')}";
  return f('Bagel Fat One', 'bagel-fat-one-latin.woff2', '400') + f('Baloo 2', 'baloo2-latin.woff2', '400 800');
}
// models: [{name, file}]   body: extra HTML   script: page JS run after the engine
function buildPage(models, script, body, title){
  const tags = models.map(m => '<script type="application/octet-stream" id="sj-model-' + m.name + '">' + fs.readFileSync(m.file).toString('base64') + '</script>').join('\n');
  const js = ENGINE.map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(__dirname, 'gfxstage.js'), 'utf8');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + (title || 'Strum Jam GFX') + '</title><style>' + fontCss() +
    "html,body{margin:0;height:100%;overflow:hidden;background:#120d2e;font-family:'Baloo 2',sans-serif}#c{position:fixed;inset:0;width:100%;height:100%;display:block}</style></head><body>" +
    '<canvas id="c"></canvas>' + (body || '') + '\n' + tags + '\n<script>\n' + fs.readFileSync(path.join(ROOT, 'vendor/three.bundle.min.js'), 'utf8') + '\n</script>\n<script>\n' + js + '\n' + script + '\n</script></body></html>';
}
module.exports = { ROOT, findModel, buildPage };
