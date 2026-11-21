"""App Store の画像（1320×2868）を作る。画面は架空のデータ。
py tools/make_store_images.py <出力先>   （tools/serve_test.py 8768 を別に起動しておく）
型：白地に見出し 1 行、書類／画面を少し傾けて大きく置く。1 枚目は完成した A4 の請求書そのもの。
順番：1 完成した PDF → 2 3 タップ → 3 未入金 → 4 印影"""
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1320, 2868
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
NODE = Path(os.environ.get("LOCALAPPDATA", "")) / "keihi-tools" / "node-v22.23.4-win-x64" / "node.exe"
BOLD = r"C:\Windows\Fonts\YuGothB.ttc"
GREEN = (27, 94, 74)
ROOT = Path(__file__).parent.parent
SHOTS = [
    ("1_pdf", None, "スマホだけで、A4の請求書をPDFに"),
    ("2_edit", "?seed=1&shot=1&open=1", "取引先と品目はタップで入る"),
    ("3_list", "?seed=1&shot=1", "未入金と期限超過が一目で"),
    ("4_seal", "?seed=1&shot=1&to=sealChips#settings", "印影とロゴは屋号から自動で"),
]


def run_chrome(args, timeout=120):
    prof = tempfile.mkdtemp(prefix="chrome_")
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", f"--user-data-dir={prof}", "--hide-scrollbars", "--disable-gpu", "--no-first-run", *args], check=False, capture_output=True, timeout=timeout)
    shutil.rmtree(prof, ignore_errors=True)


def capture_app(query, folder):
    out = folder / "app.png"
    run_chrome(["--window-size=500,956", "--force-device-scale-factor=3", "--virtual-time-budget=5000", f"--screenshot={out}", f"http://localhost:8768/frame?q={urllib.parse.quote(query)}"])
    return Image.open(out).crop((0, 0, 1320, 2868)).convert("RGB")


def capture_sheet(folder):
    """完成した請求書（架空）を A4 のまま撮る。tools/make_samples.js の 0_請求書 を Chrome で描く"""
    subprocess.run([str(NODE), str(ROOT / "tools" / "make_samples.js"), str(folder)], check=True, capture_output=True)
    html = folder / "0_請求書.html"
    out = folder / "sheet.png"
    run_chrome(["--window-size=794,1123", "--force-device-scale-factor=2", "--virtual-time-budget=3000", f"--screenshot={out}", html.resolve().as_uri()])
    return Image.open(out).convert("RGB")


def place(bg, img, width, top, angle=-5):
    """影を付けて少し傾けて置く"""
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    pad = 60
    layer = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([pad, pad, pad + img.width, pad + img.height], fill=(20, 40, 30, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    layer.alpha_composite(shadow, (0, 18))
    layer.paste(img, (pad, pad))
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = (bg.width - layer.width) // 2
    bg.alpha_composite(layer, (x, top))


def compose(img, heading, out, tilt):
    bg = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(bg)
    fs = 84
    while fs > 40 and ImageFont.truetype(BOLD, fs).getlength(heading) > W - 120: fs -= 2   # 1 行に収める
    f = ImageFont.truetype(BOLD, fs)
    d.text((W / 2, 230), heading, font=f, fill=GREEN, anchor="mm")
    d.rectangle([W / 2 - 60, 310, W / 2 + 60, 318], fill=GREEN)
    place(bg, img, 1300 if img.width > img.height * 0.6 else 1120, 400, tilt)
    bg.convert("RGB").save(out, optimize=True)


if __name__ == "__main__":
    dest = Path(sys.argv[1]); dest.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="shots_"))
    for name, query, heading in SHOTS:
        img = capture_sheet(tmp) if query is None else capture_app(query, tmp)
        compose(img, heading, dest / f"{name}.png", -4 if query is None else -3)
        print(name, Image.open(dest / f"{name}.png").size)
    shutil.rmtree(tmp, ignore_errors=True)
