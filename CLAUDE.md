# msgb_science

미사강변고등학교 과학중점고 소개 사이트. 배포: https://msgb-science.vercel.app

작업 전에 `docs/TODO.md`(할 일)와 `docs/DEVLOG.md`(결정 이력)를 읽을 것.
작업 후에는 `docs/DEVLOG.md`에 항목을 추가하고, 배포 단위 변경은 `docs/UPDATE.md`에 기록한다.

## 스택

- 프론트엔드: React 18 + Vite, wouter(라우팅), TanStack Query, Tailwind + shadcn/ui
- 백엔드: Express 5, Drizzle ORM, PostgreSQL(Supabase)
- 이미지: Supabase Storage
- 배포: Vercel 서버리스 (`api/index.ts`가 `server/routes.ts`를 마운트)

```
client/          React SPA
  src/pages/     Home, CategoryPage, PostDetail, not-found
  src/components/  CreatePostDialog, PopupManager, PopupDisplay, Navigation, PostCard
  src/contexts/  admin.tsx
server/          라우트, 스토리지, Supabase 업로드
shared/          schema.ts (Drizzle + zod), routes.ts (API 계약)
api/index.ts     Vercel 진입점
script/          build.ts, build-api.ts
docs/            TODO, DEVLOG, UPDATE
```

명령어: `npm run dev` / `npm run build` / `npm run check`(타입체크) / `npm run db:push`

카테고리 ID: `lab_intro`, `science_class`, `career_program`, `student_program`, `local_community`, `home`

## 지금 하려는 일

공지 게시판을 **활동 신청까지 되는 하이브리드 게시판**으로 확장한다.
교사가 활동을 올리면 학생이 신청하고, 교사가 명단을 받는다.

진행 순서는 `docs/TODO.md`의 1~5단계를 따른다.

현재 상태 (2026-07-28)
- 1단계 교사 인증 **완료** — 아이디 로그인, 초대 링크, 비밀번호 재설정, `x-admin-password` 제거
- 2~4단계 배포 완료 — 활동 게시물, 학생 신청, 교사용 명단
- 신청 기록 30일 자동 삭제 동작 (`script/cleanup.ts`)
- 남은 것: 5단계 ICS 피드, 참가 확정 명단, 개인정보처리방침 페이지

## 확정된 설계 결정 — 되돌리지 말 것

이미 검토를 마친 사항이다. 다시 제안하지 말고, 바꿔야 할 이유가 보이면 먼저 물어볼 것.

**학생 계정을 만들지 않는다.**
신청은 무계정 + 학년·반·번호·이름 + 학생이 정하는 확인 비밀번호 방식.
이유: 비밀번호 재설정 문의, 졸업·전학생 계정 정리, 개인정보 보관 책임이 전부 담당 교사 몫이 된다.
본인 확인이 느슨한 건 알고 있고, 아래 세 가지로 보완한다.
- `(post_id, grade, class_no, student_no)` 유니크 제약으로 1인 1건 제한
- 교사가 명단 최종 확정
- 활동별 신청 비밀번호(선택)

확인 수단은 **2026-07-27 에 6자리 랜덤 코드에서 학생 지정 비밀번호로 바뀌었다.**
외우기 어렵다는 이유였다. 대신 랜덤보다 약해지므로 아래 두 가지가 **함께** 있어야 한다.
빼거나 느슨하게 만들 때는 반대쪽도 같이 봐야 한다.
- `shared/studentSecret.ts` — 추측하기 쉬운 값 거부 (1234·생년월일·본인 학번 등)
- `server/rateLimit.ts` 의 `lookupPerStudent` — 실패 5회 / 10분

장시간 잠금은 두지 않기로 했다. 학교에서 하루 잠기면 학생이 교사를 찾아가게 되고
그게 이 설계로 피하려던 부담이다.

**교사 인증은 Supabase Auth를 쓴다. JWT를 직접 구현하지 않는다.**
교사 여러 명 + 역할 구분 + 초대 흐름이 필요한데 전부 Supabase Auth에 있다.
자율 가입은 열지 않는다. 관리자가 발급한 초대 링크로만 계정 생성.
역할은 `admin`(전체)과 `teacher`(자기 활동만) 두 단계.

**`x-admin-password` 헤더 인증은 2026-07-28에 제거했다. 되돌리지 말 것.**
평문 비밀번호를 localStorage에 두고 매 요청에 실어 보내던 구조였다 — XSS 한 번에 새고,
만료가 없고, 모두가 같은 값을 써서 누가 무엇을 했는지 알 수 없었다.
게시물 `authorId`가 비어 담당 교사가 자기 활동 명단을 못 보던 문제도 여기서 왔다.
이제 Supabase Auth 토큰만 받는다. 계정이 필요하면 초대 링크로 발급한다.

