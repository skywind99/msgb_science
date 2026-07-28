import type { Post } from "../shared/schema.js";
import { applyClosesAt } from "../shared/activity.js";

/**
 * iCalendar(.ics) 생성. RFC 5545.
 *
 * 알림을 우리가 보내는 게 아니다. 이 파일을 폰 캘린더에 담으면 그 다음부터는
 * **폰이 스스로 알림을 띄운다.** 서버는 텍스트만 내려주고 관여하지 않는다.
 * 웹푸시를 쓰지 않기로 한 이유는 CLAUDE.md 참고 (iOS 는 홈 화면 추가 시에만 동작).
 *
 * 형식 규칙이 까다로워서 한곳에 모았다. 직접 문자열을 이어 붙이지 말 것.
 * - 줄 끝은 반드시 CRLF. LF 만 쓰면 일부 캘린더가 통째로 거부한다.
 * - 한 줄은 75옥텟 이하. 넘으면 접어야 한다(다음 줄을 공백으로 시작).
 * - `\` `;` `,` 는 이스케이프, 줄바꿈은 `\n` 문자열로.
 */

/** 텍스트 값 이스케이프. 순서가 중요하다 — 역슬래시를 가장 먼저 처리한다. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * 75옥텟 단위 줄 접기.
 *
 * 한글은 UTF-8 로 글자당 3바이트라 제목 몇 글자만 있어도 75옥텟을 넘는다.
 * **글자 중간에서 자르면 안 된다** — 깨진 바이트가 나오면 파싱이 실패한다.
 * 그래서 바이트 길이를 세면서 글자 단위로 끊는다.
 */
function foldLine(line: string): string {
  const LIMIT = 75;
  const out: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
        const size = Buffer.byteLength(char, "utf8");
    // 이어지는 줄은 앞에 공백 한 칸이 붙으므로 그만큼 여유를 둔다.
    const limit = out.length === 0 ? LIMIT : LIMIT - 1;
    if (bytes + size > limit) {
      out.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);

  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

/** Date → `20261001T080000Z`. DB 가 UTC 를 담고 있으므로 UTC 로 그대로 쓴다. */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  /** 활동 페이지 주소. 캘린더가 링크로 보여준다. */
  url?: string | null;
  /** 시작 기준 알림 시각. `-P1D` = 1일 전, `-PT1H` = 1시간 전 */
  alarms?: string[];
};

/** `2026년 10월 1일 17:00`. 학생이 읽는 값이라 기본 로캘 표기보다 다듬는다. */
function formatKst(date: Date): string {
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

/**
 * 활동 종료가 비어 있을 때 기본 길이.
 * 길이가 0인 일정은 캘린더에서 알아보기 어려워서 한 시간으로 둔다.
 */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * 게시물 → 캘린더 이벤트.
 * 활동 일시가 없으면 캘린더에 담을 것이 없으므로 null.
 */
export function postToEvent(post: Post, origin: string): CalendarEvent | null {
  if (!post.eventStart) return null;

  const start = new Date(post.eventStart);
  const end = post.eventEnd
    ? new Date(post.eventEnd)
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
    location: post.location,
    description: lines.join("\n"),
    url,
    // 하루 전과 한 시간 전. 하루 전 알림은 활동이 내일 이내면 이미 지나가서
    // 울리지 않으므로, 짧은 쪽을 하나 더 둔다.
    alarms: ["-P1D", "-PT1H"],
  };
}

/**
 * 이벤트 목록 → .ics 본문.
 *
 * `METHOD` 는 넣지 않는다. `METHOD:PUBLISH` 를 붙이면 일부 클라이언트가 초대장으로
 * 취급해 참석 여부를 묻는다. 여기서는 그냥 일정으로 담기기를 원한다.
 */
export function buildCalendar(events: CalendarEvent[], now = new Date()): string {
  const stamp = toIcsUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//msgb-science//activities//KO",
    "CALSCALE:GREGORIAN",
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(e.start)}`,
      `DTEND:${toIcsUtc(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    // URL 은 값 자체가 주소라 이스케이프하지 않는다. 캘린더가 링크로 보여준다.
    if (e.url) lines.push(`URL:${e.url}`);

    for (const trigger of e.alarms ?? []) {
      lines.push(
        "BEGIN:VALARM",
        `TRIGGER:${trigger}`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(e.summary)}`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // 줄을 접은 뒤 CRLF 로 잇고, 마지막에도 CRLF 를 붙인다.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * 구글 캘린더 일정 추가 주소.
 *
 * 왜 필요한가: **안드로이드 크롬은 `.ics` 를 캘린더로 넘기지 않고 다운로드한다.**
 * `text/calendar` 를 렌더할 수 없어서 무조건 파일로 내려받고, 학생이 파일을 찾아
 * 앱을 골라야 한다. `Content-Disposition` 을 바꿔도 달라지지 않는다.
 * 반면 이 주소는 웹 링크라 캘린더 앱이 바로 열리며 일정이 미리 채워진다.
 *
 * **대가: 알림 시각을 지정할 수 없다.** 구글의 TEMPLATE 주소에는 알림 항목이 없어서
 * 사용자의 기본 알림(보통 30분 전)이 적용된다. `.ics` 의 하루 전 알림은 사라진다.
 * 그래서 둘 중 하나를 없애지 말고 기기에 맞춰 함께 제공한다.
 */
export function eventToGoogleUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.summary,
    dates: `${toIcsUtc(e.start)}/${toIcsUtc(e.end)}`,
  });
  if (e.description) params.set("details", e.description);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * 내려받기 파일명.
 *
 * 한글 파일명은 `filename=` 에 그대로 넣을 수 없다(헤더는 latin1 만 담는다).
 * RFC 5987 의 `filename*` 로 UTF-8 을 싣고, 못 읽는 클라이언트를 위해
 * ASCII 이름을 함께 준다.
 */
export function contentDisposition(title: string, fallback: string): string {
  const safe = title.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 60);
  const encoded = encodeURIComponent(`${safe}.ics`);
  return `attachment; filename="${fallback}.ics"; filename*=UTF-8''${encoded}`;
}
