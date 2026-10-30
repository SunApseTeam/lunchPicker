# 직접 설정할 것: Supabase와 GitHub

통계 화면을 만드는 동안 아래를 진행해 주세요. 끝나면 맨 아래 "저에게 알려 줄 것"만 채팅에 붙여 주시면 됩니다.
대시보드 메뉴 이름은 서비스 쪽에서 가끔 바뀝니다. 이름이 조금 달라도 비슷한 항목을 찾으면 됩니다.

## 1. Supabase (공유 기록 저장소)

1. https://supabase.com 에 가입합니다. GitHub 계정으로 가입하면 편합니다.
2. **New project**를 만듭니다.
   - 이름: `lunch-plinko` (아무거나 괜찮습니다)
   - Database password: 자동 생성된 값을 쓰고 따로 보관합니다. 저에게는 주지 않아도 됩니다.
   - Region: **Northeast Asia (Seoul)**
   - 보안 옵션이 보이면 Data API는 켜 두고, 스키마는 기본값(public)으로 둡니다.
   - 플랜은 Free로 충분합니다.
3. 프로젝트가 준비되면(1~2분) 왼쪽 메뉴의 **SQL Editor**를 엽니다.
4. 이 폴더의 [supabase/schema.sql](supabase/schema.sql) 내용을 통째로 붙여 넣고 **Run**을 누릅니다. "Success. No rows returned"가 나오면 됩니다.
5. 왼쪽 **Table Editor**에 `menus`, `visits` 두 표가 보이는지 확인합니다.
6. 접속 정보를 찾습니다. 화면 위쪽 **Connect** 버튼이나 **Project Settings → API Keys / Data API**에 있습니다.
   - **Project URL**: `https://xxxx.supabase.co` 모양
   - **Publishable key** (`sb_publishable_...`로 시작). 없으면 Legacy 탭의 **anon public** 키

> 주의: **secret key**나 **service_role** 키는 절대 붙여 넣지 마세요. 그 키는 모든 보호를 무시합니다.
> Publishable/anon 키는 원래 웹 페이지에 공개되는 용도라 채팅에 붙여도 괜찮습니다. 실제 보호는 4번에서 만든 규칙(읽기·추가·수정만 허용, 삭제 금지)이 합니다.

참고로 무료 플랜은 **7일 동안 아무도 쓰지 않으면 프로젝트가 일시 정지**됩니다. 평일에 매일 쓰면 문제없고, 긴 연휴 뒤 멈춰 있으면 대시보드에서 Restore를 누르면 됩니다. 데이터는 지워지지 않습니다.

## 2. GitHub (코드 보관과 페이지 배포)

1. https://github.com 에 가입합니다(이미 있으면 생략).
2. 오른쪽 위 **+ → New repository**로 저장소를 만듭니다.
   - 이름: `lunch-plinko`
   - **Public**으로 만듭니다. 무료 계정의 GitHub Pages는 공개 저장소에서만 됩니다. 민감한 정보는 없습니다(공개 키는 원래 페이지에 보이는 용도).
   - README, .gitignore, license는 **추가하지 않습니다**(빈 저장소).
3. 이 PC에서 GitHub에 로그인합니다. 터미널에서 아래를 실행하고 안내대로 브라우저에서 승인합니다. 비밀번호는 제가 대신 넣을 수 없어서 직접 하셔야 합니다.

```bash
gh auth login
```

   질문이 나오면 GitHub.com, HTTPS, "Login with a web browser"를 고르면 됩니다.
4. **Pages 켜기는 제가 첫 업로드를 한 뒤에** 합니다. 저장소 **Settings → Pages**에서 Source를 "Deploy from a branch", Branch를 `main` / `(root)`로 두고 Save. 몇 분 뒤 `https://<아이디>.github.io/lunch-plinko/` 주소가 생깁니다. 이 주소를 팀에 공유하면 됩니다.

## 3. 파일을 둘 폴더

지금 파일들은 이 세션 전용 임시 폴더에 있어서, 세션을 지우면 함께 사라집니다. GitHub에 올리기 전에 계속 둘 폴더(예: `Documents\lunch-plinko`)를 정해 알려 주시면 옮기겠습니다.

## 저에게 알려 줄 것

- Supabase **Project URL**
- Supabase **Publishable key**(또는 anon key)
- GitHub **아이디**와 저장소 이름
- 파일을 옮길 **폴더**
- 지금 이 브라우저에 쌓인 메뉴와 기록을 Supabase로 옮길지(기본은 옮김)
