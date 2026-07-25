# UPDATE

배포 단위 변경 이력. 사용자·운영자 관점에서 "무엇이 달라졌는가"를 기록합니다.
세부 구현 과정과 시행착오는 [DEVLOG.md](./DEVLOG.md)에 남깁니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) / 버전: [유의적 버전](https://semver.org/lang/ko/)

분류 태그
- `추가` 새로운 기능
- `변경` 기존 동작 수정
- `수정` 버그 수정
- `제거` 기능·코드 삭제
- `보안` 취약점 관련

---

## [Unreleased]

### 수정
- 관리자 이미지 업로드가 항상 실패하던 문제 수정. `@supabase/supabase-js` 가
  Node 20 에서 클라이언트 생성 단계부터 예외를 던지던 것이 원인.
  Storage 사용량 조회에도 같은 문제가 있어 함께 고쳤다.
- 업로드 실패 메시지가 원인과 무관하게 항상 "SUPABASE 환경변수를 확인하세요" 로
  나오던 문제 수정. 이제 환경변수 누락과 실제 업로드 실패가 구분된다.

### 추가
- **교사 계정 로그인** — 로그인 창에 이메일 로그인이 추가됐다. 기존 관리자 비밀번호도
  그대로 쓸 수 있고, 창 아래 링크로 전환한다. 교사 계정으로 들어오면 이름이 표시된다.
  (계정 발급 준비가 끝나기 전까지는 기존 방식만 동작한다.)
- `docs/` 디렉터리 신설 — TODO, UPDATE, DEVLOG 문서화 체계 도입
- `.env.example` 추가. 필요한 환경변수는 `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD` 네 개.
- 활동 신청 게시판용 DB 스키마 (`profiles`, `invites`, `applications`).
  아직 이 테이블을 쓰는 화면·API 가 없어 동작 변화는 없다.

### 변경
- 실행 환경을 Node 22 이상으로 지정 (`engines.node`). 배포는 24.x 로 동작한다.
- `npm run dev` 가 Windows PowerShell 에서 동작하도록 수정.
- `.env` 파일을 자동으로 읽는다. 이전에는 셸에서 직접 지정해야 했다.

### 운영 메모
- Vercel 환경변수를 바꾼 뒤에는 **재배포를 해야 적용된다.** 기존 배포에는 반영되지 않는다.

### 예정
- 관리자 세션 토큰 인증으로 전환 (TODO P0)
- 팝업 API 입력 검증 추가 (TODO P0)
- 시드 로직 요청 경로에서 분리 (TODO P1)

---

## [0.1.0] - 2026-06-28

첫 배포판. https://msgb-science.vercel.app

### 추가
- 카테고리별 게시물 시스템 — 과학실 소개 / 과학중점반활동 / 진로프로그램 / 학생프로그램 / 지역사회
- 게시물 상세 페이지, 이미지·본문·유튜브 임베드를 섞는 블록 에디터
- 관리자 비밀번호 기반 게시물 CRUD (인라인 편집)
- 팝업 공지 관리 — 활성/비활성 토글, 이미지·링크 첨부
- 사이언스타임즈 최신 기사 5건 자동 수집 및 홈 노출
- Supabase Storage 이미지 업로드 및 외부 이미지 미러링
- Storage 사용량 조회 API
- 게시물 삭제 시 해당 게시물을 가리키는 팝업 자동 정리
- Supabase 유휴 일시정지 방지 GitHub Actions 워크플로

### 기술 스택
- 프론트엔드: React 18, Vite, wouter, TanStack Query, Tailwind CSS, shadcn/ui, framer-motion
- 백엔드: Express 5, Drizzle ORM, PostgreSQL (Supabase)
- 배포: Vercel (서버리스 함수 + 정적 호스팅)

---

<!--
새 항목 작성 예시

## [0.2.0] - YYYY-MM-DD

### 보안
- 관리자 인증을 세션 토큰 방식으로 교체. 기존 로그인 세션은 모두 만료되므로 재로그인 필요.

### 수정
- 사이언스타임즈 마크업 변경으로 기사 목록이 비어 보이던 문제 수정.
-->
