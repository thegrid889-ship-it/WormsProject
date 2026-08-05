import base64, io, re
from PIL import Image

src = open('js/textures.js', encoding='utf-8').read()
for key in ['travnik', 'kamen', 'sopka', 'snih', 'pisky']:
    for n in ['body', 'surf']:
        m = re.search(r'\b%s:\s*\{' % key, src)
        if not m:
            print('missing', key); continue
        seg = src[m.start():m.start() + 900000]
        mm = re.search(r'\b%s:\s*"data:[^"]+"' % n, seg)
        if not mm:
            print(key, n, 'missing'); continue
        b64 = mm.group(0).split('"data:', 1)[1][:-1].split(',', 1)[1]
        im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
        px = im.load()
        w, h = im.size
        sky = 0
        total = 0
        for x in range(0, w, 3):
            for y in range(0, h, 3):
                r, g, b = px[x, y]
                total += 1
                if b >= r + 40 and b >= g + 40 and (r + g + b) / 3 > 100:
                    sky += 1
        print('%s %s %dx%d sky-leak=%d/%d' % (key, n, w, h, sky, total))
