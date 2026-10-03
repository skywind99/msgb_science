/**
 * AI 가 읽은 날짜의 **연도를 정한다.**
 *
 * **왜 후처리가 필요한가.** 포스터에는 "5월 8일~5월 17일" 처럼 연도가 없는 날짜가
 * 흔하다. 모델에게는 `YYYY-MM-DD` 로 답하라고 하므로 연도를 **반드시 하나 고르게
 * 된다.** 예전에는 "오늘의 연도를 쓰라" 고 지시했는데, 2026-10-03 에 5월 안내문을
 * 읽으면 `2026-05-08` — 이미 다섯 달 지난 날짜가 나왔다.
 *
 * 그래서 모델에게 **연도가 적혀 있었는지**(`dateHasYear`·`applyHasYear`)와
 * **원문의 요일**(`dateWeekday`)을 함께 묻고, 연도는 여기서 정한다. 날짜 계산을
 * 모델에게 맡기지 않는 이유는 간단하다 — 틀려도 알 수 없고, 시험할 수 없다.
 *
 * **연도가 적혀 있으면 손대지 않는다.** 교사가 지난 행사를 기록으로 올리는 일이
 * 있어서, 과거라는 이유로 미래로 밀면 멀쩡한 날짜를 망친다. 과거는 화면에서
 * 경고로만 알린다.
 *
 * 브라우저 시간대에 흔들리지 않게 **모든 계산을 문자열과 UTC 로** 한다.
 * `new Date("2026-05-08")` 같은 현지 시간 해석을 쓰지 않는다.
 */

/** 모델에게 받은 것 중 연도 판정에 쓰는 것만. */
export type AiDateInput = {
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  applyStart: string | null;
  applyDeadline: string | null;
  /** 활동 날짜에 연도가 적혀 있었는가. 모르면 `null` — 그때는 손대지 않는다. */
  dateHasYear: boolean | null;
  /** 신청 기간에 연도가 적혀 있었는가. */
  applyHasYear: boolean | null;
  /** 원문에 적힌 활동 시작 요일. "토" 또는 "토요일" 등. 없으면 `null`. */
  dateWeekday: string | null;
};

export type ResolvedDates = {
  date: string | null;
  endDate: string | null;
  applyStart: string | null;
  applyDeadline: string | null;
  /**
   * 원문의 요일과 해석한 날짜의 요일이 다르다.
   *
   * **이때 연도를 임의로 바꾸지 않는다.** 요일이 맞는 해를 찾아 옮기면, 원문의
   * 오타 하나로 날짜가 1년씩 튄다. 어느 쪽이 틀렸는지는 사람이 봐야 안다.
   */
  weekdayMismatch: boolean;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

type Ymd = { y: number; m: number; d: number };

function parseDate(s: string | null): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function parseDateTime(s: string | null): (Ymd & { time: string }) | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), time: m[4] };
}

