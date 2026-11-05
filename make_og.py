# Generates og-image.png (1200x630) for social/AI sharing from the logo assets.
# Usage: python make_og.py   (run from the repo root; needs Pillow + Windows Segoe UI fonts)
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
ink = (55, 53, 47)
soft = (107, 106, 101)
accent = (31, 111, 209)
line = (233, 232, 228)

# canvas uses the wordmark card colour so the pasted artwork has no visible edge
wm = Image.open("assets/wordmark-light.png").convert("RGBA")
bg = wm.getpixel((12, wm.size[1] // 2))[:3]
img = Image.new("RGBA", (W, H), bg + (255,))
d = ImageDraw.Draw(img)

segb = "C:/Windows/Fonts/segoeuib.ttf"
segr = "C:/Windows/Fonts/segoeui.ttf"
f_head = ImageFont.truetype(segb, 52)
f_sub = ImageFont.truetype(segr, 28)
f_feat = ImageFont.truetype(segr, 25)
f_url = ImageFont.truetype(segb, 26)

# wordmark (Paper variant) at native size so it stays crisp
img.alpha_composite(wm, (64, 52))

# headline + subline
d.text((80, 250), "Read, comment & edit Markdown —", font=f_head, fill=ink)
d.text((80, 314), "then hand it to your AI.", font=f_head, fill=ink)
d.text((82, 392), "Inline comments · Outline · Markdown editor · Export for ChatGPT, Claude, Gemini",
       font=f_sub, fill=soft)

# the three theme icons, top right
labels = [("light", "Paper"), ("sepia", "Sepia"), ("dark", "Night")]
size, gap = 112, 22
x0 = W - 64 - 3 * size - 2 * gap
y0 = 66
for i, (name, label) in enumerate(labels):
    ic = Image.open(f"assets/icon-{name}.png").convert("RGBA").resize((size, size), Image.LANCZOS)
    x = x0 + i * (size + gap)
    img.alpha_composite(ic, (x, y0))
    tw = d.textlength(label, font=f_feat)
    d.text((x + (size - tw) / 2, y0 + size + 6), label, font=f_feat, fill=soft)

# footer url
d.line([(80, H - 96), (500, H - 96)], fill=line, width=2)
d.text((80, H - 78), "ductienuit.github.io/mdeverything", font=f_url, fill=accent)

img.convert("RGB").save("og-image.png", optimize=True)
print("wrote og-image.png")
