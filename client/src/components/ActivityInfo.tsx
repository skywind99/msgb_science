import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarClock, MapPin, Users, Timer, Lock, Info } from "lucide-react";
import { type PublicPost } from "@shared/schema";

/**
 * 게시물 상세 상단의 활동 정보 요약.
 *
 * 신청 기능(3단계)이 붙기 전이라 아직 신청 버튼과 남은 자리는 없다.
 * 지금은 교사가 입력한 활동 정보가 학생에게 어떻게 보이는지를 담당한다.
 */

type Stage = "before" | "open" | "closed" | "ended";

const STAGE_STYLE: Record<Stage, { label: string; className: string }> = {
  before: { label: "신청 예정", className: "bg-amber-100 text-amber-800 border-amber-200" },
  open: { label: "신청 받는 중", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  closed: { label: "신청 마감", className: "bg-muted text-muted-foreground border-border" },
  ended: { label: "종료된 활동", className: "bg-muted text-muted-foreground border-border" },
};

const toDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 신청 마감 시각. 따로 정하지 않았으면 활동 시작이 마감이다. */
export function applyClosesAt(post: PublicPost): Date | null {
  return toDate(post.applyDeadline) ?? toDate(post.eventStart);
}

export function activityStage(post: PublicPost, now = new Date()): Stage {
  const finish = toDate(post.eventEnd) ?? toDate(post.eventStart);
  if (finish && now > finish) return "ended";

  const opens = toDate(post.applyStart);
  if (opens && now < opens) return "before";

  const closes = applyClosesAt(post);
  if (closes && now > closes) return "closed";

  return "open";
}

/** "3일 남음" 처럼 마감까지 남은 기간을 사람이 읽는 형태로 */
function remainingText(closes: Date, now: Date): string | null {
  const ms = closes.getTime() - now.getTime();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}분 남음`;
  if (hours < 48) return `${hours}시간 남음`;
  return `${Math.floor(hours / 24)}일 남음`;
}

function fmt(d: Date) {
  return format(d, "yyyy년 M월 d일 (E) HH:mm", { locale: ko });
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="text-sm font-medium text-foreground break-words">{children}</div>
      </div>
    </div>
  );
}

export function ActivityInfo({ post }: { post: PublicPost }) {
  if (!post.applyEnabled) return null;

  const now = new Date();
  const stage = activityStage(post, now);
  const badge = STAGE_STYLE[stage];

  const start = toDate(post.eventStart);
  const end = toDate(post.eventEnd);
  const closes = applyClosesAt(post);
  const opens = toDate(post.applyStart);
  const remaining = stage === "open" && closes ? remainingText(closes, now) : null;

  return (
    <section className="rounded-2xl border-2 border-primary/20 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-foreground">활동 정보</h2>
        <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {start && (
          <Row icon={<CalendarClock className="w-4 h-4" />} label="일시">
            {fmt(start)}
            {end && (
              <>
                {" ~ "}
                {/* 같은 날이면 시각만 보여준다 */}
                {start.toDateString() === end.toDateString()
                  ? format(end, "HH:mm")
                  : fmt(end)}
              </>
            )}
          </Row>
        )}

        {post.location && (
          <Row icon={<MapPin className="w-4 h-4" />} label="장소">
            {post.location}
          </Row>
        )}

        <Row icon={<Users className="w-4 h-4" />} label="정원">
          {post.capacity == null ? "제한 없음" : `${post.capacity}명`}
          {post.capacity != null && post.allowWaitlist && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              (정원 초과 시 대기자 등록)
            </span>
          )}
        </Row>

        <Row icon={<Timer className="w-4 h-4" />} label="신청 마감">
          {closes ? fmt(closes) : "마감 없음"}
          {remaining && (
            <span className="ml-1.5 text-xs font-bold text-primary">{remaining}</span>
          )}
        </Row>

        {stage === "before" && opens && (
          <Row icon={<Timer className="w-4 h-4" />} label="신청 시작">
            {fmt(opens)}
          </Row>
        )}
      </div>

      {post.applyNote && (
        <div className="flex gap-3 pt-3 border-t border-primary/15">
          <Info className="shrink-0 mt-0.5 w-4 h-4 text-primary" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted-foreground">준비물 · 유의사항</div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{post.applyNote}</p>
          </div>
        </div>
      )}

      {post.hasApplyPassword && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          신청할 때 담당 선생님이 알려주신 비밀번호가 필요합니다.
        </p>
      )}

      {/* 신청 폼은 3단계에서 붙는다. 그때까지는 안내만 한다. */}
      <p className="text-xs text-muted-foreground pt-1 border-t border-primary/15">
        온라인 신청 기능은 준비 중입니다. 우선 담당 선생님께 문의해 주세요.
      </p>
    </section>
  );
}
