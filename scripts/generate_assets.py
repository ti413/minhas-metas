"""
Gera todos os assets visuais do app Minhas Metas:
- icon-192.png, icon-512.png
- icon-maskable-192.png, icon-maskable-512.png
- screenshots/screenshot-registro.png
- screenshots/screenshot-calendario.png
- screenshots/screenshot-dashboard.png
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

# ─── Paleta ────────────────────────────────────────────────────────────────────
PRIMARY      = (76, 175, 135)      # #4CAF87
PRIMARY_DARK = (53, 122,  94)      # #357A5E
PRIMARY_LIGHT= (214, 239, 228)     # #D6EFE4
PRIMARY_XL   = (235, 247, 242)     # #EBF7F2
BG           = (244, 248, 245)     # #F4F8F5
SURFACE      = (255, 255, 255)
SURFACE2     = (240, 245, 242)     # #F0F5F2
BORDER       = (216, 234, 225)     # #D8EAE1
TEXT         = ( 30,  45,  38)     # #1E2D26
TEXT2        = ( 90, 114, 104)     # #5A7268
TEXT3        = (143, 168, 159)     # #8FA89F
RED_BG       = (254, 240, 238)
RED          = (192,  73,  58)
AMBER        = (160, 112,  32)
WHITE        = (255, 255, 255)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def rounded_rect(draw, xy, radius, fill, outline=None, outline_width=0):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill,
                           outline=outline, width=outline_width)


def checkmark(draw, cx, cy, size, color, width=None):
    w = width or max(2, size // 10)
    p1 = (cx - size * 0.35, cy)
    p2 = (cx - size * 0.05, cy + size * 0.35)
    p3 = (cx + size * 0.40, cy - size * 0.35)
    draw.line([p1, p2], fill=color, width=w)
    draw.line([p2, p3], fill=color, width=w)


def leaf_path(draw, cx, cy, size, color):
    """Draws a simple stylised leaf."""
    cx, cy, size = int(cx), int(cy), int(size)
    pts = []
    for i in range(36):
        angle = math.radians(i * 10)
        r = size * (0.55 + 0.45 * math.cos(angle)) * 0.5
        x = int(cx + r * math.sin(angle))
        y = int(cy - r * math.cos(angle) * 1.2)
        pts.append((x, y))
    draw.polygon(pts, fill=color)
    sw = max(2, size // 20)
    draw.line([(cx, cy + size // 4), (cx, cy + size // 2)],
              fill=PRIMARY_DARK, width=sw)


def font(size, bold=False):
    """Try to load a system font, fallback to default."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def text_center(draw, text, cx, cy, fnt, fill):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - w / 2, cy - h / 2), text, font=fnt, fill=fill)


# ─── Icons ────────────────────────────────────────────────────────────────────

def make_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = size * 0.12 if maskable else 0
    s = size - 2 * pad

    # Background circle / rounded square
    if maskable:
        # Maskable: fill entire canvas with primary color
        draw.rounded_rectangle([0, 0, size, size], radius=size * 0.22, fill=PRIMARY)
    else:
        draw.rounded_rectangle([pad, pad, pad + s, pad + s], radius=s * 0.22, fill=PRIMARY)

    cx, cy = size / 2, size / 2

    # Leaf
    leaf_sz = s * 0.32
    leaf_cx = cx - s * 0.06
    leaf_cy = cy - s * 0.08
    leaf_path(draw, leaf_cx, leaf_cy, leaf_sz, WHITE)

    # Checkmark below leaf
    ck_sz = s * 0.20
    checkmark(draw, cx + s * 0.08, cy + s * 0.16, ck_sz, WHITE,
              width=max(2, int(size / 30)))

    return img


def save_icon(size, maskable=False):
    img = make_icon(size, maskable)
    prefix = "icon-maskable" if maskable else "icon"
    path = os.path.join(BASE_DIR, f"{prefix}-{size}.png")
    img.save(path, "PNG")
    print(f"  ✓ {prefix}-{size}.png")


