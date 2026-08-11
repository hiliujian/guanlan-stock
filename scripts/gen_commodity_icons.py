#!/usr/bin/env python3
"""生成商品期货图标（金/银/铜 锭 + 原油 水滴），输出为透明背景 PNG。

坐标直接写在超采样画布（BIG=480）空间，再 LANCZOS 缩回 120x120，保证边缘平滑。
仅本地资源生成脚本，不进入运行时依赖。
"""
import os
from PIL import Image, ImageDraw

SS = 4
SIZE = 120
BIG = SIZE * SS  # 480

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "assets", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def vgrad_polygon(draw, poly, y_top, y_bot, c_top, c_bot):
    """对梯形按 y 做竖向渐变填充。poly = (xL_top, xR_top, xL_bot, xR_bot)。"""
    xL_top, xR_top, xL_bot, xR_bot = poly
    for y in range(int(y_top), int(y_bot) + 1):
        t = (y - y_top) / max(1, (y_bot - y_top))
        xL = lerp(xL_top, xL_bot, t)
        xR = lerp(xR_top, xR_bot, t)
        col = lerp_color(c_top, c_bot, t)
        draw.line([(xL, y), (xR, y)], fill=col, width=1)


def make_ingot(c_top, c_mid, c_bot, c_face):
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    y_top, y_bot = 175.0, 385.0
    xL_top, xR_top = 135.0, 345.0
    xL_bot, xR_bot = 95.0, 385.0
    vgrad_polygon(d, (xL_top, xR_top, xL_bot, xR_bot), y_top, y_bot, c_top, c_bot)

    dy = 40.0
    top_face = [
        (xL_top, y_top),
        (xR_top, y_top),
        (xR_top - 22, y_top - dy),
        (xL_top + 22, y_top - dy),
    ]
    d.polygon(top_face, fill=c_face)

    side = [(xR_top, y_top), (xR_bot, y_bot), (xR_top - 22, y_top - dy)]
    d.polygon(side, fill=lerp_color(c_bot, (0, 0, 0), 0.25))

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def make_oil():
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx, cy, r = 240.0, 300.0, 122.0
    c_top, c_bot = (92, 96, 108), (18, 18, 24)

    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c_bot)
    tip = (cx, 55.0)
    left = (cx - r * 0.72, cy - r * 0.55)
    right = (cx + r * 0.72, cy - r * 0.55)
    d.polygon([tip, left, right], fill=c_top)

    # 竖向渐变覆盖（顶部偏亮、底部偏暗）
    grad = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(BIG):
        col = lerp_color(c_top, c_bot, y / BIG)
        gd.line([(0, y), (BIG, y)], fill=(col[0], col[1], col[2], 255), width=1)
    mask = Image.new("L", (BIG, BIG), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    md.polygon([tip, left, right], fill=255)
    img = Image.composite(grad, img, mask)

    # 高光
    hl = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse(
        [cx - 55, cy - 70, cx - 10, cy - 25], fill=(255, 255, 255, 110)
    )
    img = Image.alpha_composite(img, hl)

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def save(name, img):
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG")
    print("wrote", path, os.path.getsize(path), "bytes")


save("gold.png", make_ingot((255, 233, 168), (244, 196, 48), (200, 148, 26), (255, 243, 207)))
save("silver.png", make_ingot((255, 255, 255), (216, 221, 227), (154, 163, 173), (242, 245, 248)))
save("copper.png", make_ingot((240, 180, 131), (200, 116, 58), (143, 78, 34), (248, 212, 184)))
save("oil.png", make_oil())
print("done")
