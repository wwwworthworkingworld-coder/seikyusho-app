"""アプリのアイコンと起動画面を作る。py tools/make_icon.py
深緑の地に大きな「請」1 文字（白）と、右下に小さな朱の角印。紙・線の飾りは使わない（他の 2 本と構図・図柄・配色を分ける）"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent.parent
ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
GREEN = (27, 94, 74)          # --brand #1b5e4a
GREEN_DEEP = (17, 66, 52)
VERMILION = (205, 57, 44)
FONT = r"C:\Windows\Fonts\YuGothB.ttc"


def base(size, radial=True):
    """深緑の地。中心がわずかに明るい（単調にならない程度）"""
    img = Image.new("RGB", (size, size), GREEN_DEEP)
    if radial:
        d = ImageDraw.Draw(img)
        cx, cy = size * 0.42, size * 0.38
        steps = 60
        for i in range(steps, 0, -1):
            t = i / steps
            r = size * 0.95 * t
            col = tuple(round(b + (a - b) * (1 - t) ** 1.6) for a, b in zip(GREEN, GREEN_DEEP))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    return img


def glyph(img, cx, cy, size):
    """「請」1 文字（白）と右下の角印「印」"""
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, int(size * 0.64))
    d.text((cx - size * 0.04, cy - size * 0.02), "請", font=f, fill=(255, 255, 255), anchor="mm")
    # 角印：朱の枠に「印」。右下に小さく
    s = size * 0.2
    x1, y1 = cx + size * 0.42, cy + size * 0.42
    x0, y0 = x1 - s, y1 - s
    d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.08, fill=VERMILION)
    d.rounded_rectangle([x0 + s * 0.09, y0 + s * 0.09, x1 - s * 0.09, y1 - s * 0.09], radius=s * 0.05, outline=(255, 255, 255), width=max(2, int(s * 0.05)))
    f2 = ImageFont.truetype(FONT, int(s * 0.6))
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 + s * 0.02), "印", font=f2, fill=(255, 255, 255), anchor="mm")


S = 4
big = base(1024 * S)
glyph(big, 512 * S, 512 * S, 1024 * S)
big.resize((1024, 1024), Image.LANCZOS).save(ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True)

splash = Image.new("RGB", (2732, 2732), GREEN_DEEP)
glyph(splash, 1366, 1366, 520)
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
        inner = Image.new("RGB", (fpx, fpx), GREEN_DEEP); glyph(inner, fpx // 2, fpx // 2, int(fpx * 0.66))
        mask = Image.new("L", (fpx, fpx), 0); ImageDraw.Draw(mask).rounded_rectangle([fpx * 0.17, fpx * 0.17, fpx * 0.83, fpx * 0.83], radius=fpx * 0.12, fill=255)
        fg.paste(inner, (0, 0), mask); fg.save(AND / f"mipmap-{name}" / "ic_launcher_foreground.png", optimize=True)
    (AND / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % GREEN_DEEP, encoding="utf-8")
    for d in AND.glob("drawable*"):
        sp = d / "splash.png"
        if sp.exists():
            w, h = Image.open(sp).size
            s2 = Image.new("RGB", (w, h), GREEN_DEEP); glyph(s2, w // 2, h // 2, int(min(w, h) * 0.2)); s2.save(sp, optimize=True)
print("ok")
