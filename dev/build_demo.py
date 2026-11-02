"""Generate browser previews of the theme from the real theme files.

  dev/preview.html      -> links ../theme/zhuque/* (for local testing)
  preview.html          -> single self-contained file (CSS, JS, font inlined)
"""
import base64, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
theme = root / "theme" / "zhuque"
mock = (root / "dev" / "mock.js").read_text(encoding="utf-8")

BADGE_CSS = """
#demo-note{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:50;
  font:13px/1.5 "ZQ Pixel","Unifont",monospace;color:#8a1a22;text-shadow:none;pointer-events:none;white-space:nowrap}
#demo-note.big{font-size:16px;color:#ffb8ad;top:45%}
@media (max-width:860px){#demo-note{position:absolute;top:auto;bottom:4px;white-space:normal;width:calc(100% - 32px);text-align:center}}
"""
BADGE = '<div id="demo-note">演示模式 · 测试口令：zhuque</div>'

def page(name, inline):
    html = (theme / name).read_text(encoding="utf-8")
    css = (theme / "css" / "zhuque.css").read_text(encoding="utf-8")
    js = (theme / "js" / "zhuque.js").read_text(encoding="utf-8")
    if inline:
        font = base64.b64encode((theme / "fonts" / "zhuque-pixel.woff2").read_bytes()).decode()
        css = css.replace('url("../fonts/zhuque-pixel.woff2")', f'url("data:font/woff2;base64,{font}")')
        html = html.replace('<link rel="stylesheet" href="css/zhuque.css">', f"<style>\n{css}\n{BADGE_CSS}</style>")
        html = html.replace('<script src="js/zhuque.js"></script>', f"<script>\n{mock}\n</script>\n<script>\n{js}\n</script>")
    else:
        html = html.replace('href="css/zhuque.css">', f'href="../theme/zhuque/css/zhuque.css">\n  <style>{BADGE_CSS}</style>')
        html = html.replace('<script src="js/zhuque.js"></script>', '<script src="mock.js"></script>\n  <script src="../theme/zhuque/js/zhuque.js"></script>')
    html = re.sub(r"(<body[^>]*>)", r"\1\n  " + BADGE, html, count=1)
    return html

(root / "dev" / "preview.html").write_text(page("index.html", False), encoding="utf-8")
(root / "dev" / "preview-secondary.html").write_text(page("secondary.html", False), encoding="utf-8")
out = root / "dist"; out.mkdir(exist_ok=True)
standalone = page("index.html", True)
(out / "zhuque-demo.html").write_text(standalone, encoding="utf-8")
(root / "preview.html").write_text(standalone, encoding="utf-8")
print("built:", *[p.relative_to(root) for p in [root/"dev/preview.html", root/"dev/preview-secondary.html", out/"zhuque-demo.html"]])
