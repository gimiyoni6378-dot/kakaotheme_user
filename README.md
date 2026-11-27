# 톡테마 컬러 스튜디오

GitHub Pages용 정적 배포본입니다. 페이지에서 색상을 설정하고 iOS용 .ktheme 파일을 내보냅니다. Android APK는 별도 빌드 서버에 연결해 생성합니다.

Android APK 서버 배포와 서명키·요청 제한 설정은 [Android 서비스 안내](android-apk-service/README.md)를 참고하세요. `android-config.js`에 서버 주소를 설정하기 전에는 Android 버튼이 서버 준비 안내를 표시합니다.

## 배포

1. GitHub에서 빈 저장소를 만듭니다.
2. 이 폴더(github-pages)의 **내용물**을 저장소 최상위에 올립니다.
3. 저장소의 Settings → Pages에서 Deploy from a branch, main, /(root)를 선택합니다.
4. 표시된 Pages 주소에서 사이트를 사용합니다.

이미지 템플릿에는 원본 샘플 그림을 공개하지 않도록 투명 자리표시자만 포함했습니다. 내보내기 시 사이트가 색상 상태와 리소스 규격을 사용해 테마 이미지를 생성합니다.

