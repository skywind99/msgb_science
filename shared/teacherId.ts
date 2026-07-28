/**
 * 교사 로그인 아이디.
 *
 * Supabase Auth 는 비밀번호 로그인에 이메일을 필수로 요구한다. 교사에게 이메일을
 * 받지 않기로 했으므로, 아이디 뒤에 받을 수 없는 도메인을 붙여 내부 이메일을 만든다.
 * `kim` → `kim@msgb.invalid`. 교사는 이 주소를 볼 일이 없다.
 *
 * `.invalid` 는 RFC 2606 이 이 목적으로 예약한 최상위 도메인이다. 누구도 소유할 수
 * 없으므로 실수로 남의 주소가 되거나 메일이 외부로 나갈 일이 없다.
 *
 * **대가**: 메일을 받을 수 없으니 교사가 스스로 비밀번호를 재설정하지 못한다.
 * 그래서 관리자용 재설정 기능이 반드시 함께 있어야 한다. 그게 없으면 비밀번호를
 * 잊은 교사가 영구히 들어올 수 없다.
 */

export const TEACHER_ID_DOMAIN = "msgb.invalid";

export const MIN_ID_LENGTH = 3;
export const MAX_ID_LENGTH = 20;

/**
 * 아이디 → 내부 이메일.
 *
 * 이미 `@` 가 들어 있으면 그대로 둔다. 기존에 실제 이메일로 만든 계정
 * (초대 흐름을 만들기 전에 만든 첫 관리자)이 계속 로그인할 수 있어야 한다.
 * 이 예외가 없으면 아이디 방식으로 바꾸는 순간 그 계정이 잠긴다.
 */
export function toLoginEmail(input: string): string {
  const value = input.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${TEACHER_ID_DOMAIN}`;
}

/** 내부 이메일 → 화면에 보여줄 아이디. 실제 이메일이면 그대로 보여준다. */
export function toDisplayId(email: string): string {
  const suffix = `@${TEACHER_ID_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/**
 * 아이디 규칙 검사. 문제가 있으면 사유를, 없으면 null 을 반환한다.
 *
 * 영문 소문자·숫자·밑줄만 받는다. 대문자를 섞으면 "Kim 인지 kim 인지" 로
 * 로그인 문의가 생기므로 아예 소문자로 통일한다 (`toLoginEmail` 이 소문자로 낮춘다).
 */
export function checkTeacherId(raw: string): string | null {
  const id = raw.trim();

  if (id.length === 0) return "아이디를 입력해 주세요.";
  if (id.length < MIN_ID_LENGTH) return `아이디는 ${MIN_ID_LENGTH}자 이상이어야 합니다.`;
  if (id.length > MAX_ID_LENGTH) return `아이디는 ${MAX_ID_LENGTH}자 이하여야 합니다.`;
  if (!/^[a-z]/.test(id)) return "아이디는 영문 소문자로 시작해야 합니다.";
  if (!/^[a-z0-9_]+$/.test(id)) {
    return "아이디에는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다.";
  }
  return null;
}
