"""Build theme/zhuque/fonts/zhuque-pixel.woff2: a GNU Unifont subset that covers
every character used by the theme (plus printable ASCII) so the pixel look works
even when the fonts-unifont package is missing. Unifont is OFL-1.1 / GPL-2+ w/ FE."""
import pathlib, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
theme = root / "theme" / "zhuque"
sources = list(theme.rglob("*.js")) + list(theme.rglob("*.html")) + list(theme.rglob("*.css")) + [root / "dev" / "mock.js", root / "dev" / "demo-extra.txt"]
chars = set(chr(c) for c in range(0x20, 0x7F))
for p in sources:
    if p.exists():
        chars |= {ch for ch in p.read_text(encoding="utf-8") if ord(ch) > 0x7F}
chars |= set("▮▯█▓▒░■□▶◀▸◆◇●○…—·「」『』〔〕（）：；，。！？、")
src = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/unifont/unifont.otf"
out = theme / "fonts" / "zhuque-pixel.woff2"
out.parent.mkdir(parents=True, exist_ok=True)
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = []
opts.name_IDs = ["*"]
opts.notdef_outline = True
font = subset.load_font(src, opts)
sub = subset.Subsetter(opts)
sub.populate(unicodes=[ord(c) for c in chars])
sub.subset(font)
# rename the family so it never shadows a real "Unifont" install
for rec in font["name"].names:
    if rec.nameID in (1, 4, 16):
        rec.string = "ZQ Pixel"
    elif rec.nameID == 6:
        rec.string = "ZQPixel-Regular"
subset.save_font(font, str(out), opts)
cmap = font.getBestCmap()
missing = sorted(c for c in chars if ord(c) not in cmap and ord(c) > 0x7F)
print(f"{len(chars)} chars requested, {len(cmap)} glyphs mapped, {out.stat().st_size/1024:.1f} KiB -> {out}")
print("missing from Unifont:", "".join(missing) or "none")
