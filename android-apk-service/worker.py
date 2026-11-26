#!/usr/bin/env python3
import json
import os
import secrets
import shutil
import subprocess
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path('/tmp/kakaotheme-builds')
JOBS = {}
LOCK = threading.Lock()
ORIGIN = 'https://gimiyoni6378-dot.github.io'
MAX_UPLOAD = 10 * 1024 * 1024
MAX_EXPANDED = 24 * 1024 * 1024


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, **kwargs)


def install_toolchain(job):
    job['stage'] = 'Android 빌드 도구 준비 중'
    run(['sudo', 'apt-get', 'update', '-qq'])
    run(['sudo', 'apt-get', 'install', '-y', '-qq', 'curl', 'unzip', 'ca-certificates'])
    java_home = Path('/opt/jdk-21')
    sdk_root = Path('/opt/android-sdk')
    if not (java_home / 'bin/java').exists():
        archive = Path('/tmp/jdk21.tar.gz')
        run(['curl', '-fL', '--retry', '3', 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse', '-o', str(archive)])
        java_home.mkdir(parents=True, exist_ok=True)
        run(['sudo', 'tar', '-xzf', str(archive), '-C', str(java_home), '--strip-components=1'])
    sdkmanager = sdk_root / 'cmdline-tools/latest/bin/sdkmanager'
    if not sdkmanager.exists():
        archive = Path('/tmp/android-commandline.zip')
        run(['curl', '-fL', '--retry', '3', 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip', '-o', str(archive)])
        staging = Path('/tmp/android-sdk-tools')
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        run(['unzip', '-q', str(archive), '-d', str(staging)])
        (sdk_root / 'cmdline-tools').mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging / 'cmdline-tools'), str(sdk_root / 'cmdline-tools/latest'))
    env = os.environ.copy()
    env.update({
        'JAVA_HOME': str(java_home), 'ANDROID_HOME': str(sdk_root),
        'ANDROID_SDK_ROOT': str(sdk_root),
        'PATH': f"{java_home}/bin:{sdkmanager.parent}:{sdk_root}/platform-tools:" + os.environ.get('PATH', '')
    })
    sdkmanager = str(sdkmanager)
    run(['bash', '-lc', f"yes | {sdkmanager} --sdk_root={sdk_root} --licenses >/dev/null"], env=env)
    run([sdkmanager, f'--sdk_root={sdk_root}', 'platform-tools', 'platforms;android-35', 'build-tools;35.0.0'], env=env)
    return env


def build(job_id, archive_path, workdir):
    job = JOBS[job_id]
    try:
        with zipfile.ZipFile(archive_path) as archive:
            infos = archive.infolist()
            if len(infos) > 500 or sum(item.file_size for item in infos) > MAX_EXPANDED:
                raise ValueError('프로젝트 압축 파일 크기가 허용 범위를 넘었습니다.')
            for item in infos:
                path = Path(item.filename)
                if path.is_absolute() or '..' in path.parts or '\\' in item.filename:
                    raise ValueError('프로젝트 압축 파일에 잘못된 경로가 있습니다.')
            archive.extractall(workdir)
        if not (workdir / 'build.gradle.kts').exists() or not (workdir / 'gradlew').exists():
            raise ValueError('올바른 Android 테마 프로젝트가 아닙니다.')

        env = install_toolchain(job)
        job['stage'] = '카카오톡 테마 APK 빌드 중'
        run(['chmod', '+x', './gradlew'], cwd=workdir)
        result = run(['./gradlew', '--no-daemon', 'assembleDebug'], cwd=workdir, env=env, timeout=12 * 60)
        apk = workdir / 'app/build/outputs/apk/debug/app-debug.apk'
        if not apk.is_file() or apk.stat().st_size < 50_000:
            raise RuntimeError('APK 빌드 결과를 찾지 못했습니다.')
        job['apk'] = str(apk)
        job['stage'] = '완료'
        job['finished'] = time.time()
    except subprocess.TimeoutExpired:
        job['error'] = '빌드 시간이 초과됐습니다. 다시 시도해주세요.'
        job['stage'] = '실패'
    except Exception as error:
        print(f'Build {job_id} failed: {error}', flush=True)
        job['error'] = str(error)[:240]
        job['stage'] = '실패'
    finally:
        job['done'] = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def cors_headers(self, content_type='application/json'):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', content_type)

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.cors_headers()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        origin = self.headers.get('Origin')
        if origin and origin != ORIGIN:
            return self.send_json(403, {'error': '요청한 사이트에서만 빌드 결과를 받을 수 있습니다.'})
        if self.path == '/health':
            return self.send_json(200, {'ready': True})
        parts = self.path.strip('/').split('/')
        if len(parts) != 2 or parts[0] not in ('status', 'download'):
            return self.send_json(404, {'error': '요청을 찾지 못했습니다.'})
        job_id = parts[1]
        job = JOBS.get(job_id)
        if not job:
            return self.send_json(404, {'error': '빌드 작업을 찾지 못했습니다.'})
        if parts[0] == 'status':
            return self.send_json(200, {key: job.get(key) for key in ('stage', 'done', 'error')})
        apk = job.get('apk')
        if not apk:
            return self.send_json(409, {'error': 'APK가 아직 준비되지 않았습니다.'})
        data = Path(apk).read_bytes()
        self.send_response(200)
        self.cors_headers('application/vnd.android.package-archive')
        self.send_header('Content-Disposition', 'attachment; filename="kakaotalk-theme.apk"')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.headers.get('Origin') != ORIGIN:
            return self.send_json(403, {'error': '요청한 사이트에서만 빌드를 시작할 수 있습니다.'})
        if self.path != '/build':
            return self.send_json(404, {'error': '요청을 찾지 못했습니다.'})
        length = int(self.headers.get('Content-Length', '0'))
        if length < 1 or length > MAX_UPLOAD:
            return self.send_json(413, {'error': 'Android 프로젝트 ZIP은 10MB 이하로 저장해주세요.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/zip':
            return self.send_json(415, {'error': 'Android 프로젝트 ZIP 파일이 필요합니다.'})
        with LOCK:
            if any(not job['done'] for job in JOBS.values()):
                return self.send_json(429, {'error': '현재 빌드가 진행 중입니다. 완료 후 다시 시도해주세요.'})
            if len(JOBS) >= 1:
                return self.send_json(429, {'error': '이 빌드 세션은 한 번만 사용할 수 있습니다.'})
            job_id = secrets.token_urlsafe(12)
            directory = ROOT / job_id
            directory.mkdir(parents=True, exist_ok=True)
            archive_path = directory / 'project.zip'
            archive_path.write_bytes(self.rfile.read(length))
            workdir = directory / 'project'
            workdir.mkdir()
            JOBS[job_id] = {'stage': '요청 접수', 'done': False, 'error': None, 'apk': None}
        threading.Thread(target=build, args=(job_id, archive_path, workdir), daemon=True).start()
        return self.send_json(202, {'jobId': job_id})


ThreadingHTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