**로그인은 이메일이 아니라 아이디다** (2026-07-28 변경).
Supabase Auth가 이메일을 요구하므로 `kim` → `kim@msgb.invalid`로 바꿔 넘긴다
(`shared/teacherId.ts`). `.invalid`는 RFC 2606 예약 TLD라 누구도 소유할 수 없다.

대가: 메일을 받을 수 없어 **교사가 스스로 비밀번호를 재설정할 수 없다.**
그래서 관리자용 재설정(`POST /api/teachers/:id/reset-password`)이 유일한 복구 수단이다.
**이 기능을 지우면 비밀번호를 잊은 교사가 영구히 못 들어온다.**

`toLoginEmail`은 입력에 `@`가 있으면 그대로 쓴다. 아이디 방식 이전에 실제 이메일로
만든 계정이 잠기지 않게 하는 예외다. 지우지 말 것.

**알림은 ICS 캘린더 피드로 한다. 웹푸시는 쓰지 않는다.**
iOS는 홈 화면 추가 시에만 웹푸시가 동작해서 학생 절반이 못 받는다.

**나이스 계정 연동은 불가능하다.**
나이스가 여는 건 학교정보·급식·학사일정 조회용 Open API고 SSO는 없다.
급식/학사일정 표시 용도로는 나중에 쓸 수 있다.

## 개인정보 원칙 — 반드시 지킬 것

학교 사이트다. 학생 정보를 다루므로 아래는 타협하지 않는다.

- 수집 항목은 **학년·반·번호·이름**뿐. 전화번호, 이메일, 생년월일, 주소는 받지 않는다.
  새 필드를 추가하자는 제안이 나오면 먼저 물어볼 것.
- **공개 API는 개별 신청자를 절대 반환하지 않는다.** 집계(`ApplicationSummary`)만 내려보낸다.
  명단은 담당 교사와 `admin`만 볼 수 있다.
- 신청 기록은 **활동 종료 30일 후 자동 삭제**한다.
- 확인 비밀번호는 해시로만 저장한다. 평문은 어디에도 남기지 않는다.
- **조회 API에는 반드시 요청 제한을 건다.** 학생이 정한 값이라 추측이 쉽다.
  이걸 빼먹으면 전교생 명단이 털린다. 조회 기능을 고칠 때 같은 커밋에서 확인할 것.
- 조회 실패 시 "신청이 없다"와 "비밀번호가 틀렸다"를 구분해 알려주지 않는다.
  그 번호 학생이 신청했다는 사실도 알려줄 필요가 없다.

## 알려진 문제

고칠 때 참고. 상세는 `docs/TODO.md`.

- `server/routes.ts` — 팝업 라우트가 `insertPopupSchema`를 쓰지 않고 `req.body`를 그대로 전달.
- `server/routes.ts` — 시드 로직이 `registerRoutes()` 안에 있어 콜드 스타트마다 DB 조회 발생. `script/seed.ts`로 분리해야 함.
- 사이언스타임즈 뉴스 캐시가 모듈 전역 변수라 서버리스에서 무효.
- 뉴스 스크래핑이 `indexOf` + 정규식 기반이라 상대 사이트 마크업 변경에 취약.
- `api/_source.ts`가 `api/index.ts`와 중복으로 보임. 확인 후 정리.
- 푸터 주소·전화번호가 `000` 자리표시자 (`client/src/App.tsx`).

## 작업 규칙

- **DB 스키마를 바꾸기 전에 알릴 것.** `npm run db:push`는 사용자가 백업 후 직접 실행한다.
- 변경 후 `npm run check`로 타입 체크를 돌린다.
- `.env`는 절대 커밋하지 않는다. 코드나 문서에 실제 키 값을 적지 않는다.
- 주석과 UI 문구는 한국어로 쓴다.
- 교사가 쓰는 화면은 단순하게. 새 기능은 기존 글쓰기 흐름에 토글 하나 추가되는 수준을 넘지 않도록 한다.
- **상단 네비(`Navigation.tsx`) 안에 모달을 넣을 때는 `createPortal(…, document.body)` 를 쓴다.**
  `.glass-nav` 의 `backdrop-blur` 가 자손 `position: fixed` 의 기준을 네비 바로 바꿔서,
  포털 없이 두면 모달이 네비 높이 안에 갇힌다. 포털은 `AnimatePresence` **밖**에 있어야 한다.
- 큰 변경은 한 번에 하지 말고 단계를 쪼개서 확인받는다.
