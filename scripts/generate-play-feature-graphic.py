"""Google Play feature graphic: 1024x500, 24-bit PNG, no alpha."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "assets" / "images" / "icon.png"
OUT_PATH = ROOT / "assets" / "store" / "google-play-feature-graphic.png"

W, H = 1024, 500
BG = (123, 107, 154)  # pinchPrimary #7B6B9A
ORB_A = (221, 212, 236, 70)
ORB_B = (107, 132, 158, 55)  # pinchRose
WHITE = (255, 255, 255)
CREAM = (244, 241, 248)
TITLE = "Pinch"
SUBTITLE = "Snap recipes from cooking videos"

FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_REG = Path(r"C:\Windows\Fonts\segoeui.ttf")


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def main() -> None:
    canvas = Image.new("RGB", (W, H), BG)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-160, -180, 480, 460), fill=ORB_A)
    od.ellipse((560, 40, 1220, 700), fill=ORB_B)
    overlay = overlay.filter(ImageFilter.GaussianBlur(48))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    icon_size = 268
    icon = Image.open(ICON_PATH).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    mask = rounded_mask(icon_size, radius=60)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    icon_x, icon_y = 108, (H - icon_size) // 2
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (icon_x + 6, icon_y + 10, icon_x + icon_size + 6, icon_y + icon_size + 10),
        radius=60,
        fill=(42, 38, 52, 48),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)

    canvas.paste(icon, (icon_x, icon_y), mask)

    draw = ImageDraw.Draw(canvas)
    font_title = ImageFont.truetype(str(FONT_BOLD), 88)
    font_sub = ImageFont.truetype(str(FONT_REG), 28)
    text_x = 420
    draw.text((text_x, 148), TITLE, font=font_title, fill=WHITE)
    draw.text((text_x, 268), SUBTITLE, font=font_sub, fill=CREAM)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT_PATH, "PNG", optimize=True)
    print(f"Wrote {OUT_PATH} ({canvas.size[0]}x{canvas.size[1]} RGB)")


if __name__ == "__main__":
    main()
