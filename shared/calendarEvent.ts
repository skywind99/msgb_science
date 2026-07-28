import { applyClosesAt } from "./activity.js";

/**
 * 활동 → 캘린더 일정 정보.
 *
 * 서버(.ics 생성, 구글 링크)와 클라이언트(안드로이드 인텐트)가 모두 쓴다.
 * 여기 있는 이유: 안드로이드 인텐트 주소는 **클라이언트가 만들어야 한다.**
 * 크롬이 서버 리다이렉트를 통한 `intent://` 이동을 차단하기 때문에 사용자가 직접
 * 누른 링크의 `href` 여야 한다. 그렇다고 설명 문구를 양쪽에 복붙하면 갈라지므로
 * 이 모듈 하나만 보게 한다.
 */

/** 게시물에서 캘린더에 필요한 부분만. `Post` 와 `PublicPost` 둘 다 들어맞는다. */
export type CalendarSource = {
  id: number;
  title: string;
  applyEnabled?: boolean | null;
  eventStart?: Date | string | null;
  eventEnd?: Date | string | null;
  location?: string | null;
  capacity?: number | null;
  applyNote?: string | null;
  applyDeadline?: Date | string | null;
};

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location: string | null;
  description: string;
  url: string;
  /** 시작 기준 알림. `-P1D` = 1일 전, `-PT1H` = 1시간 전 */
  alarms: string[];
};

/**
 * 활동 종료가 비어 있을 때 기본 길이.
 * 길이가 0인 일정은 캘린더에서 알아보기 어려워서 한 시간으로 둔다.
 */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** `2026년 10월 1일 17:00`. 학생이 읽는 값이라 기본 로캘 표기보다 다듬는다. */
export function formatKst(date: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}년 ${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")}`;
}

/** 활동 일시가 없으면 캘린더에 담을 것이 없으므로 null. */
export function toCalendarEvent(post: CalendarSource, origin: string): CalendarEvent | null {
  if (!post.eventStart) return null;

  const start = new Date(post.eventStart);
  if (Number.isNaN(start.getTime())) return null;

  const rawEnd = post.eventEnd ? new Date(post.eventEnd) : null;
  const end =
    rawEnd && !Number.isNaN(rawEnd.getTime())
      ? rawEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const url = `${origin}/posts/${post.id}`;
  const lines: string[] = [];
  const closes = applyClosesAt(post);
  if (post.applyEnabled && closes) lines.push(`신청 마감: ${formatKst(closes)}`);
  if (post.capacity != null) lines.push(`정원: ${post.capacity}명`);
  if (post.applyNote) lines.push(`준비물·유의사항: ${post.applyNote}`);
  lines.push(url);

  return {
    // UID 가 같으면 다시 담아도 새 일정이 생기지 않고 기존 것이 갱신된다.
    uid: `activity-${post.id}@msgb-science`,
    start,
    end,
    summary: post.title,
    location: post.location ?? null,
    description: lines.join("\n"),
    url,
    // 하루 전과 한 시간 전. 활동이 내일 이내면 하루 전 시각이 이미 지나가서
    // 울리지 않으므로 짧은 쪽을 하나 더 둔다.
    alarms: ["-P1D", "-PT1H"],
  };
}

/**
 * 안드로이드 캘린더 앱을 여는 주소.
 *
 * 크롬이 `.ics` 를 캘린더로 넘기지 않고 다운로드해 버리고, 구글 캘린더 웹 주소는
 * 앱이 아니라 브라우저에서 열린다. `intent://` 는 시스템의 "일정 추가" 화면을 직접
 * 부르므로 구글 캘린더든 삼성 캘린더든 **기본 앱이 열린다.**
 *
 * `package` 를 지정하지 않는다. 구글 캘린더로 못박으면 삼성 캘린더만 쓰는 학생이 막힌다.
 *
 * **서버 302 로는 쓸 수 없다.** 크롬이 리다이렉트를 통한 `intent://` 이동을 막는다.
 * 사용자가 직접 누른 링크의 `href` 여야 한다.
 *
 * 값에 세미콜론이 섞이면 인텐트 파싱이 깨지므로 전부 인코딩한다.
 * 인텐트를 못 받는 브라우저를 위해 `browser_fallback_url` 을 넣는다.
 */
export function androidIntentUrl(event: CalendarEvent, fallbackUrl: string): string {
  const enc = encodeURIComponent;
  const parts = [
    "intent://#Intent",
    "action=android.intent.action.INSERT",
    "type=vnd.android.cursor.dir/event",
    `l.beginTime=${event.start.getTime()}`,
    `l.endTime=${event.end.getTime()}`,
    `S.title=${enc(event.summary)}`,
  ];
  if (event.location) parts.push(`S.eventLocation=${enc(event.location)}`);
  if (event.description) parts.push(`S.description=${enc(event.description)}`);
  parts.push(`S.browser_fallback_url=${enc(fallbackUrl)}`);
  parts.push("end");
  return parts.join(";");
}
