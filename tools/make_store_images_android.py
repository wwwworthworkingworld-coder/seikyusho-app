"""Google Play 用の画像を作る。画面は架空のデータ。
py tools/make_store_images_android.py <出力先>   （tools/serve_test.py 8768 を別に起動しておく）
出力：端末画面 4 枚（1080×1920、Play の 16:9〜9:16 の範囲）、フィーチャー画像 1024×500、アイコン 512×512"""
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BOLD = r"C:\Windows\Fonts\meiryob.ttc"
TOP, BOTTOM = (63, 81, 181), (38, 48, 120)
ROOT = Path(__file__).parent.parent
SHOTS = [
    ("1_preview", "?seed=1&shot=1&open=preview", ["スマホだけで", "請求書をPDFに"], "見積書・納品書・請求書・領収書。インボイス・源泉徴収も"),
    ("2_edit", "?seed=1&shot=1&open=1", ["3タップで1枚", "取引先と品目はタップで"], "入力のたびに自動保存。会員登録も通信もなし"),
    ("3_list", "?seed=1&shot=1", ["データは消えない", "バックアップで安心"], "ファイルに書き出して機種変更でも安心。未入金も一目で"),
    ("4_settings", "?seed=1&shot=1&to=colorChips#settings", ["印影・ロゴ・色テンプレ", "買い切り2,500円"], "印影 6 種とロゴを自動で。サブスクではありません"),
]


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return img


def capture(name, query, folder):
    prof = tempfile.mkdtemp(prefix="chrome_")
    out = folder / f"{name}.png"
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", f"--user-data-dir={prof}", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
                    "--window-size=500,956", "--force-device-scale-factor=3", "--virtual-time-budget=5000",
                    f"--screenshot={out}", f"http://localhost:8768/frame?q={urllib.parse.quote(query)}"], check=False, capture_output=True, timeout=120)
    shutil.rmtree(prof, ignore_errors=True)
    Image.open(out).crop((0, 0, 1320, 2868)).save(out)
    return out


def compose(shot, lines, sub, out):
    img = gradient(W, H)
    d = ImageDraw.Draw(img)
    f1, f2 = ImageFont.truetype(BOLD, 76), ImageFont.truetype(BOLD, 34)
    y = 90
    for line in lines:
        d.text((W / 2, y), line, font=f1, fill=(255, 255, 255), anchor="ma")
        y += 100
    d.text((W / 2, y + 16), sub, font=f2, fill=(255, 220, 180), anchor="ma")
    pw = 820
    screen = Image.open(shot).convert("RGB")
    screen = screen.resize((pw, round(screen.height * pw / screen.width)), Image.LANCZOS)
    top = 400
    frame = Image.new("L", screen.size, 0)
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, screen.width - 1, screen.height + 200], radius=70, fill=255)
    img.paste(screen, ((W - pw) // 2, top), frame)
    img.save(out, optimize=True)


def feature(out):
    """フィーチャー画像 1024×500：アイコン＋題名＋一言"""
    img = gradient(1024, 500)
    d = ImageDraw.Draw(img)
    icon = Image.open(ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png").convert("RGB").resize((300, 300), Image.LANCZOS)
    mask = Image.new("L", icon.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, 299, 299], radius=64, fill=255)
    img.paste(icon, (70, 100), mask)
    f1, f2 = ImageFont.truetype(BOLD, 64), ImageFont.truetype(BOLD, 30)
    d.text((410, 150), "請求書ラクラク", font=f1, fill=(255, 255, 255))
    d.text((412, 240), "見積書・納品書・請求書・領収書を", font=f2, fill=(255, 220, 180))
    d.text((412, 285), "スマホだけでA4のPDFに", font=f2, fill=(255, 220, 180))
    d.text((412, 345), "データは端末の中だけ・会員登録なし・広告なし", font=ImageFont.truetype(BOLD, 24), fill=(220, 225, 245))
    img.save(out, optimize=True)


if __name__ == "__main__":
    dest = Path(sys.argv[1]); dest.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="shots_"))
    for name, query, lines, sub in SHOTS:
        compose(capture(name, query, tmp), lines, sub, dest / f"{name}.png")
        print(name, Image.open(dest / f"{name}.png").size)
    shutil.rmtree(tmp, ignore_errors=True)
    feature(dest / "feature_1024x500.png")
    Image.open(ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(dest / "icon_512.png", optimize=True)
    print("feature, icon ok")
