# DEVLOG

개발 과정 기록. 무엇을 왜 그렇게 결정했는지, 어디서 막혔는지를 남깁니다.
최신 항목이 위로 오도록 작성합니다.

작성 요령
- 날짜와 제목으로 시작
- **한 일** / **왜** / **막힌 점** / **다음** 정도로 구분하면 나중에 찾기 쉬움
- 실패한 시도도 남길 것 — 같은 삽질 반복 방지가 목적

---

## 2026-07-25 — 이미지 표시 수정, Storage 미참조 파일 조사

### 한 일
- 상세 페이지 대표·본문 이미지를 `w-full h-auto` 로 바꿔 원본 비율 전체를 보여준다
- 글쓰기·상세 편집·팝업 편집의 미리보기를 `object-contain` 으로 변경
- 버킷에 쌓이는 미참조 파일 규모 조사

### 이미지가 잘렸던 이유
`object-cover` 는 지정된 틀을 채우려고 넘치는 부분을 **잘라낸다.** 축소가 아니라 크롭이다.
세로로 긴 가정통신문이나 포스터 캡처를 올리면 아래쪽이 잘려서 내용을 읽을 수 없었다.

목록 썸네일(`PostCard`), 홈 뉴스 카드, 팝업 표시는 `object-cover` 를 그대로 뒀다.
카드 높이가 이미지마다 달라지면 목록 레이아웃이 무너진다.
미리보기를 `object-contain` 으로 바꾼 것은, 올린 이미지가 실제로 어떻게 보일지
편집 화면에서 확인할 수 있어야 하기 때문이다.

### Storage 미참조 파일 조사 결과
| 폴더 | 파일 | 용량 | 미참조 |
|---|---|---|---|
| `post-images` | 5 | 0.56MB | 4 |
| `scraped` | 2 | 0.58MB | 2 |
| 합계 | 7 | 1.14MB | 6 (86%) |

원인은 `CreatePostDialog` / `PostDetail` 의 이미지 입력이 **파일 선택 즉시 업로드**하는
구조라는 점이다. 미리보기를 서버에 올려서 만들기 때문에, 다른 사진으로 바꾸거나
글 작성을 취소하면 그 파일이 그대로 남는다.

### 조사에서 확인한 두 가지
- **Supabase Storage 에는 자동 만료가 없다.** 지우지 않으면 영구히 남는다.
  TODO 의 "활동 종료 30일 후 자동 삭제" 는 신청 기록(DB) 이야기이고 이미지와 무관하다.
- **`scraped/` 는 쓰레기가 아니다.** 사이언스타임즈 뉴스 이미지를 미러링한 것이고,
  그 URL 은 DB 가 아니라 뉴스 캐시(메모리)에만 있다. 그래서 DB 기준으로 스캔하면
  전부 미참조로 잡힌다. 지우면 다음 스크래핑에서 다시 올라오지만 그동안 이미지가
  깨져 보인다. **정리 대상은 `post-images/` 로 한정해야 한다.**

### 다음
- [ ] 업로드 시점을 저장 직전으로 옮긴다 (`createObjectURL` 미리보기 + 저장 시 업로드)
- [ ] `post-images/` 미참조 4개 삭제

---

## 2026-07-25 — 1단계 슬라이스 1: Supabase Auth 로그인 병행 추가

### 한 일
- `server/auth.ts` 신설 — `resolveUser`, `ensureAuth`, `requireTeacher`/`requireAdmin`
- `client/src/lib/supabase.ts` 신설 — 브라우저용 클라이언트
- 로그인 모달에 교사 이메일 로그인 추가. 하단 링크로 기존 방식 전환 가능
- `GET /api/me` 추가
- 인증 헤더를 만드는 클라이언트 9곳을 컨텍스트의 `authHeaders` 하나로 통일
- `routes.ts` 에 복붙돼 있던 비밀번호 검사 4벌을 `ensureAuth` 로 정리

### 왜 병행으로 했나
운영 중인 사이트의 관리자 진입로를 갈아끼우는 작업이다.
새 방식만 남기고 배포했다가 문제가 생기면 본인도 로그인할 수 없게 된다.
그래서 `resolveUser` 가 Bearer 토큰을 먼저 보고, 없으면 기존 `x-admin-password` 로
넘어가도록 했다. 1단계 마지막 슬라이스에서 기존 경로를 제거한다.

### 설계 결정
- **토큰 검증을 Supabase Auth 서버에 위임한다.** JWT 시크릿을 직접 다루지 않으므로
  키 형식이 바뀌거나 회전돼도 코드를 고칠 필요가 없다. 관리자 경로에서만 쓰이므로
  왕복 비용은 감수한다.
