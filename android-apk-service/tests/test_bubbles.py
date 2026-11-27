import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bubbles import DESIGN_FILE, ANDROID_NS, SPEC, parse_design, STYLES
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

    def test_common_design_rejects_patterns_and_invalid_revision(self):
        design = dict(version=2, specVersion=SPEC['version'], buildVersion=1795750000, style='rounded',
                      colors={item['key']: '#123456' for item in SPEC['colors']})
        self.assertEqual(parse_design(json.dumps(design).encode())['send'], '#123456')
        for field, value in [('style', 'dashed'), ('style', 'wave'), ('style', []),
                             ('buildVersion', True), ('buildVersion', 2100000001), ('specVersion', 999)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                parse_design(json.dumps({**design, field: value}).encode())

    def test_common_snapshot_controls_colors_version_and_preserves_official_ninepatches(self):
        from bubbles import apply_design
        from project import xml_values
        colors = dict(bg='#E8F4F8', main='#FAF2DE', accent='#B13A60', send='#C6E6BC', receive='#FFE1C6', ink='#24364A')
        for style in SPEC['bubble']['styles']:
            with self.subTest(style=style), zipfile.ZipFile(TEMPLATE) as source:
                files = {n: source.read(n) for n in source.namelist()}
                design = parse_design(json.dumps(dict(version=2, specVersion=SPEC['version'],
                    buildVersion=1795750000, style=style, colors=colors)).encode())
                apply_design(files, design)
                actual = xml_values(files['src/main/theme/values/colors.xml'], 'color')
                for key, binding in SPEC['android']['colors'].items():
                    self.assertEqual(actual[key], colors[binding.removeprefix('$')])
                self.assertIn(b'versionCode = 1795750000', files['build.gradle.kts'])
                self.assertIn(b'versionName = "1.0.1795750000"', files['build.gradle.kts'])
                for role in ('me', 'you'):
                    for sequence in ('01', '02'):
                        image=f'src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_{role}_{sequence}_image.9.png'
                        self.assertIn(image, files)
                        self.assertEqual(files[image], source.read(image))
                        self.assertNotIn(f'src/main/theme/drawable/theme_chatroom_bubble_{role}_{sequence}_image.xml', files)


if __name__ == '__main__':
    unittest.main()
