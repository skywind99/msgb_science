import type { CalendarEvent } from "../shared/calendarEvent.js";

/**
 * iCalendar(.ics) 직렬화. RFC 5545.
 *
 * 일정 내용을 만드는 일은 `shared/calendarEvent.ts` 가 한다 (클라이언트도 써야 해서).
 * 여기는 그것을 .ics 형식과 구글 주소로 바꾸는 일만 한다.
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
 * 안드로이드에서는 `intent://` 로 앱을 여는 것이 먼저이고
 * (`shared/calendarEvent.ts`), 이 주소는 그게 안 될 때의 대비책이다.
 * 앱이 아니라 브라우저에서 열리고, **알림 시각을 지정할 수 없다** —
 * 구글의 TEMPLATE 주소에는 알림 항목이 없어서 사용자 기본값(보통 30분 전)이 붙는다.
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
