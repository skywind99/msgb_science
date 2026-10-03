/**
 * 활동 신청 기간 판정.
 *
 * 클라이언트(배지·버튼 표시)와 서버(신청 접수 거부)가 같은 규칙을 써야 한다.
 * 화면에는 "신청 받는 중"으로 보이는데 서버가 거부하면 학생이 이유를 알 수 없다.
 * 그래서 여기 한 곳에만 두고 양쪽에서 가져다 쓴다.
 */

export type ActivityStage = "before" | "open" | "closed" | "ended";

/** 날짜 필드는 DB 에서는 Date, JSON 을 건너오면 문자열이다. 둘 다 받는다. */
export type ActivityTiming = {
  applyEnabled?: boolean | null;
  eventStart?: Date | string | null;
  eventEnd?: Date | string | null;
  applyStart?: Date | string | null;
  applyDeadline?: Date | string | null;
};

export function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 신청 마감 시각. 따로 정하지 않았으면 활동 시작이 마감이다. */
export function applyClosesAt(post: ActivityTiming): Date | null {
  return toDate(post.applyDeadline) ?? toDate(post.eventStart);
}

/** 활동이 끝나는 시각. 종료를 비워 두면 시작 시각을 끝으로 본다. */
export function activityEndsAt(post: ActivityTiming): Date | null {
  return toDate(post.eventEnd) ?? toDate(post.eventStart);
}

export function activityStage(post: ActivityTiming, now = new Date()): ActivityStage {
  const finish = activityEndsAt(post);
  if (finish && now > finish) return "ended";

  const opens = toDate(post.applyStart);
  if (opens && now < opens) return "before";

  const closes = applyClosesAt(post);
  if (closes && now > closes) return "closed";

  return "open";
}

/** 단계별 거절 문구. 서버가 신청을 거부할 때와 화면 안내에 같은 말을 쓴다. */
export const STAGE_REJECT_MESSAGE: Record<Exclude<ActivityStage, "open">, string> = {
  before: "아직 신청 기간이 아닙니다.",
  closed: "신청이 마감되었습니다.",
  ended: "이미 종료된 활동입니다.",
};

/**
 * KST 기준 오늘 날짜 (yyyy-MM-dd).
 *
 * **서버와 브라우저가 같은 기준을 써야 한다.** 서버(Vercel 함수)는 UTC 라
 * 밤이면 날짜가 하루 어긋나고, 브라우저는 보통 KST 지만 여행 중이거나
 * 설정이 다르면 또 달라진다. 양쪽 다 여기로 통일한다.
 *
 * 쓰는 곳: AI 에게 "연도 없는 날짜의 기준" 을 알려줄 때, 그리고 입력한 활동
 * 날짜가 이미 지났는지 볼 때.
 */
export function todayInKst(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
