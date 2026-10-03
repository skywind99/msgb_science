import { z } from "zod";
import { toDisplayId } from "./teacherId.js";

/**
 * 계정 비밀번호 규칙. **가입·변경·관리자 재설정이 모두 이걸 쓴다.**
 *
 * 규칙이 세 곳에 따로 적혀 있으면 가입은 막는데 변경은 통과하는 식으로 갈라진다.
 * 그러면 "8자 이상" 이라고 안내해 놓고 6자 비밀번호가 들어간 계정이 생긴다.
 *
 * **Supabase 쪽 최소 길이는 6자다** (2026-10-03 에 시험용 계정으로 확인).
 * 그래서 8자 규칙은 **우리가 지키지 않으면 아무도 지키지 않는다.** 비밀번호 변경은
 * 브라우저에서 Supabase 를 직접 부르므로 서버가 가로채 검사할 자리도 없다.
 * 검사를 느슨하게 만들 때는 이 사실을 먼저 볼 것.
 *
 * Supabase 가 **대신 막아 주는 것 하나**는 "이전과 같은 비밀번호" 다
 * (422 `New password should be different from the old password.`).
 * 그래도 여기서 먼저 걸러 준다 — 영어 문구를 교사에게 보여줄 수는 없다.
 */

export const PASSWORD_MIN = 8;

/**
 * 상한은 **문자 수가 아니라 바이트 수**다.
 *
 * Supabase Auth 는 bcrypt 를 쓰고, bcrypt 는 **72바이트를 넘으면 조용히 자른다.**
 * 한글은 UTF-8 로 한 자가 3바이트라 "비밀번호를길게정하면안전하다" 같은 값은
 * 글자 수로는 짧은데 바이트로는 넘친다. 잘린 것을 아무도 모르는 쪽이 더 나쁘다.
 */
export const PASSWORD_MAX_BYTES = 72;

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** 가입·변경이 같이 쓰는 스키마. 문구도 한 곳에서만 쓴다. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`)
  .refine((v) => byteLength(v) <= PASSWORD_MAX_BYTES, {
    message: "비밀번호가 너무 깁니다. 더 짧게 정해 주세요.",
  });

/**
 * 새 비밀번호를 받아도 되는지. 문제가 있으면 **교사에게 보여줄 한 줄**, 없으면 `null`.
 *
 * 현재 비밀번호와 아이디는 **있을 때만** 본다. 관리자가 교사 비밀번호를 지정하는
 * 경우에는 현재 값을 모르기 때문이다.
 *
 * 아이디는 내부 이메일(`kim@msgb.invalid`)로 줘도 된다 — `toDisplayId` 로 벗긴다.
 */
export function checkNewPassword(input: {
  next: string;
  current?: string;
  /** 아이디 또는 내부 이메일. */
  loginId?: string;
}): string | null {
  const parsed = passwordSchema.safeParse(input.next);
  if (!parsed.success) return parsed.error.errors[0].message;

  if (input.current && input.next === input.current) {
    return "새 비밀번호가 현재 비밀번호와 같아요.";
  }

  if (input.loginId) {
    const id = (input.loginId.includes("@") ? toDisplayId(input.loginId) : input.loginId)
      .trim()
      .toLowerCase();
    if (id && input.next.trim().toLowerCase() === id) {
      return "새 비밀번호를 아이디와 다르게 정해 주세요.";
    }
  }

  return null;
}

/** 확인란까지 포함한 검사. 화면이 칸별 오류를 고르는 데 쓴다. */
export type PasswordFormProblem = {
  field: "current" | "next" | "confirm";
  message: string;
};

/**
 * 비밀번호 변경 폼 전체 검사. **순서가 곧 사용자가 보는 순서다.**
 *
 * 확인란 불일치를 규칙 위반보다 먼저 보지 않는다 — 규칙에 걸리는 값을 두 번
 * 똑같이 입력했다면, "서로 달라요" 가 아니라 왜 못 쓰는 값인지 알려주는 게 맞다.
 */
export function checkPasswordForm(input: {
  current: string;
  next: string;
  confirm: string;
  loginId?: string;
}): PasswordFormProblem | null {
  if (!input.current) return { field: "current", message: "현재 비밀번호를 입력해 주세요." };

  const problem = checkNewPassword({
    next: input.next,
    current: input.current,
    loginId: input.loginId,
  });
  if (problem) return { field: "next", message: problem };

  if (input.next !== input.confirm) {
    return { field: "confirm", message: "새 비밀번호가 서로 달라요." };
  }

  return null;
}
