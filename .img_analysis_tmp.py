from PIL import Image
import numpy as np
import os

BASE = r'C:\Users\febry\.zcode\cli\image-cache\sess_e87d96c2-6d11-4323-abad-5d5af9e9a771'
files = ['image-8e1c1fa02ef09d3a28891535866afcf0.png','image-285b312222a3b4383fe9f02ea21a6169.png','image-898a178092f27bcabd62be0449467bea.png','image-3af683501085c79438807b9003a1a728.png','image-11e61c9981c8bc4d95dd3b75f36ca96b.png','image-f38a5b3b8287573dbb993b5a881e5e09.png','image-30ca8c58fbd80a0634ca53a2650c0eab.png','image-d52a3cf7896a24d665b4084418029183.png']

out = []
for f in files:
    im = Image.open(os.path.join(BASE, f)).convert('RGB')
    a = np.array(im).astype(int)
    h, w, _ = a.shape
    # sample specific rows to see if dark band spans full width
    dark = (a.sum(2) < 260)
    res = {'file': f}
    # row 110: full width?
    for y in [110, 300, 480, 700, 1000, 1400]:
        if y < h:
            frac = dark[y].mean()
            col = a[y, w // 2]
            res['y%d' % y] = ('darkfrac=%.2f' % frac, 'center=#%02x%02x%02x' % tuple(col))
    # check left margin: are columns 0-30 always white? -> edge-to-edge?
    left = a[:, :20].mean()
    res['leftmargin_mean'] = round(left, 1)
    # find the largest non-white bounding box
    nonwhite = (np.abs(a - 255).sum(2) > 30)
    rows = np.where(nonwhite.any(1))[0]
    cols = np.where(nonwhite.any(0))[0]
    res['content_bbox'] = (int(cols.min()), int(rows.min()), int(cols.max()), int(rows.max())) if len(rows) else None
    out.append(res)

for r in out:
    print(r['file'][:28])
    for k in r:
        if k != 'file':
            print('   ', k, ':', r[k])
