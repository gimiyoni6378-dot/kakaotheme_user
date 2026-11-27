# 톡테마 컬러 스튜디오

GitHub Pages용 정적 배포본입니다. 페이지에서 색상을 설정하고 iOS용 .ktheme 파일을 내보냅니다. Android APK는 별도 빌드 서버에 연결해 생성합니다.

Android APK 서버 배포와 서명키·요청 제한 설정은 [Android 서비스 안내](android-apk-service/README.md)를 참고하세요. `android-config.js`에 서버 주소를 설정하기 전에는 Android 버튼이 서버 준비 안내를 표시합니다.

## 기기별 생성 경로

- `theme-design.js`와 `android-apk-service/theme-spec.json`: 형식과 무관한 디자인 값·지원 기능·색상 연결·치수 계약입니다. JSON은 빌드 서버 배포에도 포함되도록 서비스 폴더에 보관합니다.
- `ios-export.js`: 제공된 iOS 26.9.0 샘플의 CSS 이름, 2x/3x PNG 이름과 늘림 좌표를 사용해 `.ktheme`을 생성합니다. Android 템플릿을 읽지 않습니다.
- `android-project.js`: 제공된 Android 26.10.0 샘플의 XML과 `.9.png` 경로를 사용해 Android 프로젝트를 생성합니다. iOS CSS와 이미지 데이터를 읽지 않습니다.
- `android-export.js`: Android 빌드 세션·진행·APK 다운로드만 담당합니다.
- `theme-utils.js`: 일반 PNG·ZIP 처리 유틸리티이며 기기별 리소스 경로를 포함하지 않습니다.

두 생성기의 내부 함수는 각각 별도 스코프에 둡니다. 외부에는 `IOS_THEME_EXPORTER.build(theme)`와 `ANDROID_THEME_EXPORTER.build(theme)`만 공개합니다. 생성기는 전달된 설정을 사용하며 페이지의 현재 선택값이나 UI 함수에 의존하지 않습니다. 버튼·안내·다운로드는 페이지와 Android 다운로드 흐름에서 담당합니다.

두 기기 동일 재현을 우선하여 공통 말풍선은 각진·둥근 모서리로 제한합니다. 이전 점선·물결 저장값은 안내와 함께 둥근 모서리로 이전합니다. 색상, 테두리, 여백은 같은 계약값을 각 기기 변환기에 각각 적용합니다. 새 기능은 두 변환기에 각각 구현하고 지원 목록을 선언해야 합니다. 한쪽 지원이 빠지면 양쪽 공통 기능으로 활성화하지 않습니다.

`npm ci && npm test`는 실제 생성기를 Node DOM/Skia 환경에서 실행하여 형식 분리, 색상, 사진, 말풍선 픽셀과 늘림 참조 결과를 검사합니다. 브라우저나 실기기 검증을 대신하지 않습니다. [검증 범위와 남은 확인](VERIFICATION.md)을 참고하세요.

코드 수정 후 `npm run format`으로 정리하고 `npm run format:check`로 검사합니다. CI에서도 포맷을 검사합니다. 생성된 샘플 데이터와 화면 HTML은 포맷 대상에서 제외합니다.

## 배포

1. GitHub에서 빈 저장소를 만듭니다.
2. 이 폴더(github-pages)의 **내용물**을 저장소 최상위에 올립니다.
3. 저장소의 Settings → Pages에서 Deploy from a branch, main, /(root)를 선택합니다.
4. 표시된 Pages 주소에서 사이트를 사용합니다.

내보내기 시 공식 샘플의 리소스 이름과 구조를 유지하면서 선택한 색상·이미지로 테마 리소스를 생성합니다.

