/**
 * 학생이 직접 정하는 확인 비밀번호 규칙.
 *
 * 원래는 서버가 6자리 랜덤 코드를 발급했다. 학생이 외우기 어렵다는 이유로
 * 직접 정하는 방식으로 바꿨다. 대신 **랜덤보다 훨씬 약해진다** —
 * 그냥 두면 절반이 `1234`, `0000`, 생년월일을 쓴다.
 *
 * 게다가 이 맥락에서는 공격자가 대상을 정확히 안다. 같은 반 친구의
 * 학년·반·번호는 다 알고 있으므로, 흔한 번호 몇 개만 찍어보면 남의 신청을
 * 취소할 수 있다. 그래서 아래 두 가지가 **함께** 있어야 한다.
 *
 * 1. 추측하기 쉬운 값 거부 (이 파일)
 * 2. 조회·취소 실패 횟수 제한 (`server/rateLimit.ts` 의 `lookupPerStudent`)
 *
 * 장시간 잠금은 두지 않기로 했다. 학교에서 하루 잠기면 학생이 결국 교사를 찾아가고,
 * 그게 이 설계로 피하려던 부담이다. 대신 이 파일의 규칙이 유일한 강도 방어이므로
 * **규칙을 느슨하게 만들 때는 요청 제한도 함께 봐야 한다.**
 *
 * 한글도 쓸 수 있다. "우리반최고" 처럼 기억하기 쉬운 한국어 단어가
 * 네 자리 숫자보다 훨씬 안전하다. 안내 문구에서 이걸 권한다.
 */

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 20;
/** 숫자만 쓸 경우엔 더 길어야 한다. 네 자리 숫자는 만 가지뿐이다. */
export const MIN_DIGIT_ONLY_LENGTH = 6;

/** 실제 유출 목록 상위권 + 한국에서 흔한 조합 */
const COMMON = new Set([
  "1234", "12345", "123456", "1234567", "12345678", "123456789",
  "0000", "00000", "000000", "1111", "11111", "111111",
  "2222", "222222", "3333", "333333", "6666", "666666",
  "7777", "777777", "8888", "888888", "9999", "999999",
  "1212", "121212", "1122", "112233", "123123", "123321",
  "1004", "10041004", "1010", "1313", "2580", "0852",
  "159753", "147258", "13579", "2468",
  "qwer", "qwerty", "qwerty123", "asdf", "asdfgh", "zxcv",
  "abcd", "abcde", "abcdef", "password", "passwd", "admin",
  "1q2w", "1q2w3e", "1q2w3e4r", "qlalfqjsgh", // "비밀번호" 두벌식
  "love", "iloveyou", "school", "student",
]);

const onlyDigits = (s: string) => /^\d+$/.test(s);

/** 0000, aaaa 처럼 같은 글자만 반복 */
const allSame = (s: string) => /^(.)\1+$/.test(s);

/** 1234, 4321, abcd 처럼 한 칸씩 오르거나 내리는 값 */
function isSequential(s: string): boolean {
  if (s.length < 3) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (step !== 1 && step !== -1) return false;
  for (let i = 2; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/**
 * 생년월일 형태.
 *
 * 학생이 6자리를 정하라고 하면 대부분 생년월일을 쓴다. 같은 학년이면 태어난 해가
 * 거의 정해져 있어서 실제로는 몇백 가지밖에 안 된다. 반드시 막아야 한다.
 */
function looksLikeDate(s: string): boolean {
  if (!onlyDigits(s)) return false;

  const mmdd = (mm: string, dd: string) => {
    const m = Number(mm);
    const d = Number(dd);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  };

  // YYMMDD
  if (s.length === 6 && mmdd(s.slice(2, 4), s.slice(4, 6))) return true;
  // YYYYMMDD
  if (s.length === 8) {
    const year = Number(s.slice(0, 4));
    if (year >= 1900 && year <= 2099 && mmdd(s.slice(4, 6), s.slice(6, 8))) return true;
  }
  return false;
}

/** 학년·반·번호를 이어붙인 값들. 친구가 그대로 찍어볼 수 있다. */
function studentNumberForms(who: {
  grade: number;
  classNo: number;
  studentNo: number;
}): string[] {
  const { grade, classNo, studentNo } = who;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return [
    `${grade}${classNo}${studentNo}`,
    `${grade}${p2(classNo)}${p2(studentNo)}`,
    `${p2(grade)}${p2(classNo)}${p2(studentNo)}`,
    `${grade}0${classNo}0${studentNo}`,
    `${classNo}${studentNo}`,
    `${p2(classNo)}${p2(studentNo)}`,
  ];
}

/**
 * 비밀번호를 검사한다. 문제가 있으면 학생에게 보여줄 문구를, 없으면 null 을 반환한다.
 *
 * `who` 를 넘기면 자기 학년·반·번호를 그대로 쓴 경우도 걸러낸다.
 * 클라이언트는 입력 중에, 서버는 접수 직전에 같은 함수를 쓴다.
 */
export function checkStudentPassword(
  raw: string,
  who?: { grade: number; classNo: number; studentNo: number }
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
  if (onlyDigits(pw) && pw.length < MIN_DIGIT_ONLY_LENGTH) {
    return `숫자만 쓸 때는 ${MIN_DIGIT_ONLY_LENGTH}자 이상이어야 합니다. 글자를 섞으면 ${MIN_LENGTH}자도 됩니다.`;
  }

  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) {
    return "너무 흔한 비밀번호입니다. 친구가 쉽게 맞힐 수 있습니다.";
  }
  if (allSame(pw)) {
    return "같은 문자만 반복할 수 없습니다.";
  }
  if (isSequential(lower)) {
    return "1234 처럼 이어지는 값은 쓸 수 없습니다.";
  }
  if (looksLikeDate(pw)) {
    return "생년월일은 친구가 쉽게 맞힐 수 있어 쓸 수 없습니다.";
  }
  if (who && studentNumberForms(who).includes(pw)) {
    return "학년·반·번호를 그대로 쓸 수 없습니다.";
  }

  return null;
}