- **`profiles` 행이 없는 계정은 거부한다.** `auth.users` 에 계정이 있어도 통과하지 못한다.
  자율 가입을 열지 않는다는 원칙을 서버에서 한 번 더 막는 장치다.
- **환경변수가 없으면 교사 로그인만 비활성화된다.** `VITE_SUPABASE_*` 가 없으면
  `supabase` 가 null 이 되고 모달은 기존 화면과 동일해진다. 배포에 환경변수를
  깜빡해도 잠기지 않는다.

### 메모
- 브라우저에서 쓰는 값은 `VITE_` 접두사가 필요하다. Vite 는 그 접두사가 붙은 변수만
  클라이언트 번들에 넣는다. 값은 기존 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 와 같다.
- `SUPABASE_SERVICE_KEY` 를 `VITE_` 로 만들면 DB 전체 권한이 공개된다. 절대 금지.
- Vite 환경변수는 시작 시점에 주입되므로 추가 후 dev 서버 재시작이 필요하다.

### 다음
- [ ] Supabase 대시보드 — Email 활성화, 자율 가입 차단, 첫 계정 생성
- [ ] `profiles` 행 삽입 (첫 계정을 admin 으로)
- [ ] 슬라이스 3: 초대 링크 발급·사용 흐름
- [ ] 슬라이스 4: `x-admin-password` 제거 + 미사용 인증 의존성 정리

---

## 2026-07-25 — 환경변수 로딩 정리, Supabase 업로드 500 원인 추적

### 한 일
- `dotenv`, `cross-env` 를 devDependencies 로 추가
  - `server/index.ts` 와 `drizzle.config.ts` 양쪽 최상단에 `import "dotenv/config"`.
    drizzle-kit 은 별도 프로세스로 돌기 때문에 한쪽만 넣으면 `db:push` 가 환경변수를 못 읽는다.
  - `dev` 스크립트가 `NODE_ENV=... tsx` 형태라 PowerShell 에서 실행 자체가 안 됐다. `cross-env` 로 교체.
- `.env.example` 신설. 코드가 실제로 읽는 변수는 `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD` 네 개뿐이다.
  `NODE_ENV`, `PORT`, `REPL_ID` 는 플랫폼이 설정하므로 주석 처리해 뒀다.
- 이미지 업로드가 500 나던 문제 수정 (아래 참조)
- `package-lock.json` 재생성, `engines.node` 지정

### 이미지 업로드 500 — 원인은 환경변수가 아니었다
증상은 `POST /api/upload-image 500 ... "Storage 업로드 실패. SUPABASE 환경변수를 확인하세요."`
그런데 환경변수는 처음부터 정상이었다. 응답이 6ms 였던 게 단서였다 —
Supabase 로 네트워크 요청이 아예 나가지 않았다는 뜻이다.

실제 원인은 `@supabase/supabase-js` 2.109 가 `createClient` 단계에서 RealtimeClient 를
초기화하면서 native WebSocket 전역을 요구하는 것. Node 22 부터 제공되므로 Node 20 에서는
예외가 났다. Storage 만 써도 클라이언트 생성에서 막힌다.
`realtime.transport` 로 `ws` 를 넘겨 해결. `ws` 는 이미 의존성이고 번들 allowlist 에도 있었다.

Node 22 로 올리면 `ws` 없이도 되지만 그대로 두기로 했다. Node 20/22/24 어디서든
동작해서 런타임이 바뀌어도 다시 볼 일이 없고, 잃는 것도 없다 (Realtime 자체를 안 쓴다).

### 왜 락파일이 문제였나
`package.json` 에는 `@supabase/supabase-js: ^2.108.2` 가 있는데
커밋된 `package-lock.json` 에는 그 항목이 아예 없었다.
그래서 새로 `npm install` 할 때마다 범위 내 최신으로 해석돼 2.109.0 이 들어왔다.
로컬(Node 20)에서만 터지고 배포(Node 24)에서는 안 터지던 이유가 이것이다.

### 삽질 기록
- 에러 메시지가 "SUPABASE 환경변수를 확인하세요" 라고 단정해서 환경변수를 한참 뒤졌다.
  실패 원인이 무엇이든 같은 문구를 반환하는 구조였다.
  `uploadBufferToStorage` 가 `null` 대신 `UploadResult` 를 반환하도록 바꿔
  환경변수 누락 / 클라이언트 생성 실패 / 업로드 거부를 구분한다.
  상세 원인은 서버 로그에만 남기고 응답에는 정리된 문구를 보낸다.
- `/api/storage-usage` 도 직접 `createClient` 를 부르고 있어 같은 버그가 있었다.
  공용 `createSupabaseClient` 헬퍼로 통일하고 중복 선언된 `BUCKET` 도 한 곳에서 export.