const fmtDate = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`;
const fmtDateTime = (p: Ymd & { time: string }) => `${fmtDate(p)}T${p.time}`;

/**
 * 그 해에 실제로 있는 날인가. **2월 29일 때문에 필요하다.**
 * 윤년이 아닌 해로 옮기면 `2027-02-29` 같은 없는 날이 만들어진다.
 */
function exists({ y, m, d }: Ymd): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 요일. `Date.UTC` 로 만들어 시간대에 흔들리지 않는다. */
export function weekdayOf(date: string): string | null {
  const p = parseDate(date);
  if (!p || !exists(p)) return null;
  return WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

/** "토요일"·"토"·"(토)" 를 "토" 로. 알 수 없으면 `null`. */
export function normalizeWeekday(raw: string | null): string | null {
  if (!raw) return null;
  for (const w of WEEKDAYS) if (raw.includes(w)) return w;
  return null;
}

/**
 * 월·일만. **연도를 일부러 받지 않는다.**
 *
 * 처음에 `Ymd` 를 그대로 넘겼다가 후보 연도가 원래 연도로 덮어써져서 날짜가 하나도
 * 안 움직였다. `tsc` 는 못 잡는다 — 변수를 넘길 때는 초과 속성 검사를 하지 않는다.
 * 그래서 타입으로 막는다.
 */
type MonthDay = { m: number; d: number };

/** 월·일을 고정하고 **오늘 이후(오늘 포함) 가장 가까운** 해를 고른다. */
function nearestFutureYear(md: MonthDay, today: string): number {
  const startYear = Number(today.slice(0, 4));
  for (let y = startYear; y <= startYear + 8; y++) {
    const cand = { ...md, y };
    if (!exists(cand)) continue; // 2/29 는 윤년까지 건너뛴다
    if (fmtDate(cand) >= today) return y;
  }
  return startYear;
}

/** 월·일을 고정하고 **기준보다 늦지 않은** 가장 가까운 해를 고른다. */
function nearestYearAtOrBefore(
  md: MonthDay & { time: string },
  bound: string,
  boundYear: number
): number {
  for (let y = boundYear; y >= boundYear - 8; y--) {
    const cand = { ...md, y };
    if (!exists(cand)) continue;
    if (fmtDateTime(cand) <= bound) return y;
  }
  return boundYear;
}

/**
 * 연도를 정한다. `today` 는 KST 기준 `yyyy-MM-dd`.
 *
 * 순서가 중요하다 — 활동 날짜를 먼저 정하고, 신청 기간은 **그 날짜를 기준으로**
 * 거꾸로 잡는다. 신청이 활동보다 늦게 해석되면 접수가 열리기 전에 활동이 끝난
 * 글이 되고, 교사는 왜 신청 버튼이 안 보이는지 알 수 없다.
 */
export function resolveAiYears(ai: AiDateInput, today: string): ResolvedDates {
  const out: ResolvedDates = {
    date: ai.date,
    endDate: ai.endDate,
    applyStart: ai.applyStart,
    applyDeadline: ai.applyDeadline,
    weekdayMismatch: false,
  };

  const date = parseDate(ai.date);

  // ── 활동 날짜 ──
  // `dateHasYear` 가 `null`(모델이 답하지 않음)이면 손대지 않는다. 모르는 채로
  // 옮기면, 연도가 적혀 있던 날짜를 멋대로 미래로 밀 수 있다.
  if (date && ai.dateHasYear === false) {
    const y = nearestFutureYear({ m: date.m, d: date.d }, today);
    out.date = fmtDate({ y, m: date.m, d: date.d });
  }

  // ── 종료 날짜 ──
  // **시작 기준으로 같은 해.** 연말을 넘기면(12/28~1/3) 다음 해로 넘긴다.
  const resolvedDate = parseDate(out.date);
  const endDate = parseDate(ai.endDate);
  if (resolvedDate && endDate && ai.dateHasYear === false) {
    let y = resolvedDate.y;
    let cand = { y, m: endDate.m, d: endDate.d };
    if (fmtDate(cand) < fmtDate(resolvedDate)) {
      y += 1;
      cand = { y, m: endDate.m, d: endDate.d };
    }
    if (exists(cand)) out.endDate = fmtDate(cand);
  }

  // ── 신청 기간 ──
  // 기준은 **활동 시작**이다. 시작 시각을 모르면 그날 끝(`23:59`)으로 둔다 —
  // 활동 당일 마감을 전년도로 밀어내지 않기 위해서다.
  if (ai.applyHasYear === false && resolvedDate) {
    const ref = `${fmtDate(resolvedDate)}T${ai.startTime ?? "23:59"}`;

    const deadline = parseDateTime(ai.applyDeadline);
    if (deadline) {
      const md = { m: deadline.m, d: deadline.d, time: deadline.time };
      const y = nearestYearAtOrBefore(md, ref, resolvedDate.y);
      out.applyDeadline = fmtDateTime({ ...md, y });
    }

    // 신청 시작은 **마감보다 늦지 않게.** 마감이 없으면 활동 시작이 기준이다.
    const start = parseDateTime(ai.applyStart);
    if (start) {
      const bound = out.applyDeadline ?? ref;
      const boundYear = Number(bound.slice(0, 4));
      const md = { m: start.m, d: start.d, time: start.time };
      const y = nearestYearAtOrBefore(md, bound, boundYear);
      out.applyStart = fmtDateTime({ ...md, y });
    }
  }

  // ── 요일 ──
  // 연도를 정한 **뒤에** 본다. 바꾸지는 않고 어긋났다는 사실만 돌려준다.
  const written = normalizeWeekday(ai.dateWeekday);
  if (written && out.date) {
    const actual = weekdayOf(out.date);
    if (actual && actual !== written) out.weekdayMismatch = true;
  }

  return out;
}

/** 요일이 어긋났을 때 화면에 띄우는 한 줄. 문구를 한 곳에 둔다. */
export const WEEKDAY_MISMATCH_NOTE = "원문의 요일과 달라요. 연도를 확인해 주세요.";

/**
 * KST 기준 지금. `datetime-local` 과 같은 `yyyy-MM-ddTHH:mm` 이라 **문자열끼리
 * 비교하면 된다.** `Date` 로 되돌리면 브라우저 시간대가 섞인다.
 */
export function nowInKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
