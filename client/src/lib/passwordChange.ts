import { supabase } from "@/lib/supabase";
import { checkPasswordForm, type PasswordFormProblem } from "@shared/passwordRule";

/**
 * 비밀번호 변경. **브라우저에서 Supabase 를 직접 부른다.**
 *
 * 평문 비밀번호가 우리 서버 함수를 지나가지 않는다는 점이 이 방식의 장점이고,
 * 대가는 **우리가 시도 횟수를 셀 수 없다는 것**이다. 현재 비밀번호 확인이 곧
 * 비밀번호 추측기가 되므로, 막는 쪽은 Supabase 의 제한뿐이다.
 * (2026-10-03 확인: 6회 연속 실패로는 429 가 나오지 않았다. 더 두드려서 한계를
 *  찾지는 않았다 — 같은 IP 로 들어오는 교사들이 함께 막힐 수 있다.)
 *
 * 순서가 중요하다.
 *  1. 규칙 검사 — 틀린 값을 들고 Supabase 를 두드리지 않는다
 *  2. 현재 비밀번호로 재인증 — 이게 본인 확인이다
 *  3. 비밀번호 변경
 *  4. 다른 기기 세션 끊기 — **실패해도 변경은 이미 끝났다.** 성공으로 보고한다
 *
 * **비밀번호 값은 어디에도 남기지 않는다.** 로그, 오류 메시지, 저장소, 분석 도구
 * 전부 해당한다. 그래서 이 모듈은 `console` 을 쓰지 않는다.
 */

export type ChangeResult =
  | { ok: true; othersSignedOut: boolean }
  | { ok: false; problem: PasswordFormProblem };

/** 잠시 후 다시 — 요청 제한. 두 단계에서 같은 문구를 쓴다. */
const TOO_MANY = "잠시 후 다시 시도해 주세요.";

/**
 * Supabase 오류를 교사가 읽을 문구로 바꾼다.
 *
 * 원문을 그대로 보여주지 않는다. 영어이고, 내부 이메일(`kim@msgb.invalid`)이
 * 문구에 섞여 나오는 경우가 있다 — 그게 보이면 교사는 자기 이메일이라고 오해한다.
 */
function reauthMessage(status: number | undefined): string {
  if (status === 429) return TOO_MANY;
  return "현재 비밀번호가 맞지 않아요.";
}

function updateMessage(status: number | undefined, raw: string): PasswordFormProblem {
  if (status === 429) return { field: "next", message: TOO_MANY };
  // Supabase 가 "이전과 같은 비밀번호" 를 422 로 막는다. 우리도 먼저 걸러 주지만,
  // 입력란에 보이지 않는 공백 차이 등으로 여기까지 오는 경우가 있다.
  if (/different from the old password/i.test(raw)) {
    return { field: "next", message: "새 비밀번호가 현재 비밀번호와 같아요." };
  }
  if (/weak|pwned|leaked|short|at least/i.test(raw)) {
    return { field: "next", message: "쓸 수 없는 비밀번호예요. 다른 값으로 정해 주세요." };
  }
  return { field: "next", message: "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요." };
}

export async function changeOwnPassword(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<ChangeResult> {
  if (!supabase) {
    return { ok: false, problem: { field: "current", message: "로그인이 설정되지 않았습니다." } };
  }

  // 로그인한 계정의 내부 이메일. **아이디를 따로 받지 않는다** — 세션에 있는 값을
  // 쓰면 남의 계정을 겨냥할 수가 없다.
  const { data: me } = await supabase.auth.getUser();
  const email = me.user?.email ?? "";
  if (!email) {
    return { ok: false, problem: { field: "current", message: "다시 로그인한 뒤 시도해 주세요." } };
  }

  const problem = checkPasswordForm({ ...input, loginId: email });
  if (problem) return { ok: false, problem };

  // 1) 현재 비밀번호로 재인증. 실패해도 지금 세션은 유지된다
  //    (supabase-js 는 실패한 로그인으로 저장된 세션을 지우지 않는다).
  const reauth = await supabase.auth.signInWithPassword({ email, password: input.current });
  if (reauth.error) {
    return {
      ok: false,
      problem: { field: "current", message: reauthMessage(reauth.error.status) },
    };
  }

  // 2) 변경
  const updated = await supabase.auth.updateUser({ password: input.next });
  if (updated.error) {
    return { ok: false, problem: updateMessage(updated.error.status, updated.error.message) };
  }

  // 3) 다른 기기 세션 끊기. **여기서 실패해도 성공이다** — 비밀번호는 이미 바뀌었고,
  //    오류를 띄우면 교사는 안 바뀐 줄 알고 다시 시도한다(그때는 현재 비밀번호가
  //    틀렸다고 나온다). 무엇이 됐는지만 정확히 알린다.
  const out = await supabase.auth.signOut({ scope: "others" });
  return { ok: true, othersSignedOut: !out.error };
}
