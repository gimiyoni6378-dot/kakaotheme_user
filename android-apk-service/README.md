# Android APK 빌드 서비스

GitHub Pages는 정적 파일만 제공하므로 APK 컴파일은 별도 서버에서 수행합니다. 기존 사이트의 `안드로이드 저장` 버튼 → 테마 프로젝트 생성 → Vercel Function에서 일회용 Sandbox 생성 → 업로드/빌드/서명 → `APK 다운로드` 클릭 순서입니다. iOS 내보내기는 기존 브라우저 처리를 유지합니다.

## 처음 배포할 때

1. Vercel에 이 GitHub 저장소를 연결하고 **Root Directory를 `android-apk-service`**, Framework Preset을 **Other**로 지정합니다. 대시보드의 Build Command와 Output Directory override는 비워 둡니다. Node.js 24를 사용합니다. `npm ci`로 의존성을 설치합니다. `vercel.json`의 빌드 명령이 `src/session.mjs`와 SDK 의존성을 `api/session.mjs`로 번들링합니다. SDK 내부의 CommonJS/ESM 혼용이 Vercel 함수 로더에서 충돌하는 것을 방지합니다.
2. JDK 21의 `keytool`로 **운영용 서명키를 한 번만** 만듭니다. 아래 명령은 암호를 대화식으로 입력받습니다. keystore 암호와 key 암호는 동일하게 설정하고 alias는 `theme`을 사용합니다.

   ```powershell
   keytool -genkeypair -keystore theme-release.jks -alias theme -keyalg RSA -keysize 3072 -validity 10000 -storetype PKCS12
   ```

3. Vercel 프로젝트의 **Production 및 Preview 환경변수**를 설정합니다. 키 파일과 암호는 저장소나 `android-config.js`에 넣지 않습니다.

   | 변수 | 값 |
   | --- | --- |
   | `APK_KEYSTORE_BASE64` | `theme-release.jks`의 Base64 인코딩. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path 'theme-release.jks')))` |
   | `APK_KEYSTORE_PASSWORD` | 서명키 암호 |
   | `SITE_ORIGIN` | `https://gimiyoni6378-dot.github.io` (경로와 끝 슬래시 없음) |
   | `APK_BUILDS_ENABLED` | 아래 요청 제한을 설정한 뒤 `true` |

4. Vercel Firewall에서 **`/api/session`의 POST에 요청 제한**을 설정합니다. 시작값으로 IP별 분당 1회/시간당 10회 수준을 검토하고, 프로젝트 전체 사용량 알림과 계정 지출 제한을 설정합니다. 공개 API는 Origin 검사만으로 자동화 요청을 차단할 수 없습니다. 코드의 메모리 기반 1분 제한은 동일 Function 인스턴스에서만 적용되므로 운영 제한의 대체 수단이 아닙니다. 사용 플랜에서 필요한 제한을 지원하지 않으면 `APK_BUILDS_ENABLED`를 켜기 전에 외부 게이트웨이/공유 저장소 기반 제한을 추가하세요.
5. Vercel에서 재배포합니다. SDK는 배포 환경의 Vercel OIDC로 인증합니다. 브라우저에 Vercel 토큰을 전달할 필요가 없습니다. 조직 정책에서 Sandbox 이용이 허용돼 있는지도 확인합니다.
6. 저장소 최상위 `android-config.js`에 배포된 **서비스 origin**을 입력하고 GitHub Pages에 반영합니다.

   ```js
   window.ANDROID_APK_SERVICE = 'https://YOUR-APK-PROJECT.vercel.app';
   ```

7. 공개 브라우저에서 `/api/session`이 Vercel 로그인 화면에 막히지 않는지 확인합니다. 이 API는 공개 사이트에서 호출하므로 배포 보호를 해당 운영 도메인의 사용 목적에 맞게 설정해야 합니다. 테마 생성 → 완료 → 다운로드 → 실제 Android 휴대폰 설치/적용을 확인합니다.

서명키와 암호는 안전한 장소에 별도로 백업하세요. 모든 빌드에 같은 키를 사용해야 같은 패키지의 테마를 업데이트할 수 있습니다. 테스트용 APK의 서명키와 운영 서명키는 다릅니다.

