"""Exercise the real Linux worker: toolchain, release build, sign and verify."""
import os
import json
import secrets
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker
from project import TEMPLATE

key = TEMPLATE.with_name('signing.jks')
if key.exists():
    raise SystemExit('Refusing to replace an existing signing key')
os.environ['KEYSTORE_PASSWORD'] = secrets.token_urlsafe(32)
try:
    worker.run([str(Path(os.environ['JAVA_HOME']) / 'bin/keytool'), '-genkeypair',
                '-keystore', str(key), '-alias', 'theme', '-keyalg', 'RSA',
                '-keysize', '3072', '-validity', '10000', '-storetype', 'PKCS12',
                '-storepass:env', 'KEYSTORE_PASSWORD', '-keypass:env', 'KEYSTORE_PASSWORD',
                '-dname', 'CN=CI Test Only'])
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        archive = root / 'project.zip'
        with zipfile.ZipFile(TEMPLATE) as source, zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            for name in source.namelist():
                data = source.read(name)
                if name == 'build.gradle.kts':
                    data = data.replace(b'com.kakao.talk.theme.template', b'com.talktheme.studio.cifixture')
                output.writestr(name, data)
            output.writestr('talktheme-bubbles.json', json.dumps({
                'version': 1, 'style': 'wave', 'send': '#D8E6D3',
                'receive': '#FFFFFF', 'border': '#50775B'}))
        worker.JOBS['ci'] = {'stage': 'start', 'done': False, 'error': None}
        worker.build('ci', archive, root / 'project')
        job = worker.JOBS['ci']
        if job.get('error') or not job.get('apk'):
            raise SystemExit('Linux worker build failed; see diagnostics above')
        print('Linux worker release APK signed and verified:', Path(job['apk']).stat().st_size, 'bytes')
finally:
    key.unlink(missing_ok=True)
    os.environ.pop('KEYSTORE_PASSWORD', None)