### 배포 후 겪은 것
푸시 후 `/api/posts`, `/api/popups` 가 500. `/api/science-news`(DB 미사용)는 200 이라
함수·번들 문제는 아니고 DB 접근만 실패하는 상황이었다.
원인은 Vercel 환경변수의 `DATABASE_URL`·`ADMIN_PASSWORD` 가 새 Supabase 프로젝트와
맞지 않았던 것. **환경변수 변경은 기존 배포에 적용되지 않는다** — 새 배포가 필요하다.

### 메모
- `engines.node` 는 `">=22"` 로 뒀다. Vercel 은 열린 범위를 사용 가능한 최신 버전으로
  해석하므로 현재 24.x 로 배포된다. `"24.x"` 로 못박으면 나중에 손으로 고쳐야 한다.
- `engines.node` 가 대시보드의 Node.js Version 설정을 덮어쓴다. 대시보드는 안 만져도 된다.
- Node.js Version 설정 위치는 Settings → **Build and Deployment** (General 아님).
- 로컬 Node 가 아직 20.18.0 이다. `vite@7.3.0` 이 `^20.19.0 || >=22.12.0` 을 요구하므로
  개발 서버가 불안정할 수 있다. 24 로 올리는 게 좋다.

### 다음
- [ ] 로컬 Node 24 로 업그레이드
- [ ] Supabase 리전 확인 (이전 항목에서 미해결)
- [ ] 1단계 착수: Supabase Auth 도입 + `x-admin-password` 제거

---

## 2026-07-25 — 활동 신청 게시판 설계 결정

### 결정한 것
1. **학생 계정을 만들지 않는다.** 신청은 학년·반·번호·이름 + 6자리 확인코드.
2. **교사만 Supabase Auth 로 로그인한다.** 자율 가입 없음, 초대 링크로만 계정 생성.
3. **신청 기록은 활동 종료 30일 후 자동 삭제한다.**

### 왜 학생 계정을 포기했나
얻는 것은 본인 확인 하나인데, 딸려오는 것이 너무 많다.
비밀번호 재설정 문의, 졸업·전학생 계정 정리, 학생 개인정보 보관 책임,
그리고 "가입을 안 해서 신청을 못 했다"는 민원. 학교 실무에서 이건 전부 담당 교사 몫이 된다.

대신 세 가지로 보완하기로 했다.
- `(post_id, 학년, 반, 번호)` 유니크 제약 → 중복·장난 신청을 1인 1건으로 제한
- 교사가 명단을 최종 확정 → 이상한 신청은 지우면 끝
- 활동별 신청 비밀번호(선택) → 해당 학급에만 구두로 알려주면 사실상 그 반만 신청 가능

완벽한 본인 확인은 아니다. 마음먹으면 친구 이름으로 신청할 수 있다.
다만 이 규모에서는 교사 확인으로 충분히 걸러지고, 그 대가로 운영 부담이 거의 0이 된다.

### 검토했다가 뺀 것
- **나이스 연동** — 나이스가 외부에 개방하는 건 학교 기본정보·급식·학사일정 같은
  데이터 조회용 Open API다. 인증키를 받아 쓰는 방식이고, 학생·교사 계정을
  외부 사이트 로그인 수단으로 넘기는 SSO는 없다. 신원 확인에는 못 쓴다.
  급식·학사일정 표시 용도로는 나중에 쓸 수 있으니 "나중에" 목록에 남겨 뒀다.
- **구글 워크스페이스** — 학교 도메인 계정이 없어 해당 없음.
- **웹푸시** — iOS는 홈 화면에 추가해야만 동작해서 학생 절반이 못 받는다.
  ICS 캘린더 피드로 대체. 서버는 텍스트만 뱉으면 되고 알림은 폰이 알아서 울린다.

### 인증 방식 재검토
지난번엔 관리자 비밀번호 하나짜리라 JWT 직접 구현이 합리적이었다.
그런데 교사 여러 명 + 역할 구분 + 비밀번호 재설정 + 초대 흐름이 붙으니
직접 만들 코드가 몇 배로 늘어난다. 전부 Supabase Auth 에 이미 들어 있고
프로젝트가 이미 Supabase 를 쓰고 있으므로 직접 구현은 접었다.
Supabase Auth 도 내부적으로는 JWT라서, "세션이냐 JWT냐" 고민 자체가 사라졌다.

### 한 일
- `shared/schema.ts` 확장 — `profiles`, `invites`, `applications` 신설,
  `posts` 에 활동 필드 추가
- `docs/TODO.md` 를 5단계 로드맵으로 재작성

