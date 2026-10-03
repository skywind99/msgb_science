# 계정 복구 — 관리자 비밀번호를 잊었을 때

**먼저 이것부터 확인하세요.** 관리자(`admin`)가 둘 이상이면 서로 재설정할 수 있습니다.
사이트에서 **교사 계정 관리 → 비밀번호 재설정**을 쓰면 됩니다. 아래 절차는 **다른
길이 없을 때만** 씁니다.

이 문서가 필요한 이유는 하나입니다. 이 사이트는 로그인을 **아이디**로 받고, Supabase
Auth 가 이메일을 요구하므로 아이디 뒤에 받을 수 없는 도메인을 붙여 내부 이메일을
만듭니다 — `kim` → `kim@msgb.invalid` (`shared/teacherId.ts` 의 `TEACHER_ID_DOMAIN`).
`.invalid` 는 RFC 2606 이 예약한 최상위 도메인이라 누구도 소유할 수 없습니다.

그 대가로 **메일을 받을 수 없습니다.**

> ### Supabase 의 "Reset password"(메일 발송)는 이 사이트에서 쓸 수 없습니다
>
> 대시보드와 로그인 화면에 있는 "비밀번호 재설정 메일 보내기" 류의 기능은 모두
> `@msgb.invalid` 주소로 메일을 보냅니다. **그 메일함은 존재하지 않습니다.**
> 보내도 아무 일도 일어나지 않고, 발송이 "성공" 으로 보여도 받을 수 없습니다.
> 시간을 버리지 마세요.

---

## 준비물

- `SUPABASE_URL` 과 `SUPABASE_SERVICE_KEY` — Vercel 프로젝트의 환경변수에 있습니다
  (로컬 `.env` 에도 같은 값이 있습니다)
- `DATABASE_URL` — `profiles` 를 확인할 때만 필요합니다
- Node 와 이 저장소

`SUPABASE_SERVICE_KEY` 는 **모든 계정의 비밀번호를 바꿀 수 있는 키**입니다.
화면 공유 중에 열지 말고, 터미널 기록이 남는 곳에 붙여 넣지 마세요.

---

## 방법 1 — 서버 키로 직접 바꾸기 (기본 절차)

사이트의 재설정 기능과 **똑같은 일**을 손으로 하는 것입니다. 대시보드 메뉴 이름이
바뀌어도 이 방법은 그대로 동작합니다.

### 1) 1회용 스크립트를 만듭니다

저장소 안에 `_recover.ts` 로 만듭니다. **아이디와 새 비밀번호만 고치세요.**

```ts
import "dotenv/config";
import { createSupabaseClient } from "./server/imageUpload.js";
import { toLoginEmail } from "./shared/teacherId.js";

// ── 여기만 고칩니다 ──
const LOGIN_ID = "admin";              // 아이디 (@ 뒤는 적지 않습니다)
const NEW_PASSWORD = process.env.NEW_PW!; // 아래 2)처럼 환경변수로 넘깁니다
// ─────────────────────

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_KEY!;
if (!url || !key) throw new Error("SUPABASE 환경변수가 없습니다");
if (!NEW_PASSWORD || NEW_PASSWORD.length < 8) throw new Error("새 비밀번호가 너무 짧습니다");

const email = toLoginEmail(LOGIN_ID);
const admin = createSupabaseClient(url, key);

// 이메일로 계정을 찾습니다. id 를 직접 적으면 엉뚱한 계정을 바꿀 수 있습니다.
const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const user = list.data?.users.find((u) => u.email === email);
if (!user) throw new Error(`계정을 찾지 못했습니다: ${email}`);

const r = await admin.auth.admin.updateUserById(user.id, { password: NEW_PASSWORD });
if (r.error) throw new Error("바꾸지 못했습니다: " + r.error.message);

console.log(`바꿨습니다: ${LOGIN_ID} (id ${user.id.slice(0, 8)}…)`);
```

`createSupabaseClient` 를 쓰는 이유가 있습니다. Node 20 에는 native WebSocket 이
없어서 `@supabase/supabase-js` 의 `createClient` 를 그냥 부르면 **클라이언트를 만드는
단계에서 예외가 납니다.** 저 래퍼가 `ws` 를 넘겨 줍니다 (`server/imageUpload.ts`).

### 2) 새 비밀번호를 환경변수로 넘겨 실행합니다

비밀번호를 파일에 적지 않습니다. 셸 기록에도 남지 않게 합니다.

```bash
read -s NEW_PW && export NEW_PW && npx tsx _recover.ts && unset NEW_PW
```

