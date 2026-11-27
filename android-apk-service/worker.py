#!/usr/bin/env python3
"""Single-use APK builder, run inside an ephemeral Vercel Sandbox."""
import hmac
import json
import os
import secrets
import shutil
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from project import MAX_UPLOAD, prepare_project

ROOT = Path(os.environ.get('BUILD_ROOT', '/tmp/kakaotheme-builds'))
JOBS = {}
LOCK = threading.Lock()
ORIGIN = os.environ.get('SITE_ORIGIN', 'https://gimiyoni6378-dot.github.io')
TOKEN = os.environ.get('SESSION_TOKEN', '')
EXPIRES = int(os.environ.get('SESSION_EXPIRES', '0'))


def run(args, **kwargs):
    kwargs.setdefault('timeout', 300)
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, **kwargs)


def install_toolchain(job):
    job['stage'] = 'Android 빌드 도구 준비 중'
    home = Path.home() / 'android-toolchain'
    java_home = Path(os.environ.get('JAVA_HOME', str(home / 'jdk-21')))
    sdk_root = Path(os.environ.get('ANDROID_HOME', str(home / 'sdk')))
    home.mkdir(parents=True, exist_ok=True)
    if not shutil.which('curl') or not shutil.which('unzip'):
        run(['sudo', 'apt-get', 'update', '-qq'])
        run(['sudo', 'apt-get', 'install', '-y', '-qq', 'curl', 'unzip', 'ca-certificates'])
    if not (java_home / 'bin/java').exists():
        archive = home / 'jdk21.tar.gz'
        run(['curl', '-fL', '--retry', '3', 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse', '-o', str(archive)])
        java_home.mkdir(parents=True, exist_ok=True)
        run(['tar', '-xzf', str(archive), '-C', str(java_home), '--strip-components=1'])
        archive.unlink()
    sdkmanager = sdk_root / 'cmdline-tools/latest/bin/sdkmanager'
    if not sdkmanager.exists():
        archive = home / 'android-commandline.zip'
        run(['curl', '-fL', '--retry', '3', 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip', '-o', str(archive)])
        staging = home / 'staging'
        shutil.rmtree(staging, ignore_errors=True)
        run(['unzip', '-q', str(archive), '-d', str(staging)])
        (sdk_root / 'cmdline-tools').mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging / 'cmdline-tools'), str(sdkmanager.parent.parent))
        archive.unlink()
    env = os.environ.copy()
    for key in ('SESSION_TOKEN', 'KEYSTORE_PASSWORD'):
        env.pop(key, None)
    env.update({'JAVA_HOME': str(java_home), 'ANDROID_HOME': str(sdk_root),
                'ANDROID_SDK_ROOT': str(sdk_root),
                'PATH': f"{java_home}/bin:{sdkmanager.parent}:" + os.environ.get('PATH', '')})
    run([str(sdkmanager), f'--sdk_root={sdk_root}', '--licenses'], input='y\n' * 100, env=env)
    run([str(sdkmanager), f'--sdk_root={sdk_root}', 'platforms;android-35', 'build-tools;35.0.0'], env=env)
    return env


def build(job_id, archive_path, workdir):
    job = JOBS[job_id]
    try:
        prepare_project(archive_path, workdir)
        env = install_toolchain(job)
        job['stage'] = '카카오톡 테마 APK 빌드 중'
        (workdir / 'gradlew').chmod(0o755)
        run(['./gradlew', '--no-daemon', '--max-workers=2', 'assembleRelease'], cwd=workdir, env=env, timeout=15 * 60)
        candidates = list((workdir / 'build/outputs/apk/release').glob('*-unsigned.apk'))
        if len(candidates) != 1:
            raise RuntimeError('APK 빌드 결과를 찾지 못했습니다.')
        job['stage'] = 'APK 서명 및 설치 파일 검증 중'
        tools = Path(env['ANDROID_HOME']) / 'build-tools/35.0.0'
        aligned, apk = workdir / 'aligned.apk', workdir / 'theme.apk'
        run([str(tools / 'zipalign'), '-f', '-p', '4', str(candidates[0]), str(aligned)], env=env)
        sign_env = {**env, 'KEYSTORE_PASSWORD': os.environ['KEYSTORE_PASSWORD']}
        run([str(tools / 'apksigner'), 'sign', '--ks', str(Path(__file__).with_name('signing.jks')),
             '--ks-key-alias', 'theme', '--ks-pass', 'env:KEYSTORE_PASSWORD',
             '--key-pass', 'env:KEYSTORE_PASSWORD', '--out', str(apk), str(aligned)], env=sign_env)
        run([str(tools / 'apksigner'), 'verify', '--verbose', str(apk)], env=env)
        job.update(apk=str(apk), stage='완료')
    except subprocess.TimeoutExpired:
        job.update(error='빌드 시간이 초과됐어요. 다시 시도해주세요.', stage='실패')
    except Exception as error:
        print(f'Build {job_id} failed: {error}', flush=True)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stdout[-12000:], flush=True)
        job.update(error='APK 생성에 실패했어요. 다시 시도하거나 운영자에게 문의해주세요.', stage='실패')
    finally:
        archive_path.unlink(missing_ok=True)
        job['done'] = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Download paths carry capabilities. Never log them.

    def cors_headers(self, content_type='application/json'):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Type', content_type)

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.cors_headers()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if time.time() >= EXPIRES:
            self.send_json(410, {'error': '빌드 세션이 만료됐어요. 다시 생성해주세요.'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin != ORIGIN:
            self.send_json(403, {'error': '허용되지 않은 출처입니다.'})
            return False
        supplied = self.headers.get('Authorization', '').removeprefix('Bearer ')
        if urlsplit(self.path).path.startswith('/download/'):
            supplied = parse_qs(urlsplit(self.path).query).get('token', [supplied])[0]
        if not TOKEN or not hmac.compare_digest(supplied, TOKEN):
            self.send_json(401, {'error': '올바르지 않은 빌드 세션입니다.'})
            return False
        return True

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            return self.send_json(200, {'ready': True})
        if not self.authorized():
            return
        parts = urlsplit(self.path).path.strip('/').split('/')
        if len(parts) != 2 or parts[0] not in ('status', 'download'):
            return self.send_json(404, {'error': '요청을 찾지 못했습니다.'})
        job = JOBS.get(parts[1])
        if not job:
            return self.send_json(404, {'error': '빌드 작업을 찾지 못했습니다.'})
        if parts[0] == 'status':
            return self.send_json(200, {key: job.get(key) for key in ('stage', 'done', 'error')})
        if not job.get('apk'):
            return self.send_json(409, {'error': 'APK가 아직 준비되지 않았습니다.'})
        apk = Path(job['apk'])
        self.send_response(200)
        self.cors_headers('application/vnd.android.package-archive')
        self.send_header('Content-Disposition', 'attachment; filename="kakaotalk-theme.apk"')
        self.send_header('Content-Length', str(apk.stat().st_size))
        self.end_headers()
        with apk.open('rb') as source:
            shutil.copyfileobj(source, self.wfile)

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != '/build':
            return self.send_json(404, {'error': '요청을 찾지 못했습니다.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.send_json(400, {'error': '잘못된 요청 크기입니다.'})
        if length < 1 or length > MAX_UPLOAD:
            return self.send_json(413, {'error': 'Android 프로젝트는 10MB 이하여야 합니다.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/zip':
            return self.send_json(415, {'error': '프로젝트 ZIP이 필요합니다.'})
        with LOCK:
            if JOBS:
                return self.send_json(429, {'error': '이 빌드 세션은 한 번만 사용할 수 있습니다.'})
            job_id = secrets.token_urlsafe(16)
            directory = ROOT / job_id
            directory.mkdir(parents=True, exist_ok=True)
            archive = directory / 'project.zip'
            self.connection.settimeout(30)
            data = self.rfile.read(length)
            if len(data) != length:
                return self.send_json(400, {'error': '업로드가 중단됐습니다.'})
            archive.write_bytes(data)
            JOBS[job_id] = {'stage': '프로젝트 검증 중', 'done': False, 'error': None}
        threading.Thread(target=build, args=(job_id, archive, directory / 'project'), daemon=True).start()
        self.send_json(202, {'jobId': job_id})


if __name__ == '__main__':
    if not TOKEN or EXPIRES <= time.time():
        raise SystemExit('SESSION_TOKEN and SESSION_EXPIRES are required')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8765'))), Handler).serve_forever()
