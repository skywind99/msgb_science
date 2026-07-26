# TODO

미사강변고 과학중점고 사이트 과제 목록.

최종 수정: 2026-07-26

---

## 방향

기존 공지 게시판을 **활동 신청까지 되는 하이브리드 게시판**으로 확장한다.

확정된 설계 원칙
- **학생 계정을 만들지 않는다.** 신청은 학년·반·번호·이름 + 6자리 확인코드 방식.
- **교사만 로그인한다.** Supabase Auth 사용, 자율 가입 없이 초대 링크로만 계정 생성.
- **개인정보는 최소한만, 짧게.** 연락처·이메일·생년월일 수집 안 함. 활동 종료 30일 후 신청 기록 자동 삭제.
- **교사가 배울 게 없어야 한다.** 글쓰기 화면에 "신청 받기" 토글 하나가 추가되는 수준.

검토 후 제외한 선택지
- 나이스 계정 연동 — 나이스가 외부에 여는 것은 학교 기본정보·급식·학사일정 등 데이터 조회용 Open API이고, 신원 확인용 SSO는 제공되지 않음. 급식/학사일정 표시 용도로는 나중에 활용 가능.
- 구글 워크스페이스 로그인 — 학교 도메인 계정이 없어 해당 없음.
- 웹푸시 알림 — iOS는 홈 화면 추가 시에만 동작. ICS 캘린더 구독으로 대체.

---

## 1단계 — 교사 인증 (선행 필수)

기존 P0 보안 과제가 이 단계에서 함께 해결된다.

진행 상황 (2026-07-25)
- 슬라이스 1 완료 — Supabase Auth 로그인을 기존 방식과 **병행**으로 추가했다.
  `server/auth.ts` 의 `resolveUser` 가 Bearer 토큰을 먼저 보고 없으면 기존
  `x-admin-password` 로 넘어간다. 새 방식이 실패해도 기존 경로로 들어갈 수 있다.
- 남은 일: Supabase 대시보드 설정(Email 활성화 / 자율 가입 차단 / 계정 생성),
  `profiles` 행 삽입, 초대 흐름, 그리고 마지막에 `x-admin-password` 제거.

- [x] `profiles` 테이블 생성 (`id`는 `auth.users.id` 사용)
- [x] Supabase Auth 로그인 추가 (`server/auth.ts`, `client/src/lib/supabase.ts`)
- [ ] Supabase 대시보드 설정 — Email 활성화, "Allow new users to sign up" 끄기, 첫 계정 생성
- [ ] `profiles` 행 삽입 (첫 계정을 `role='admin'` 으로)
- [ ] **Vercel 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가** — 빌드 타임 변수라
      없으면 배포본에서 교사 로그인이 아예 나타나지 않는다. 추가 후 재배포 필요.
- [ ] 기존 `x-admin-password` 헤더 인증 전면 제거
  - `client/src/contexts/admin.tsx` — localStorage 평문 비밀번호 저장 폐기
  - `server/routes.ts` — `checkAdminPassword` 를 토큰 검증 미들웨어로 교체
- [ ] 역할 두 단계: `admin`(전체 관리) / `teacher`(자기 활동만 관리)
- [ ] 초대 링크 발급·사용 흐름 (`invites` 테이블, 토큰은 해시 저장, 유효기간 7일)
- [ ] 미사용 의존성 정리 — `passport`, `passport-local`, `express-session`, `connect-pg-simple`, `memorystore`
- [ ] 로그인 실패 요청 제한 (Supabase Auth 기본 제한 확인 후 부족하면 보완)

---

## 2단계 — 활동 게시물

- [x] `posts` 테이블 확장 — `shared/schema.ts` 적용 후 `npm run db:push`
  - `applyEnabled`, `eventStart`, `eventEnd`, `location`, `capacity`
  - `applyStart`, `applyDeadline`, `applyNote`, `applyPasswordHash`, `allowWaitlist`, `authorId`
- [x] 교사용 활동 등록 폼 — `ActivityFields.tsx` 를 글쓰기·수정 양쪽에서 공용으로 쓴다
- [x] 게시물 상세에 활동 정보 표시 (일시·장소·정원·마감)
      → **남은 자리는 아직 없다.** 3단계의 `ApplicationSummary` 집계 API 가 있어야 한다.
- [x] 홈 상단에 **신청 마감 임박 활동** 노출 (`UpcomingActivities.tsx`, 최대 3건)
- [x] 활동 목록을 날짜순으로 보는 일정 화면 (`/schedule`, `Schedule.tsx`)
- [x] 게시물 API 응답에서 `applyPasswordHash` 제거 (`toPublicPost`) — 공개 API 였다
- [ ] 상세 페이지 "남은 자리" 표시 — 3단계 집계 API 완성 후
- [ ] 상단 메뉴가 7개로 늘어 데스크톱에서 빡빡하다. 좁아지면 드롭다운으로 묶기

---

## 3단계 — 학생 신청

- [x] `applications` 테이블 생성
- [ ] `POST /api/posts/:id/apply` — 신청 접수
  - 마감·정원 확인, 정원 초과 시 `allowWaitlist` 에 따라 대기자 등록
  - 6자리 확인코드 생성 → 해시 저장 → 평문은 응답에 한 번만 반환
  - `applyPasswordHash` 가 있으면 대조 — `server/applyPassword.ts` 의
    `verifyApplyPassword` 가 이미 있다. 호출부만 만들면 된다.
  - 유니크 제약 위반 시 "이미 신청한 활동입니다" 안내
