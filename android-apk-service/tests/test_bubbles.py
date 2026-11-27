import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bubbles import DESIGN_FILE, ANDROID_NS, parse_design, STYLES
from project import TEMPLATE, prepare_project

A = '{' + ANDROID_NS + '}'


class BubbleResourcesTests(unittest.TestCase):
    def design(self, style):
        return dict(version=1, style=style, send='#123456', receive='#abcdef', border='#789012')

    def test_native_shapes_and_repeating_wave_resources(self):
        for style in STYLES:
            with self.subTest(style=style), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                archive = root / 'project.zip'
                with zipfile.ZipFile(TEMPLATE) as source, zipfile.ZipFile(archive, 'w') as out:
                    for name in source.namelist():
                        data = source.read(name)
                        if name == 'build.gradle.kts':
                            data = data.replace(b'com.kakao.talk.theme.template', b'com.talktheme.studio.test123')
                        out.writestr(name, data)
                    out.writestr(DESIGN_FILE, json.dumps(self.design(style)))
                project = root / 'project'
                prepare_project(archive, project)
                self.assertFalse(list(project.rglob('*bubble*.9.png')))
                files = list(project.rglob('theme_chatroom_bubble_*.xml'))
                self.assertEqual(len(files), 4)
                for file in files:
                    drawable = ET.parse(file).getroot()
                    if style == 'wave':
                        self.assertEqual(drawable.tag, 'layer-list')
                        repeats = [e for e in drawable.iter('bitmap')
                                   if 'repeat' in (e.get(A + 'tileModeX'), e.get(A + 'tileModeY'))]
                        self.assertEqual(len(repeats), 4)
                        for e in repeats:
                            resource = e.get(A + 'src').removeprefix('@drawable/')
                            self.assertTrue(list(project.rglob(resource + '.png')))
                    else:
                        self.assertEqual(drawable.tag, 'shape')
                        self.assertEqual(drawable.find('solid').get(A + 'color'),
                                         '#123456' if '_me_' in file.name else '#abcdef')
                        stroke = drawable.find('stroke')
                        self.assertEqual(stroke.get(A + 'color'), '#789012')
                        self.assertEqual(stroke.get(A + 'dashWidth'), '3dp' if style == 'dashed' else None)

    def test_untrusted_design_rejected(self):
        cases = [b'{}', b'{"version":1,"version":1}', b'[]', b'x' * 1025]
        for key, value in [('style', 'xml'), ('send', '@drawable/private'),
                           ('border', '#00123456'), ('version', True)]:
            bad = self.design('dashed'); bad[key] = value
            cases.append(json.dumps(bad).encode())
        for data in cases:
            with self.subTest(data=data[:100]), self.assertRaises((ValueError, TypeError)):
                parse_design(data)


if __name__ == '__main__':
    unittest.main()