`read -s` 는 입력을 화면에 보여주지 않습니다. PowerShell 이라면 `$env:NEW_PW` 에
넣고 끝나고 `Remove-Item Env:NEW_PW` 로 지우세요.

### 3) 로그인해 보고, **바로 사이트에서 다시 바꿉니다**

사이트 오른쪽 위 **이름 배지 → 비밀번호 변경**(좁은 화면은 메뉴 안)입니다.
2)에서 쓴 값은 임시로만 쓰는 값입니다.

### 4) 스크립트를 지웁니다

```bash
rm _recover.ts
```

**커밋하지 마세요.** `_` 로 시작하는 임시 파일이라도 `git add -A` 에 쓸려 들어갑니다.

---

## 방법 2 — Supabase 대시보드

**"비밀번호를 직접 지정하는 메뉴가 있을 때만" 쓰세요.** 대시보드의 사용자 상세 화면에
비밀번호를 **입력해서 바꾸는 칸**이 있으면 그걸 쓰면 됩니다.

1. Supabase → 프로젝트 → **Authentication → Users**
2. `<아이디>@msgb.invalid` 를 찾습니다 (예: `admin@msgb.invalid`)
3. 그 사용자의 동작 메뉴에서 **비밀번호를 직접 입력해 바꾸는 항목**을 고릅니다
4. 로그인한 뒤 사이트에서 다시 바꿉니다

**메일을 보내는 항목("Send password recovery", "Reset password" 등)은 쓰지 마세요.**
위에 적은 대로 `@msgb.invalid` 메일함은 없습니다.

직접 지정하는 칸이 보이지 않으면 **방법 1 로 돌아가세요.** 대시보드 메뉴 구성은
버전마다 달라서, 이 문서에 적힌 위치가 맞지 않을 수 있습니다.

---

## 반드시 지킬 것

- **`profiles` 행을 지우지 마세요.** 지우면 Supabase 로그인은 되는데 서버가 거부해서
  (`/api/me` 가 401) 아무것도 할 수 없는 상태가 됩니다. 비밀번호만 바꾸면 됩니다.
- **`auth.users` 를 SQL 로 직접 고치지 마세요.** 비밀번호는 Auth API 로만 바꿉니다.
  해시 형식과 부수 테이블을 Auth 가 함께 관리합니다.
- **끝나면 관리자를 한 명 더 만드세요.** 관리자가 혼자인 상태가 이 문서를 필요하게
  만듭니다. 사이트에서 **교사 계정 관리 → 초대 링크 발급**(역할 `admin`)로 만듭니다.
  둘이 되면 서로 재설정할 수 있어서 이 절차가 필요 없어집니다.
- 평일 수업 시간(08:30~16:30)에는 되도록 피하세요. 학생이 신청하는 시간대입니다.

---

## 알아 둘 것 — 비밀번호 길이

사이트는 **8자 이상**을 요구합니다 (`shared/passwordRule.ts`).

**Supabase 쪽 최소 길이는 6자입니다** (2026-10-03 에 시험용 계정으로 확인). 본인
비밀번호 변경은 브라우저에서 Supabase 를 직접 부르므로, **개발자 도구로 화면 검사를
우회하면 6자 비밀번호를 넣을 수 있습니다.** 자기 계정에만 해당하고 관리자 재설정은
서버가 거르지만, 알고 있어야 하는 사실입니다.

Supabase 대시보드의 Authentication 설정에서 최소 길이를 **8** 로 올리면 우회가
막힙니다. 설정 항목 위치는 대시보드 버전에 따라 다르니 Authentication 설정에서
"password" 로 찾으세요. (이 문서를 쓸 때 코드에서 확인할 방법이 없었습니다 —
`GET /auth/v1/settings` 는 비밀번호 정책을 돌려주지 않고, 읽으려면 Management API
토큰이 필요합니다.)

---

## 관련 파일

| 파일 | 무엇 |
|---|---|
| `shared/teacherId.ts` | 아이디 ↔ 내부 이메일. `TEACHER_ID_DOMAIN = "msgb.invalid"` |
| `shared/passwordRule.ts` | 비밀번호 규칙 (8자 이상, 72바이트 이하) |
| `server/invites.ts` | `resetTeacherPassword` — 사이트의 관리자 재설정 |
| `server/imageUpload.ts` | `createSupabaseClient` — Node 20 용 래퍼 |
| `client/src/components/PasswordChange.tsx` | 본인 비밀번호 변경 창 |
