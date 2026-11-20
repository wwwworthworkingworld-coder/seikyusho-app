"""監修用サンプル PDF：tools/make_samples.js が書いた HTML を Chrome（headless）で A4 PDF にする。
py tools/make_samples.py <HTML のフォルダー> <PDF の出力先>"""
import shutil, subprocess, sys, tempfile
from pathlib import Path

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
src, dest = Path(sys.argv[1]), Path(sys.argv[2])
dest.mkdir(parents=True, exist_ok=True)
for html in sorted(src.glob("*.html")):
    prof = tempfile.mkdtemp(prefix="chrome_")
    tmp_pdf = Path(prof) / "out.pdf"
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={prof}", "--no-pdf-header-footer",
                        f"--print-to-pdf={tmp_pdf}", html.resolve().as_uri()], capture_output=True, timeout=120)
    if not tmp_pdf.exists():
        print("FAILED", html.name, r.stderr[-400:]); continue
    shutil.copy(tmp_pdf, dest / (html.stem + ".pdf"))
    shutil.rmtree(prof, ignore_errors=True)
    print("ok", html.stem)
try:
    import fitz
    for p in sorted(dest.glob("*.pdf")):
        d = fitz.open(p); print(f"  {p.name}: {len(d)} ページ, {round(d[0].rect.width)}x{round(d[0].rect.height)} pt")
except ImportError:
    pass