- [ ] `POST /api/applications/lookup` — 학년·반·번호 + 코드로 본인 신청 조회·취소
- [ ] **조회·신청 API 요청 제한** — 6자리 코드 무차별 대입 방지. IP 기준 분당 제한 + 실패 누적 시 잠금
- [ ] 신청 완료 화면 — 확인코드를 크게 표시하고 "이 번호를 꼭 저장하세요" 안내
- [ ] 공개 목록 API 는 개별 신청자를 반환하지 않고 집계(`ApplicationSummary`)만 반환

---

## 4단계 — 교사용 관리

- [ ] 신청자 명단 화면 (담당 교사 + admin 만 접근)
- [ ] 명단 엑셀 내려받기
- [ ] 신청 개별 삭제·상태 변경 (대기자를 신청 확정으로 승격 포함)
- [ ] 활동 마감 후 참가 확정 명단 확정 기능

---

## 5단계 — 알림

- [ ] `GET /api/calendar.ics` — 활동 일정 ICS 피드
  - 학생이 폰 캘린더에 한 번 구독하면 새 활동이 자동 추가되고 알림도 폰이 처리
  - 카테고리별 피드(`?category=career_program`)도 함께 제공
- [ ] 구독 방법 안내 페이지 (iOS / Android / PC 캡처 포함)
- [ ] (선택) 메일 알림 — 필요해지면 검토. 이메일 수집이 필요하므로 신중히.

---

## 개인정보 · 운영

- [ ] **Supabase 리전 확인** — 서울(ap-northeast-2)이 아니면 데이터 쌓이기 전에 이전
- [ ] **Vercel 함수 리전을 `icn1`로 고정** — `vercel.json` 에 `"regions": ["icn1"]`
- [ ] 개인정보처리방침 페이지 작성 — 수집 항목, 보유기간, 파기 방법
- [ ] 신청 폼에 수집 항목·보유기간 고지 및 동의 체크
- [ ] **신청 기록 자동 삭제** — 활동 종료 30일 경과분 삭제. 기존 keep-alive 워크플로에 단계 추가
- [ ] 학교 개인정보 보호책임자와 사전 협의
- [ ] 교사용 운영 안내문 1장 (활동 등록부터 명단 확정까지)

---

## 기존 과제 (계속 유효)

### 이미지 · Storage
- [ ] **업로드 시점을 저장 직전으로 변경** — 지금은 파일을 고르는 즉시 업로드해서
      미리보기를 만든다. 취소하거나 다른 사진으로 바꾸면 그 파일이 버킷에 남는다.
      `createObjectURL` 로 로컬 미리보기를 만들고, 글을 저장할 때만 업로드한다.
- [ ] `post-images/` 미참조 파일 4개 삭제 (약 542KB)
- [ ] 업로드 전 클라이언트 리사이즈 (긴 변 1600px 정도) — Vercel 함수의 요청 본문
      한계가 4.5MB 라 스마트폰 사진이 그대로는 실패한다. 측정 결과 4MB 는 성공,
      4.4MB 부터 413 `FUNCTION_PAYLOAD_TOO_LARGE`.
- [ ] 413 응답일 때 "이미지가 너무 큽니다" 안내 표시 (현재는 실패 이유가 안 보임)

메모
- Supabase Storage 에는 자동 만료가 없다. 지우지 않으면 영구히 남는다.
- `scraped/` 는 뉴스 이미지 미러링 캐시다. URL 이 DB 에 없어 미참조로 잡히지만
  쓰레기가 아니다. 정리 대상에서 제외할 것.

### 안정성
- [ ] 시드 로직을 `registerRoutes()` 밖으로 분리 → `script/seed.ts`
- [ ] 뉴스 캐시를 DB 또는 캐시 헤더로 이전 (모듈 전역 변수는 서버리스에서 무효)
- [ ] 뉴스 스크래핑 견고화 — RSS 확인, 없으면 `cheerio` 도입, 0건이면 경고 로그
- [ ] `/api/mirror-image` SSRF 방어 — 사설 IP 차단, 크기·시간 제한
- [ ] `api/_source.ts` 정리 (미사용이면 삭제)
- [ ] 게시물 삭제 시 팝업 정리를 단일 쿼리로 교체
- [ ] keep-alive 워크플로의 빈 커밋 푸시 제거

### 품질
- [ ] README 작성
- [x] `.env.example` 추가
- [ ] LICENSE 파일 추가
- [ ] `client/public/a.txt` 삭제
- [ ] 푸터 실제 주소·전화번호 반영 (현재 `000` 자리표시자)
- [ ] `npm run check` 를 CI에 추가
- [ ] 에러 바운더리 및 빈 상태 UI 점검
- [ ] 접근성 — 이미지 `alt`, 팝업 포커스 트랩, 키보드 내비게이션

---

## 나중에

- [ ] 게시물 검색 / 태그 필터, 페이지네이션
- [ ] 이미지 업로드 시 리사이즈·WebP 변환
- [ ] SEO — 동적 title/OG 태그, sitemap.xml
- [ ] 나이스 Open API 로 급식·학사일정 표시
- [ ] 활동 사후 기록 — 참가자 소감, 사진 갤러리
- [ ] 활동 참여 통계 (학년별·프로그램별)