# ─── Screenshot helpers ────────────────────────────────────────────────────────

W, H = 390, 844   # standard phone dimensions

def new_screen():
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)


def draw_topbar(draw, date_str="Sábado, 07 de junho de 2026"):
    # Topbar background
    draw.rectangle([0, 0, W, 68], fill=SURFACE)
    draw.line([(0, 68), (W, 68)], fill=BORDER, width=1)
    f_title = font(19, bold=True)
    f_date  = font(12)
    draw.text((20, 14), "🌿 Minhas Metas", font=f_title, fill=PRIMARY_DARK)
    draw.text((20, 42), date_str, font=f_date, fill=TEXT2)


def draw_navbar(draw, active="register"):
    # Navbar background
    draw.rectangle([0, H - 70, W, H], fill=SURFACE)
    draw.line([(0, H - 70), (W, H - 70)], fill=BORDER, width=1)

    tabs = [
        ("register",  "Registrar"),
        ("calendar",  "Calendário"),
        ("dashboard", "Dashboard"),
        ("privacy",   "Privacidade"),
    ]
    tab_w = W // len(tabs)
    f_lbl = font(10)

    for i, (key, label) in enumerate(tabs):
        cx = tab_w * i + tab_w // 2
        cy = H - 35
        color = PRIMARY_DARK if key == active else TEXT3
        # simple square icon placeholder
        icon_sz = 22
        draw.rounded_rectangle(
            [cx - icon_sz//2, cy - icon_sz - 4, cx + icon_sz//2, cy - 4],
            radius=4, fill=PRIMARY_LIGHT if key == active else SURFACE2
        )
        bbox = draw.textbbox((0, 0), label, font=f_lbl)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, cy), label, font=f_lbl, fill=color)


