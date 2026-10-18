/**
 * 학생이 직접 정하는 확인 비밀번호 규칙.
 *
 * ## 2026-10-18 — 강도 검사를 전부 뺐다
 *
 * 원래는 흔한 값·반복·연속·생년월일·자기 학번을 거부하고, 숫자만 쓸 때는 6자를
 * 요구했다. 학생이 쓰기 어렵다는 이유로 **길이와 공백만 남기고 모두 해제**했다.
 * `1234` 도 `0000` 도 생년월일도 통과한다.
 *
 * **그래서 `server/rateLimit.ts` 의 요청 제한이 유일한 방어다.**
 *
 * 왜 그게 중요한지 적어 둔다. 이 맥락의 공격은 "한 학생을 집중해서 찍기" 가
 * 아니라 **"흔한 값 하나를 전교생 번호에 한 번씩 찍기"** 다. 그 수법은 학생당
 * 1회라 `lookupPerStudent`(실패 5회/10분)에 **절대 걸리지 않는다.** 막는 것은
 * `lookupPerIp`(실패 20회/1시간) 하나뿐이다.
 *
 * - **`lookupPerIp` 를 없애거나 늘리면 전교생 명단이 긁힌다.** 조회·취소 쪽을
 *   고칠 때 이 파일을 같이 볼 것
 * - 뚫렸을 때 드러나는 것은 그 학생의 이름·학년·반·번호·메모·상태다
 *
 * 되돌리려면 이 파일의 git 기록에서 `checkStudentPassword` 의 예전 본문을
 * 가져오면 된다(`COMMON`·`looksLikeDate`·`studentNumberForms` 등).
 *
 * 한글도 쓸 수 있다. "우리반최고" 처럼 기억하기 쉬운 한국어 단어가 네 자리
 * 숫자보다 안전하다. 안내 문구에서 권하기만 하고 **강제하지는 않는다.**
 */

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 20;

/**
 * 비밀번호를 검사한다. 문제가 있으면 학생에게 보여줄 문구를, 없으면 null 을 반환한다.
 *
 * 남은 것은 **길이와 공백뿐**이다. 둘 다 강도가 아니라 형식 문제다 — 공백은
 * 앞뒤가 눈에 안 보여서 "분명히 맞게 쳤는데 안 된다" 를 만든다.
 *
 * `who`(학년·반·번호)는 더 이상 쓰지 않지만 **인자는 남겨 둔다.** 부르는 쪽이
 * 셋(화면·서버 스키마·시험)이라, 지우면 그쪽을 다 고쳐야 하고 되돌릴 때 또
 * 고쳐야 한다.
 */
export function checkStudentPassword(
  raw: string,
  _who?: { grade: number; classNo: number; studentNo: number }
): string | null {
  const pw = raw.trim();

  if (pw.length < MIN_LENGTH) {
    return `비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`;
  }
  if (pw.length > MAX_LENGTH) {
    return `비밀번호는 ${MAX_LENGTH}자 이하여야 합니다.`;
  }
  if (/\s/.test(pw)) {
    return "비밀번호에 공백은 쓸 수 없습니다.";
  }

  return null;
}
