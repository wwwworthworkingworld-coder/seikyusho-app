"""ロゴ見本 10 案を 1 枚の画像にする（ユーザーに見せる用）。py tools/make_logo_samples.py <出力 png>
www/logo.js をそのまま使い、Chrome（ヘッドレス）で描く。屋号は架空。"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
NAME = "株式会社見本商事"
CASES = [  # (型, 色, 書体, 見出し)
    ("wordmark", "navy-gold", "sans", "1 ワードマーク（下線）ネイビー×ゴールド"),
    ("badge-circle", "navy-white", "sans", "2 丸バッジ＋屋号 ネイビー×白"),
    ("badge-square", "teal-white", "maru", "3 角丸スクエア 青緑／丸ゴシック"),
    ("wordmark-frame", "green-cream", "mincho", "4 細枠ワードマーク 深緑／明朝"),
    ("initial-stack", "charcoal-orange", "sans", "5 頭文字＋屋号 2 段 チャコール×オレンジ"),
    ("inverse", "black-white", "sans", "6 反転色 黒×白"),
    ("line-frame", "wine-beige", "mincho", "7 線の飾り枠 ワイン／明朝"),
    ("hexagon", "navy-gold", "sans", "8 六角形バッジ ネイビー×ゴールド"),
    ("wafu-rakkan", "sumi-shu", "mincho", "9 和風（落款つき）墨×朱／明朝"),
    ("monogram", "green-cream", "sans", "10 モノグラム（正方形）深緑"),
]

html = f"""<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body{{margin:0;background:#f4f5f8;font-family:"Yu Gothic UI","Meiryo",sans-serif;width:1200px}}
h1{{font-size:28px;margin:28px 40px 6px}} p.lead{{margin:0 40px 18px;color:#555;font-size:15px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:0 40px 40px}}
.tile{{background:#fff;border-radius:14px;padding:18px 18px 12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}}
.tile .stage{{height:150px;display:flex;align-items:center;justify-content:center}}
.tile svg{{max-width:100%;max-height:140px}} .tile h2{{font-size:15px;margin:10px 0 0;color:#222}}
.tile small{{display:block;color:#777;font-size:12px;margin-top:2px}}
.bw{{filter:grayscale(1)}} .mini{{display:flex;gap:14px;align-items:center;margin-top:8px}} .mini svg{{height:40px;width:auto}}
</style></head><body><h1>ロゴの自動生成 見本 10 案（屋号は架空「{NAME}」）</h1>
<p class="lead">右下の小さい版は、請求書に載せたときの大きさ（高さ約 14mm）と白黒印刷の見え方。すべて端末内で生成、型 10 × 色 8 × 書体 3 から「もう一度作る」でも出せます。</p>
<div class="grid" id="g"></div>
<script src="logo.js"></script><script>
const L=window.SeikyushoLogo;const cases=__CASES__;
document.getElementById('g').innerHTML=cases.map(([t,p,f,h])=>{{const svg=L.logoSvg(__NAME__,{{template:t,palette:p,font:f,seed:1}});return `<div class="tile"><div class="stage">${{svg}}</div><h2>${{h}}</h2><div class="mini"><span>${{svg}}</span><span class="bw">${{svg}}</span><small>← 請求書サイズ／白黒</small></div></div>`}}).join('');
</script></body></html>""".replace("__CASES__", str([list(c) for c in CASES]).replace("'", '"')).replace("__NAME__", '"' + NAME + '"')

if __name__ == "__main__":
    out = Path(sys.argv[1]); out.parent.mkdir(parents=True, exist_ok=True)
    page = ROOT / "www" / "_logo_samples.html"; page.write_text(html, encoding="utf-8")   # tools/serve_test.py 8768 を起動しておく
    prof = tempfile.mkdtemp(prefix="chrome_")
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", f"--user-data-dir={prof}", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
                    "--window-size=1200,1750", "--force-device-scale-factor=2", "--virtual-time-budget=4000", f"--screenshot={out.resolve()}", "http://localhost:8768/_logo_samples.html"],
                   check=False, capture_output=True, timeout=120)
    shutil.rmtree(prof, ignore_errors=True); page.unlink(missing_ok=True)
    print(out, out.exists())
