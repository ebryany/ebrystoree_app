from PIL import Image
import os

BASE = r'C:\Users\febry\.zcode\cli\image-cache\sess_e87d96c2-6d11-4323-abad-5d5af9e9a771'
OUT = r'C:\Users\febry\Documents\backup\.img_upscaled_tmp'
os.makedirs(OUT, exist_ok=True)

files = {
    'image-8e1c1fa02ef09d3a28891535866afcf0.png': '01.png',
    'image-285b312222a3b4383fe9f02ea21a6169.png': '02.png',
    'image-898a178092f27bcabd62be0449467bea.png': '03.png',
    'image-3af683501085c79438807b9003a1a728.png': '04.png',
    'image-11e61c9981c8bc4d95dd3b75f36ca96b.png': '05.png',
    'image-f38a5b3b8287573dbb993b5a881e5e09.png': '06.png',
    'image-30ca8c58fbd80a0634ca53a2650c0eab.png': '07.png',
    'image-d52a3cf7896a24d665b4084418029183.png': '08.png',
}

for src, dst in files.items():
    im = Image.open(os.path.join(BASE, src)).convert('RGB')
    up = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    up.save(os.path.join(OUT, dst), 'PNG')
    print('saved', dst, up.size)