def progress_bar(draw, y, pct, done, total, pending):
    # Card
    draw.rounded_rectangle([16, y, W - 16, y + 105], radius=16, fill=SURFACE)

    f14b = font(14, bold=True)
    f22b = font(22, bold=True)
    f10  = font(10)
    f13  = font(13)

    draw.text((28, y + 14), "Progresso do dia", font=f14b, fill=TEXT)
    pct_str = f"{pct}%"
    bbox = draw.textbbox((0, 0), pct_str, font=f22b)
    draw.text((W - 28 - (bbox[2]-bbox[0]), y + 10), pct_str, font=f22b, fill=PRIMARY_DARK)

    # Bar
    bx0, bx1 = 28, W - 28
    by = y + 50
    draw.rounded_rectangle([bx0, by, bx1, by + 10], radius=5, fill=BORDER)
    bar_w = int((bx1 - bx0) * pct / 100)
    if bar_w > 0:
        draw.rounded_rectangle([bx0, by, bx0 + bar_w, by + 10], radius=5, fill=PRIMARY)

    # Stats
    sw = (W - 56) // 3
    for idx, (val, lbl) in enumerate([(done, "feitas"), (total, "total"), (pending, "pendentes")]):
        sx = 28 + idx * sw
        draw.rounded_rectangle([sx, by + 20, sx + sw - 8, by + 48], radius=10, fill=SURFACE2)
        f15b = font(15, bold=True)
        text_center(draw, str(val), sx + (sw - 8)//2, by + 30, f15b, PRIMARY_DARK)
        text_center(draw, lbl, sx + (sw - 8)//2, by + 42, f10, TEXT3)


def goal_card(draw, x, y, w, h, icon_char, name, sub, done=False, value=""):
    bg   = PRIMARY_XL if done else SURFACE
    bord = PRIMARY    if done else BORDER
    draw.rounded_rectangle([x, y, x+w, y+h], radius=16, fill=bg, outline=bord, width=2)

    icon_bg = PRIMARY_LIGHT if done else SURFACE2
    draw.rounded_rectangle([x+12, y+12, x+52, y+52], radius=10, fill=icon_bg)
    f20 = font(16, bold=True)
    icon_color = PRIMARY_DARK if done else TEXT2
    text_center(draw, icon_char, x+32, y+32, f20, icon_color)

    # Checkmark circle
    cx, cy = x+w-18, y+20
    if done:
        draw.ellipse([cx-10, cy-10, cx+10, cy+10], fill=PRIMARY)
        checkmark(draw, cx, cy, 14, WHITE, width=2)
    else:
        draw.ellipse([cx-10, cy-10, cx+10, cy+10], outline=BORDER, width=2)

    f13b = font(13, bold=True)
    f11  = font(11)
    name_color = PRIMARY_DARK if done else TEXT
    sub_color  = PRIMARY      if done else TEXT3
    draw.text((x+12, y+60), name, font=f13b, fill=name_color)
    draw.text((x+12, y+76), sub, font=f11, fill=sub_color)

    if value:
        draw.rounded_rectangle([x+10, y+h-30, x+w-10, y+h-8], radius=8,
                                fill=PRIMARY_LIGHT if done else SURFACE2,
                                outline=PRIMARY if done else BORDER, width=2)
        fv = font(13)
        text_center(draw, value, x+w//2, y+h-19, fv, TEXT)


# ─── Screenshot 1: Registro ───────────────────────────────────────────────────

def screenshot_registro():
    img, draw = new_screen()
    draw_topbar(draw)

    progress_bar(draw, y=80, pct=57, done=4, total=7, pending=3)

    goals = [
        ("🏃", "Corrida",    "quilômetros", True,  "5.2km"),
        ("🏋️", "Academia",   "treino do dia", True, ""),
        ("🌙", "Sono",       "horas dormidas", True, "7.5h"),
        ("📖", "Leitura",    "leitura diária", True, ""),
        ("🥗", "Alimentação","meta nutricional", False,""),
        ("💧", "Água",       "litros", False, "1.2L"),
        ("📖", "Bíblia",     "leitura diária", False,""),
    ]

    gw = (W - 48) // 2
    gh = 100
    for i, (icon, name, sub, done, val) in enumerate(goals[:6]):
        col = i % 2
        row = i // 2
        gx = 16 + col * (gw + 8)
        gy = 200 + row * (gh + 8)
        goal_card(draw, gx, gy, gw, gh, icon, name, sub, done, val)

    # Save button
    draw.rounded_rectangle([16, H - 155, W - 16, H - 110], radius=16, fill=PRIMARY)
    f15b = font(15, bold=True)
    text_center(draw, "💾  Salvar dia", W//2, H - 132, f15b, WHITE)

    draw_navbar(draw, "register")

    path = os.path.join(BASE_DIR, "screenshots", "screenshot-registro.png")
    img.save(path, "PNG")
    print("  ✓ screenshots/screenshot-registro.png")


# ─── Screenshot 2: Calendário ─────────────────────────────────────────────────

def screenshot_calendario():
    img, draw = new_screen()
    draw_topbar(draw)
    draw_navbar(draw, "calendar")

    # Month nav
    f16b = font(16, bold=True)
    f14  = font(14)
    draw.rounded_rectangle([16, H-70-24-36, 52, H-70-24], radius=10, fill=SURFACE, outline=BORDER, width=2)
    text_center(draw, "<", 34, H-70-24-18, f14, TEXT2)
    text_center(draw, "Junho 2026", W//2, H-70-24-18, f16b, TEXT)
    draw.rounded_rectangle([W-52, H-70-24-36, W-16, H-70-24], radius=10, fill=SURFACE, outline=BORDER, width=2)
    text_center(draw, ">", W-34, H-70-24-18, f14, TEXT2)

    cal_top = 86
    dows = ["D","S","T","Q","Q","S","S"]
    f11 = font(11)
    cell_w = (W - 32) // 7
    for i, d in enumerate(dows):
        text_center(draw, d, 16 + cell_w*i + cell_w//2, cal_top + 8, f11, TEXT3)

    # June 2026: starts on Monday (dow=1)
    days_in_month = 30
    start_dow = 1   # Monday
    today_day = 7

    scores = {
        1: 1.0, 2: 0.7, 3: 1.0, 4: 0.4, 5: 1.0,
        6: 0.85, 7: 0.57,
    }

    f13b = font(13, bold=True)
    f13  = font(13)
    row_start = cal_top + 28
    cell_h = 38

    for d in range(1, days_in_month + 1):
        col = (start_dow + d - 1) % 7
        row = (start_dow + d - 1) // 7
        cx = 16 + col * cell_w + cell_w // 2
        cy = row_start + row * cell_h + cell_h // 2

        sc = scores.get(d)
        is_today = (d == today_day)

        if sc is not None:
            if sc == 1.0:
                bg, tc = PRIMARY, WHITE
            else:
                bg, tc = PRIMARY_LIGHT, PRIMARY_DARK
        else:
            bg, tc = None, TEXT2

        r = cell_w // 2 - 2
        if bg:
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=bg)
        if is_today:
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=PRIMARY, width=2)

        fnt = f13b if is_today else f13
        text_center(draw, str(d), cx, cy - 2, fnt, tc if bg else (PRIMARY_DARK if is_today else TEXT2))

        if sc is not None and sc < 1.0:
            draw.ellipse([cx-2, cy+r-4, cx+2, cy+r], fill=PRIMARY_DARK)

    # Legend
    leg_y = row_start + 6 * cell_h + 10
    f11 = font(11)
    items = [
        (PRIMARY_LIGHT, "Parcial"),
        (PRIMARY,       "100%"),
    ]
    lx = 16
    for color, label in items:
        draw.rounded_rectangle([lx, leg_y, lx+12, leg_y+12], radius=3, fill=color)
        draw.text((lx+16, leg_y), label, font=f11, fill=TEXT2)
        lx += 80

    path = os.path.join(BASE_DIR, "screenshots", "screenshot-calendario.png")
    img.save(path, "PNG")
    print("  ✓ screenshots/screenshot-calendario.png")


# ─── Screenshot 3: Dashboard ──────────────────────────────────────────────────

def screenshot_dashboard():
    img, draw = new_screen()
    draw_topbar(draw)
    draw_navbar(draw, "dashboard")

    # Date nav
    f14b = font(14, bold=True)
    f14  = font(14)
    nav_y = 82
    draw.rounded_rectangle([16, nav_y, 52, nav_y+36], radius=10, fill=SURFACE, outline=BORDER, width=2)
    text_center(draw, "<", 34, nav_y+18, f14, TEXT2)
    text_center(draw, "Hoje, 07 de junho de 2026", W//2, nav_y+18, f14b, TEXT)
    draw.rounded_rectangle([W-52, nav_y, W-16, nav_y+36], radius=10, fill=SURFACE, outline=BORDER, width=2)
    text_center(draw, ">", W-34, nav_y+18, f14, TEXT2)

    # Ring card
    ring_y = 130
    draw.rounded_rectangle([16, ring_y, W-16, ring_y+90], radius=16, fill=SURFACE)
    # Ring
    rcx, rcy, rr = 62, ring_y+45, 28
    draw.ellipse([rcx-rr, rcy-rr, rcx+rr, rcy+rr], outline=PRIMARY_LIGHT, width=8)
    # Arc 57%
    draw.arc([rcx-rr, rcy-rr, rcx+rr, rcy+rr], start=-90, end=-90+int(360*0.57),
             fill=PRIMARY, width=8)
    f16b = font(16, bold=True)
    text_center(draw, "57%", rcx, rcy, f16b, PRIMARY_DARK)

    f15b = font(15, bold=True)
    f12  = font(12)
    draw.text((104, ring_y+18), "4 de 7 metas", font=f15b, fill=TEXT)
    draw.text((104, ring_y+40), "Continue firme!", font=f12, fill=TEXT2)

    # Metrics grid
    mg_y = ring_y + 100
    metrics = [
        ("Corrida", "5.2", "km"),
        ("Sono",    "7.5", "h"),
        ("Água",    "1.2", "L"),
        ("Sequência","3",  "dias"),
    ]
    mw = (W - 48) // 2
    mh = 68
    f11 = font(11)
    f26b = font(26, bold=True)
    for i, (label, val, unit) in enumerate(metrics):
        col = i % 2
        row = i // 2
        mx = 16 + col * (mw + 8)
        my = mg_y + row * (mh + 8)
        draw.rounded_rectangle([mx, my, mx+mw, my+mh], radius=16, fill=SURFACE)
        draw.text((mx+14, my+10), label, font=f11, fill=TEXT3)
        val_bbox = draw.textbbox((0,0), val, font=f26b)
        vw = val_bbox[2] - val_bbox[0]
        draw.text((mx+14, my+26), val, font=f26b, fill=PRIMARY_DARK)
        draw.text((mx+14+vw+2, my+40), unit, font=f11, fill=TEXT3)

    # Goals detail
    gd_y = mg_y + 2*(mh+8) + 8
    goals_data = [
        ("🏃", "Corrida",     True),
        ("🏋️", "Academia",    True),
        ("🌙", "Sono",        True),
        ("📖", "Leitura",     True),
        ("🥗", "Alimentação", False),
        ("💧", "Água",        False),
    ]
    draw.rounded_rectangle([16, gd_y, W-16, gd_y + 14 + len(goals_data)*38], radius=16, fill=SURFACE)
    f13b2 = font(13, bold=True)
    f13s  = font(13)
    draw.text((28, gd_y+8), "Detalhes das metas", font=f11, fill=TEXT2)
    for idx, (icon, name, done) in enumerate(goals_data):
        gy = gd_y + 28 + idx*38
        if idx < len(goals_data)-1:
            draw.line([(28, gy+37), (W-28, gy+37)], fill=BORDER, width=1)
        row_bg = PRIMARY_XL if done else SURFACE
        draw.rectangle([17, gy, W-17, gy+37], fill=row_bg)

        icon_bg = PRIMARY_LIGHT if done else SURFACE2
        draw.rounded_rectangle([28, gy+4, 60, gy+36], radius=8, fill=icon_bg)
        text_center(draw, icon, 44, gy+20, font(14), PRIMARY_DARK if done else TEXT2)

        draw.text((70, gy+12), name, font=f13s, fill=PRIMARY_DARK if done else TEXT)

        badge_txt = "Feito" if done else "Não feito"
        badge_bg  = PRIMARY if done else SURFACE2
        badge_fc  = WHITE   if done else TEXT3
        bb = draw.textbbox((0,0), badge_txt, font=f11)
        bw = bb[2]-bb[0]+16
        bx = W - 28 - bw
        draw.rounded_rectangle([bx, gy+10, bx+bw, gy+28], radius=10, fill=badge_bg)
        text_center(draw, badge_txt, bx+bw//2, gy+19, f11, badge_fc)

    path = os.path.join(BASE_DIR, "screenshots", "screenshot-dashboard.png")
    img.save(path, "PNG")
    print("  ✓ screenshots/screenshot-dashboard.png")


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\nGerando ícones...")
    save_icon(192, maskable=False)
    save_icon(512, maskable=False)
    save_icon(192, maskable=True)
    save_icon(512, maskable=True)

    print("\nGerando screenshots...")
    screenshot_registro()
    screenshot_calendario()
    screenshot_dashboard()

    print("\nPronto! Todos os assets foram criados.")
