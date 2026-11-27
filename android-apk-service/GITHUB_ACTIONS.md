# GitHub Actions로 Android APK 빌드하기

이 흐름은 Vercel 빌드 서버 없이 GitHub의 표준 Linux runner에서 APK를 한 번 빌드합니다. 저장소 공개 상태에서는 표준 runner 실행료가 무료로 안내되지만, GitHub Actions의 한도와 이용 정책은 계속 적용됩니다.

## 사용 순서

1. 테마 스튜디오에서 **Android 저장**을 눌러 Android Studio 프로젝트 ZIP을 받습니다.
2. ZIP 안에는 사용자가 올린 배경 이미지가 들어갈 수 있습니다. 저장소가 공개이므로 공개 게시에 동의할 수 있는 파일만 다음 단계에 올리세요.
3. ZIP 파일 이름을 정확히 `android-project.zip`으로 바꿉니다.
4. GitHub 저장소의 **Releases → Draft a new release**에서 매번 새 태그(예: `apk-2026-11-26-1`)를 만들고 ZIP을 첨부해 공개합니다.
5. **Actions → Build Android theme APK → Run workflow**를 열고 방금 사용한 release tag를 입력합니다.
6. 빌드가 끝나면 workflow run의 **Artifacts**에서 `kakaotalk-theme-apk`를 내려받습니다. APK 파일은 debug 서명으로 생성되며, Android 기기에서 설치할 때 출처 확인 안내가 표시될 수 있습니다.

## 제한 사항

- 워크플로 실행은 GitHub 저장소에 쓰기 권한이 있는 사용자만 시작할 수 있습니다.
- 이 워크플로는 사이트 버튼과 직접 연결되지 않습니다. 웹페이지에 GitHub 토큰을 넣지 않습니다.
- 사이트에서 받은 ZIP을 공개 Release asset으로 올리는 단계가 있어서, 방문자가 각자 자기 이미지로 자유롭게 APK를 만드는 공개 서비스는 아닙니다.
- APK artifact는 저장 공간 사용을 줄이기 위해 하루 뒤 만료됩니다.
- Release ZIP은 이 워크플로가 자동 삭제하지 않습니다. 빌드가 끝난 뒤 공개 Release와 asset을 직접 삭제하거나, 다음 테마마다 새 태그를 사용하고 오래된 Release를 정리하세요.
