import sys, re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
hosted_url = sys.argv[1] if len(sys.argv) > 1 else ''
head = open('src/01-head.html', encoding='utf-8').read()
# the game's type (Bagel Fat One for titles, Baloo 2 for everything else), embedded so it works offline (SIL OFL, vendor/fonts)
import base64 as _b64
def _face(fam, f, w): return "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, w, _b64.b64encode(open('vendor/fonts/' + f, 'rb').read()).decode())
head = head.replace('<!--FONTS-->', '<style>' + _face('Bagel Fat One', 'bagel-fat-one-latin.woff2', '400') + _face('Baloo 2', 'baloo2-latin.woff2', '400 800') + _face('SJ Logo', 'dejavu-sans-logo.woff2', '400') + '</style>')
parts = ['05-settings.js','10-theory.js','20-songs.js','25-lookup.js','26-chart.js','30-audio.js','35-music.js','36-sfx.js','40-mic.js','41-midi.js','45-ear.js','46-listen.js','47-analyze.js','48-scenes.js','50-render.js','52-drummer.js','60-game.js','61-lyrics.js','62-parts.js','63-band.js','64-curated.js','65-story.js','66-battle.js','67-challenge.js','68-menubg.js','69-online.js','70-ui.js','71-inst.js','72-calib.js']
js = '\n'.join(open('src/'+p, encoding='utf-8').read() for p in parts)
# the neural listener's engine and model, embedded so the page needs no network
import json, base64
V = 'vendor/'
def esc(t): return json.dumps(t).replace('</', '<\\/')
assets = ('/* Note recognition: Basic Pitch model (c) Spotify AB and TensorFlow.js (c) Google LLC, both under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). */\n' + 'const LISTEN_ASSETS = {scripts: [' + ','.join(esc(open(V + f).read()) for f in ['tf-core.min.js', 'tf-backend-cpu.min.js', 'tf-converter.min.js', 'tf-backend-wasm.min.js']) + '],'
  + 'wasm: "' + base64.b64encode(open(V + 'tfjs-backend-wasm.wasm', 'rb').read()).decode() + '",'
  + 'wasmSimd: "' + base64.b64encode(open(V + 'tfjs-backend-wasm-simd.wasm', 'rb').read()).decode() + '",'
  + 'model: ' + json.dumps(json.load(open(V + 'model.json'))) + ','
  + 'weights: "' + base64.b64encode(open(V + 'group1-shard1of1.bin', 'rb').read()).decode() + '"};\n')
js = assets + js
# chord data read by 25-lookup.js / 26-chart.js: the Chordonomicon title index and the Hooktheory table
blobs = ''.join('<script type="application/octet-stream" id="%s">%s</script>\n' % (i, base64.b64encode(open(V + f, 'rb').read()).decode())
                for i, f in [('sj-chord-index', 'chord-index.bin'), ('sj-hooktheory', 'hooktheory.json.gz')])
head = head + blobs.rstrip('\n')
frag = head + '\n<script>\n' + js + '\n</script>\n'
os.makedirs('dist', exist_ok=True)
open('dist/index.html','w', encoding='utf-8').write(frag)
i = frag.index('<!-- ============ TITLE')
local_js = js.replace("const HOSTED_URL = '__HOSTED_URL__';", "const HOSTED_URL = %r;" % hosted_url)
local = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
         + head[:head.index('<!-- ============ TITLE')] + '</head>\n<body>\n'
         + head[head.index('<!-- ============ TITLE'):] + '\n<script>\n' + local_js + '\n</script>\n</body>\n</html>\n')
open('dist/strum-jam.html','w', encoding='utf-8').write(local)
print(len(frag), len(local))