### 스키마 메모
- `applyEnabled` 가 false 면 지금까지와 똑같은 공지글이다. 기존 게시물은 손댈 필요 없음.
- 확인코드는 해시만 저장한다. 6자리라 무차별 대입이 가능하므로
  **조회 API 요청 제한이 반드시 함께 들어가야 한다.** 이거 빼먹으면 명단이 털린다.
- 공개 목록 API 는 개별 신청자를 절대 반환하지 않는다. 집계만 내려보낸다.

### 막힌 점 / 확인 필요
- Supabase 프로젝트 리전이 서울인지 미확인. 해외면 국외 이전 고지 문제가 생기니
  데이터 쌓이기 전에 옮기는 게 낫다. **다음 작업 전에 먼저 확인할 것.**
- 학교 개인정보 보호책임자(정보부장) 사전 협의 필요.

### 다음
- [ ] Supabase 리전 확인 → 필요하면 이전
- [ ] 1단계 착수: Supabase Auth 도입 + `x-admin-password` 제거
- [ ] `npm run db:push` 전에 기존 데이터 백업

---

## 2026-07-25 — 코드 리뷰 및 문서 체계 도입

### 한 일
- 저장소 전체 코드 리뷰
- `docs/TODO.md`, `docs/UPDATE.md`, `docs/DEVLOG.md` 신설

### 현재 구조 파악 메모
```
client/          React SPA (Vite, wouter 라우팅)
  src/pages/     Home, CategoryPage, PostDetail, not-found
  src/components/  CreatePostDialog, PopupManager, PopupDisplay, Navigation, PostCard
  src/contexts/  admin.tsx — 관리자 상태
server/          Express 라우트, Drizzle 스토리지, Supabase 업로드
shared/          schema.ts (Drizzle 테이블 + zod), routes.ts (API 계약)
api/index.ts     Vercel 서버리스 진입점 — server/routes를 그대로 마운트
script/          build.ts, build-api.ts
```

라우팅은 `vercel.json` 리라이트로 `/api/*` → `/api/index`, 나머지는 `/index.html`.
클라이언트 카테고리 ID는 `lab_intro`, `science_class`, `career_program`,
`student_program`, `local_community`, 그리고 홈 전용 `home`.

### 리뷰에서 나온 주요 이슈
정리 결과는 `TODO.md`에 우선순위별로 옮겨 두었고, 요지만 적으면:

1. **관리자 인증** — 평문 비밀번호를 localStorage에 두고 헤더로 전송.
   XSS 노출 위험 + 만료 없음 + `/api/admin/verify` 무제한 대입 가능. 가장 시급.
2. **팝업 라우트 검증 누락** — `insertPopupSchema`를 만들어 놓고 쓰지 않음.
   게시물 라우트는 제대로 `parse()`를 타는데 팝업만 빠져 있어 단순 누락으로 보임.
3. **시드 로직 위치** — `registerRoutes()` 안에 있어 콜드 스타트마다 DB 조회 발생.
   Replit 같은 상주 서버 기준으로 작성된 코드가 Vercel 서버리스로 옮겨오며 남은 흔적으로 추정.
4. **뉴스 캐시 무효화** — 모듈 전역 변수 캐시라 인스턴스별로 따로 놀아 TTL이 의미 없음.
   원인은 3번과 같음.
5. **스크래핑 취약성** — `indexOf` + 정규식 기반이라 상대 사이트 마크업 변경에 그대로 깨짐.
   실패해도 더미 항목이 나가서 조용히 망가짐. 로그라도 남겨야 함.
6. **keep-alive 빈 커밋** — 3일마다 푸시되어 Vercel 재배포를 유발할 수 있음.

### 관찰
- `package.json`에 `passport`, `express-session`, `connect-pg-simple`, `memorystore`가
  들어 있으나 코드 어디서도 쓰이지 않음. 세션 인증을 시도하다 만 흔적으로 보임.
  P0-1을 처리할 때 이걸 살릴지 걷어낼지 먼저 정할 것.
- `@replit/vite-plugin-*` 개발 의존성이 남아 있음 — Replit에서 시작한 프로젝트.
- 푸터 주소·전화번호가 `000` 자리표시자 상태. 실제 값 확인 필요.

### 다음
- [ ] P0 항목부터 착수. 인증 방식 결정(세션 vs JWT)이 선행되어야 나머지가 따라옴.
- [ ] 착수 전 `.env.example`과 README를 먼저 만들어 두면 환경변수 정리가 같이 됨.

---

<!--
새 항목 템플릿

## YYYY-MM-DD — 제목

### 한 일

### 왜

### 막힌 점

### 다음
- [ ]
-->
