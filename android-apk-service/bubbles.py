"""Generate Android drawables that retain their borders when a message grows.

Only a validated design is accepted; uploaded XML or code is never executed.
"""
import json
import math
import re
import struct
import zlib

DESIGN_FILE = 'talktheme-bubbles.json'
STYLES = ('square', 'rounded', 'wave', 'dashed')
BASE = 'src/main/theme/'
ANDROID_NS = 'http://schemas.android.com/apk/res/android'


def parse_design(data):
    if len(data) > 1024:
        raise ValueError('말풍선 설정이 너무 큽니다.')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('중복 말풍선 설정입니다.')
            result[key] = value
        return result
    value = json.loads(data, object_pairs_hook=unique)
    if not isinstance(value, dict) or set(value) != {'version', 'style', 'send', 'receive', 'border'}:
        raise ValueError('잘못된 말풍선 설정입니다.')
    if type(value['version']) is not int or value['version'] != 1 or value['style'] not in STYLES:
        raise ValueError('지원하지 않는 말풍선입니다.')
    for key in ('send', 'receive', 'border'):
        if not isinstance(value[key], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value[key]):
            raise ValueError('잘못된 말풍선 색상입니다.')
    return value


def png(width, height, pixel):
    """Tiny antialiased, repeating edge textures, at Android xxhdpi (3x)."""
    samples = 4
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            values = [pixel((x + (sx + .5) / samples) / 3,
                            (y + (sy + .5) / samples) / 3)
                      for sy in range(samples) for sx in range(samples)]
            alpha = sum(v[3] for v in values)
            rgb = [round(sum(v[i] * v[3] for v in values) / alpha) if alpha else 0
                   for i in range(3)]
            rows.extend([*rgb, round(alpha / len(values))])
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def wave_textures(prefix, fill, border):
    fill, border = rgb(fill), rgb(border)
    def edge(x, y):
        boundary = 3 + 2 * math.sin(2 * math.pi * x / 18)
        slope = (2 * math.pi / 9) * math.cos(2 * math.pi * x / 18)
        distance = (y - boundary) / math.sqrt(1 + slope * slope)
        if abs(distance) <= .6:
            return (*border, 255)
        return (*fill, 255) if distance > 0 else (0, 0, 0, 0)
    def corner(x, y):
        # Quarter circle connecting the two edges at (4,3) and (3,4).
        distance = math.hypot(x - 4, y - 4)
        if abs(distance - 1) <= .6:
            return (*border, 255)
        return (*fill, 255) if distance < 1 else (0, 0, 0, 0)
    makers = {
        'top': (54, 24, edge),
        'bottom': (54, 24, lambda x, y: edge(x, 8 - y)),
        'left': (24, 54, lambda x, y: edge(y, x)),
        'right': (24, 54, lambda x, y: edge(y, 8 - x)),
        'tl': (12, 12, corner),
        'tr': (12, 12, lambda x, y: corner(4 - x, y)),
        'bl': (12, 12, lambda x, y: corner(x, 4 - y)),
        'br': (12, 12, lambda x, y: corner(4 - x, 4 - y)),
    }
    return {BASE + f'drawable-xxhdpi/{prefix}_{name}.png': png(w, h, draw)
            for name, (w, h, draw) in makers.items()}


def drawable(style, fill, border, prefix, outgoing):
    left, right = (11, 17) if outgoing else (17, 11)
    padding = f'<padding android:left="{left}dp" android:top="14dp" android:right="{right}dp" android:bottom="10dp"/>'
    if style != 'wave':
        radius = {'square': 1, 'rounded': 12, 'dashed': 9}[style]
        dash = ' android:dashWidth="3dp" android:dashGap="2dp"' if style == 'dashed' else ''
        return (f'<shape xmlns:android="{ANDROID_NS}" android:shape="rectangle">'
                f'<solid android:color="{fill}"/><corners android:radius="{radius}dp"/>'
                f'<stroke android:width="1dp" android:color="{border}"{dash}/>{padding}</shape>').encode()
    # A bitmap stretches its dashes/waves. Tile each edge at its native period instead.
    padding = f'<padding android:left="{left - 6}dp" android:top="8dp" android:right="{right - 6}dp" android:bottom="4dp"/>'
    parts = [f'<layer-list xmlns:android="{ANDROID_NS}" android:paddingMode="stack">',
             f'<item android:left="6dp" android:top="6dp" android:right="6dp" android:bottom="6dp"><shape><solid android:color="{fill}"/>{padding}</shape></item>']
    for edge, gravity, axis, insets in [
        ('top', 'top|fill_horizontal', 'X', 'android:left="4dp" android:right="4dp" android:height="8dp"'),
        ('bottom', 'bottom|fill_horizontal', 'X', 'android:left="4dp" android:right="4dp" android:height="8dp"'),
        ('left', 'left|fill_vertical', 'Y', 'android:top="4dp" android:bottom="4dp" android:width="8dp"'),
        ('right', 'right|fill_vertical', 'Y', 'android:top="4dp" android:bottom="4dp" android:width="8dp"'),
    ]:
        other = 'Y' if axis == 'X' else 'X'
        parts.append(f'<item android:gravity="{gravity}" {insets}><bitmap android:src="@drawable/{prefix}_{edge}" android:tileMode{axis}="repeat" android:tileMode{other}="disabled" android:gravity="fill" android:filter="false"/></item>')
    for name, gravity in [('tl', 'top|left'), ('tr', 'top|right'), ('bl', 'bottom|left'), ('br', 'bottom|right')]:
        parts.append(f'<item android:width="4dp" android:height="4dp" android:gravity="{gravity}" android:drawable="@drawable/{prefix}_{name}"/>')
    return (''.join(parts) + '</layer-list>').encode()


def apply_design(files, design):
    """Replace only the four known bubble resources, preserving their resource IDs."""
    names = [n for n in files if re.fullmatch(BASE + r'drawable-xxhdpi/theme_chatroom_bubble_(me|you)_0[12]_image\.9\.png', n)]
    if len(names) != 4:
        raise ValueError('공식 말풍선 리소스 구성이 다릅니다.')
    for outgoing in (True, False):
        role = 'me' if outgoing else 'you'
        prefix = f'talktheme_wave_{role}'
        fill = design['send' if outgoing else 'receive']
        if design['style'] == 'wave':
            files.update(wave_textures(prefix, fill, design['border']))
        xml = drawable(design['style'], fill, design['border'], prefix, outgoing)
        for sequence in ('01', '02'):
            name = f'theme_chatroom_bubble_{role}_{sequence}_image'
            del files[BASE + f'drawable-xxhdpi/{name}.9.png']
            files[BASE + f'drawable/{name}.xml'] = xml
