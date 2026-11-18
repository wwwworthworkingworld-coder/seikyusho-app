"""アプリのアイコンと起動画面を作る。py tools/make_icon.py
インディゴの地に、白い書類と赤い丸印（請求書のしるし）。経費メモ（紺・レシート）、医療費控除メモ（緑・＋）と見分けられる"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent.parent
ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
TOP, BOTTOM = (63, 81, 181), (38, 48, 120)   # インディゴ
NAVY_BOTTOM = BOTTOM
RED, LINE = (214, 58, 46), (205, 212, 230)


def gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return img


def paper(img, cx, cy, w, h):
    """角を折った書類に、タイトルの線・明細の線・右下に赤い丸印"""
    d = ImageDraw.Draw(img)
    x0, x1, y0, y1 = cx - w // 2, cx + w // 2, cy - h // 2, cy + h // 2
    fold = w * 0.22
    d.polygon([(x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1)], fill=(255, 255, 255))
    d.polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=LINE)
    # タイトルの太い線と明細の線
    d.rounded_rectangle([x0 + w * 0.16, y0 + h * 0.18, x1 - w * 0.4, y0 + h * 0.18 + h * 0.07], radius=h * 0.03, fill=TOP)
    for i, frac in enumerate((0.36, 0.47, 0.58)):
        yy = y0 + h * frac
        d.rounded_rectangle([x0 + w * 0.16, yy, x1 - w * (0.16 if i != 2 else 0.36), yy + h * 0.045], radius=h * 0.02, fill=LINE)
    # 赤い丸印（右下）
    r = w * 0.17
    sx, sy = x1 - w * 0.3, y1 - h * 0.22
    d.ellipse([sx - r, sy - r, sx + r, sy + r], outline=RED, width=max(2, int(r * 0.16)))
    d.ellipse([sx - r * 0.55, sy - r * 0.55, sx + r * 0.55, sy + r * 0.55], fill=RED)


S = 4
big = gradient(1024 * S)
paper(big, 512 * S, 512 * S, 540 * S, 680 * S)
big.resize((1024, 1024), Image.LANCZOS).save(ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True)

splash = Image.new("RGB", (2732, 2732), BOTTOM)
paper(splash, 1366, 1366, 270, 340)
for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    splash.save(ASSETS / "Splash.imageset" / name, optimize=True)

# ---- Android（adaptive icon：前景は 108dp の中央 66% に収める。背景は単色）
AND = ROOT / "android" / "app" / "src" / "main" / "res"
if AND.exists():
    for name, dp in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
        px = int(48 * dp)
        big.resize((px, px), Image.LANCZOS).save(AND / f"mipmap-{name}" / "ic_launcher.png", optimize=True)
        r = Image.new("L", (px, px), 0); ImageDraw.Draw(r).ellipse([0, 0, px - 1, px - 1], fill=255)
        rnd = big.resize((px, px), Image.LANCZOS).convert("RGBA"); rnd.putalpha(r); rnd.save(AND / f"mipmap-{name}" / "ic_launcher_round.png", optimize=True)
        fpx = int(108 * dp)
        fg = Image.new("RGBA", (fpx, fpx), (0, 0, 0, 0))
        inner = big.resize((int(fpx * 0.72), int(fpx * 0.72)), Image.LANCZOS)
        fg.paste(inner, ((fpx - inner.width) // 2, (fpx - inner.height) // 2)); fg.save(AND / f"mipmap-{name}" / "ic_launcher_foreground.png", optimize=True)
    (AND / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % NAVY_BOTTOM, encoding="utf-8")
    for d in AND.glob("drawable*"):
        sp = d / "splash.png"
        if sp.exists():
            w, h = Image.open(sp).size
            s2 = Image.new("RGB", (w, h), NAVY_BOTTOM); paper(s2, w // 2, h // 2, int(min(w, h) * 0.1), int(min(w, h) * 0.125)); s2.save(sp, optimize=True)
print("ok")