## 빌드와 데이터 처리

- SDK `@vercel/sandbox` 5.x의 Ubuntu universal 이미지를 사용합니다. JDK 21, SDK 35, Build Tools 35.0.0, Gradle 8.10.2, AGP 8.7.2, Kotlin 1.9.25를 사용합니다. 초기 빌드는 도구와 의존성을 다운로드하므로 수 분이 걸릴 수 있습니다.
- 원본 Android 26.10.0 샘플을 기반으로 한 `template.zip`에 루트 프로젝트 이름과 Kotlin JVM 대상 설정을 보완했습니다. `namespace`와 Kotlin 패키지는 원본 값을 유지하고, 설치 식별자 `applicationId`만 테마 이름에 따라 변경합니다. 소스 manifest의 불필요한 `package` 속성은 제거하고, Release lint에서 누락으로 판정되는 `theme_maintab_cell_image`의 기본 밀도 리소스를 추가했습니다.
- `project.py`는 파일 목록과 빌드 스크립트/래퍼/매니페스트/코드를 서버 템플릿과 대조합니다. 정해진 색상, 이름, 같은 크기의 PNG 변경만 허용합니다. 업로드한 Gradle 코드나 임의 파일을 실행하지 않습니다. 업로드는 10MB, 압축 해제 총량은 24MB로 제한합니다.
- 샘플은 `app/` 하위 모듈이 없는 **루트 앱 모듈**입니다. `assembleRelease` 결과는 `build/outputs/apk/release`에 생성됩니다. `zipalign` → 운영키 `apksigner sign` → `apksigner verify` 후에만 다운로드를 엽니다.
- 세션별 무작위 토큰이 업로드·상태·다운로드에 필요합니다. 다운로드 링크에도 토큰이 포함되므로 공유하지 마세요. 요청 경로는 worker 로그에 기록하지 않습니다.
- Sandbox는 25분 뒤 만료되며 `persistent: false`로 자동 스냅샷을 남기지 않습니다. 업로드 ZIP은 빌드 종료 시 지웁니다. 빌드 작업 폴더와 생성 APK는 세션 만료까지 남습니다. 사진은 프로젝트에 포함돼 빌드 서버로 전송됩니다.
- 2 vCPU를 사용하는 세션이 요청마다 생성됩니다. Sandbox 사용량/요금은 연결된 Vercel 계정 정책에 따릅니다. 현재 구현은 세션 만료까지 다운로드를 제공하며, 다운로드 즉시 VM을 종료하지 않습니다. 트래픽 증가 시 SDK/Gradle 캐시를 포함한 이미지와 별도 APK 저장소로 최적화할 수 있습니다.
- 현재 공식 샘플 기준 최소 Android 버전은 **9 / API 28**입니다. 같은 이름은 같은 패키지를 사용하므로 다시 설치하면 업데이트됩니다. 다른 테마로 보관하려면 이름을 바꿉니다. 패키지 이름 해시는 충돌 가능성이 있는 32비트 해시이므로 대규모 테마 갤러리용 영구 ID로 사용하지 않습니다.

## 검증

```powershell
cd android-apk-service
npm ci
npm test
npm run build
npm run test:bundle
python -m unittest discover -s tests -v
```

Node 테스트는 출처/사전 요청/비활성화/동일 인스턴스 요청 제한/세션 생성·실패 정리를 검증합니다. Python 테스트는 프로젝트 코드 변조/경로 조작/중복 ZIP/XML 엔티티/색상·PNG 크기 및 HTTP 인증·만료·다운로드를 검증합니다. GitHub Actions는 Linux worker의 도구 설치부터 Release 빌드·임시 테스트키 서명·서명 검증까지 실행합니다. 이 테스트키는 운영에 사용하지 않습니다. 실제 휴대폰 적용 확인은 별도입니다.

## 참고

- [Vercel Sandbox](https://vercel.com/docs/sandbox)
- [Android 명령행 빌드와 서명](https://developer.android.com/build/building-cmdline)
- [apksigner](https://developer.android.com/tools/apksigner)
