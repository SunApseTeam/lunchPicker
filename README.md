# 점심 플링코

탄성 있는 구슬을 떨어뜨려 점심 메뉴를 고르는 웹 페이지입니다. 설계는 [DESIGN.md](DESIGN.md)에 있습니다.

## 실행

ES 모듈을 쓰기 때문에 `index.html`을 더블클릭해서는 열리지 않습니다. 로컬 서버로 여세요.

```bash
python tools/serve.py 5178
```

캐시를 끈 개발 서버라서, 코드를 고친 뒤 새로고침만 하면 바로 반영됩니다.

그다음 브라우저에서 http://localhost:5178 을 엽니다. GitHub Pages에 올리면 서버 없이 바로 열립니다(빌드 없음).

## 조작

- 왼쪽 목록에서 오늘 후보를 체크합니다. 이름을 누르면 수정하고, "숨김"을 누르면 목록에서 숨깁니다.
- 뽑을 개수를 고른 뒤 버튼이나 `Space`로 구슬을 떨어뜨립니다.
- 결과가 나오면 "여기 간다!"로 기록하거나, "다시 돌리기"나 `R`로 다시 돌립니다.
- 왼쪽 위 막대그래프 아이콘(`stats.html`)에서 방문 랭킹, 오래 안 간 곳, 요일별·월별 패턴, 기록 타임라인을 봅니다. 타임라인에서 기록을 취소하거나 되돌리고, 직접 추가할 수 있습니다.

메뉴와 기록은 [src/infrastructure/config.js](src/infrastructure/config.js)에 Supabase 주소가 있으면 팀 공유 Supabase에, 비어 있으면 이 브라우저의 localStorage에 저장합니다. Supabase 쪽 설정은 [SETUP.md](SETUP.md)에 있습니다.

주소 뒤에 `?local`을 붙이면(예: http://localhost:5178/?local) 이 브라우저 저장소만 씁니다. 시험해 봐도 팀 기록에 남지 않습니다.

## 구조

의존은 안쪽으로만 향합니다. `tests/architecture.test.js`가 이 규칙을 검사하므로, 어기면 `npm test`가 실패합니다.

```
src/
  domain/          규칙과 계산. 브라우저 API를 쓰지 않음
    physics.js       말랑 구슬 물리와 보드
    round.js         K개 동시 투하, 같은 칸 재투하
    stats.js         통계 계산
    menu.js          메뉴 이름 규칙, 기본 메뉴
    date.js          날짜 문자열 다루기
    settings.js      설정 기본값
  application/     유스케이스. domain만 씀
    lunch.js         메뉴 관리, 기록, 통계 불러오기. 저장소 포트 정의
  infrastructure/  바깥 세계와 연결. domain만 씀
    local-store.js   localStorage 저장소
    supabase-store.js Supabase REST 저장소
    store.js         둘 중 하나를 고름 (config.js, ?local)
    settings-storage.js  화면 설정 저장
  ui/              화면. application과 domain을 씀
    plinko/          플링코 페이지 (main.js가 조립, 나머지는 그리기와 입력)
    stats/           통계 페이지 (main.js가 조립, views.js는 HTML 만들기)
    shared/dom.js    공통 DOM 도우미
```

- 각 페이지의 `main.js`만 `infrastructure`에서 실제 저장소를 골라 끼웁니다.
- 새 규칙은 `domain/`에, 새 동작(유스케이스)은 `application/lunch.js`에 넣습니다. 저장소에는 규칙을 넣지 않습니다.
- 저장소를 바꾸려면 `application/lunch.js` 위쪽에 적힌 포트 6개를 구현하면 됩니다.

## 개발

```bash
npm test
```

- `architecture`: 레이어 사이 의존 방향, domain과 application이 브라우저를 건드리지 않는지
- `lunch`: 유스케이스 (기본 메뉴 채우기, 이름 중복, 기록, 미래 날짜 막기, 취소·되돌리기)
- `supabase-store`: Supabase 요청 모양과 응답 읽기 (가짜 응답으로, 팀 DB는 건드리지 않음)
- `round`: 물리를 헤드리스로 돌려 K개가 서로 다른 칸에 들어가는지, 붐비는 판도 끝나는지, 시작 위치가 결과를 정하지 않는지
- `stats`: 통계 계산 (취소 제외, 랭킹, 오래 안 간 곳, 요일·월 묶음)

주소 뒤에 `?debug`를 붙이면 브라우저 콘솔에서 `window.__plinko`로 현재 상태를 읽을 수 있습니다.
