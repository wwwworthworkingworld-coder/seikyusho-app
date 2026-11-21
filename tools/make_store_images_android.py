"""Google Play 用の画像を作る。画面は架空のデータ。
py tools/make_store_images_android.py <出力先>   （tools/serve_test.py 8768 を別に起動しておく）
出力：端末画面 4 枚（1080×1920）、フィーチャー画像 1024×500、アイコン 512×512。型は make_store_images.py と同じ（白地・見出し 1 行・傾けた書類／画面）"""
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from make_store_images import BOLD, GREEN, ROOT, SHOTS, capture_app, capture_sheet, place  # noqa: E402

W, H = 1080, 1920


def compose(img, heading, out, tilt):
    bg = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(bg)
    fs = 60
    while fs > 30 and ImageFont.truetype(BOLD, fs).getlength(heading) > W - 100: fs -= 2
    d.text((W / 2, 150), heading, font=ImageFont.truetype(BOLD, fs), fill=GREEN, anchor="mm")
    d.rectangle([W / 2 - 50, 208, W / 2 + 50, 214], fill=GREEN)
    place(bg, img, 1060 if img.width > img.height * 0.6 else 880, 270, tilt)
    bg.convert("RGB").save(out, optimize=True)


def feature(out):
    """フィーチャー画像 1024×500：白地にアイコン＋題名＋一言"""
    img = Image.new("RGB", (1024, 500), (255, 255, 255))
    d = ImageDraw.Draw(img)
    icon = Image.open(ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png").convert("RGB").resize((300, 300), Image.LANCZOS)
    mask = Image.new("L", icon.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, 299, 299], radius=64, fill=255)
    img.paste(icon, (70, 100), mask)
    d.text((410, 150), "請求書ラクラク", font=ImageFont.truetype(BOLD, 64), fill=GREEN)
    d.text((412, 240), "見積・納品・請求・領収をA4のPDFに", font=ImageFont.truetype(BOLD, 30), fill=(60, 70, 66))
    d.text((412, 285), "インボイス・内税・源泉徴収に対応", font=ImageFont.truetype(BOLD, 30), fill=(60, 70, 66))
    d.text((412, 345), "買い切り。会員登録なし", font=ImageFont.truetype(BOLD, 24), fill=(120, 130, 126))
    img.save(out, optimize=True)


if __name__ == "__main__":
    dest = Path(sys.argv[1]); dest.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="shots_"))
    for name, query, heading in SHOTS:
        img = capture_sheet(tmp) if query is None else capture_app(query, tmp)
        compose(img, heading, dest / f"{name}.png", -4 if query is None else -3)
        print(name, Image.open(dest / f"{name}.png").size)
    shutil.rmtree(tmp, ignore_errors=True)
    feature(dest / "feature_1024x500.png")
    Image.open(ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(dest / "icon_512.png", optimize=True)
    print("feature, icon ok")
