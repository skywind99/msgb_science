import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Users, Timer, Lock, Info, ClipboardCheck, Search } from "lucide-react";
import { type ApplicationSummary, type PublicPost } from "@shared/schema";
import {
  activityStage,
  applyClosesAt,
  toDate,
  type ActivityStage as Stage,
} from "@shared/activity";
import { AddToCalendarLink, ApplyDialog, LookupDialog } from "@/components/ApplyDialog";

/**
 * 게시물 상세 상단의 활동 정보 + 신청 버튼.
 *
 * 단계 판정(신청 받는 중 / 마감 등)은 `shared/activity.ts` 에 있다.
 * 서버가 신청을 받아줄지 판단할 때 같은 함수를 쓴다. 규칙이 갈라지면
 * 화면에는 "신청 받는 중"인데 서버가 거부하는 상황이 된다.
 */

const STAGE_STYLE: Record<Stage, { label: string; className: string }> = {
  before: { label: "신청 예정", className: "bg-amber-100 text-amber-800 border-amber-200" },
  open: { label: "신청 받는 중", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  closed: { label: "신청 마감", className: "bg-muted text-muted-foreground border-border" },
  ended: { label: "종료된 활동", className: "bg-muted text-muted-foreground border-border" },
};

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
  const [dialog, setDialog] = useState<"apply" | "lookup" | null>(null);

  // 신청 현황(집계)만 받는다. 명단은 교사용 화면에서만 볼 수 있다.
  // 남은 자리는 다른 학생의 신청으로 계속 바뀌므로 캐시를 짧게 잡는다.
  const { data: summary } = useQuery<ApplicationSummary>({
    queryKey: ["/api/posts", post.id, "applications", "summary"],
    enabled: post.applyEnabled,
    staleTime: 30_000,
  });

  if (!post.applyEnabled) return null;

  const now = new Date();
  const stage = activityStage(post, now);
  const badge = STAGE_STYLE[stage];

  const start = toDate(post.eventStart);
  const end = toDate(post.eventEnd);
  const closes = applyClosesAt(post);
  const opens = toDate(post.applyStart);
  const remaining = stage === "open" && closes ? remainingText(closes, now) : null;

  // 정원이 있는데 다 찼고 대기자도 받지 않으면 신청 버튼을 눌러도 거부된다.
  const full =
    summary != null && summary.remaining === 0 && !post.allowWaitlist;

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
          {post.capacity == null ? (
            <>
              제한 없음
              {summary && summary.applied > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  (현재 {summary.applied}명 신청)
                </span>
              )}
            </>
          ) : (
            <>
              {summary ? `${summary.applied} / ${post.capacity}명` : `${post.capacity}명`}
              {summary && (
                <span
                  className={`ml-1.5 text-xs font-bold ${
                    summary.remaining === 0 ? "text-destructive" : "text-primary"
                  }`}
                >
                  {summary.remaining === 0 ? "정원 마감" : `${summary.remaining}자리 남음`}
                </span>
              )}
              {post.allowWaitlist && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  (마감 시 대기자 등록{summary && summary.waitlisted > 0 && `, 대기 ${summary.waitlisted}명`})
                </span>
              )}
            </>
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

      <div className="pt-3 border-t border-primary/15 space-y-2">
        {stage === "open" && !full ? (
          <button
            type="button"
            onClick={() => setDialog("apply")}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            {summary && summary.remaining === 0 ? "대기자로 신청하기" : "신청하기"}
          </button>
        ) : (
          <p className="text-sm font-semibold text-center text-muted-foreground py-2">
            {full
              ? "정원이 모두 찼습니다. 담당 선생님께 문의해 주세요."
              : stage === "before"
                ? "아직 신청 기간이 아닙니다."
                : stage === "closed"
                  ? "신청이 마감되었습니다."
                  : "종료된 활동입니다."}
          </p>
        )}

        {/* 캘린더 담기는 신청과 무관하다. 일정만 챙기고 싶은 학생도 있고,
            종료된 활동이면 담을 이유가 없으므로 그때만 감춘다. */}
        {post.eventStart && stage !== "ended" && <AddToCalendarLink post={post} />}

        {/* 취소·조회는 마감 뒤에도 열어둔다. 신청 여부를 확인할 방법이 필요하다. */}
        <button
          type="button"
          onClick={() => setDialog("lookup")}
          className="w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Search className="w-3.5 h-3.5" />
          확인 비밀번호로 내 신청 조회 · 취소
        </button>
      </div>

      {dialog === "apply" && <ApplyDialog post={post} onClose={() => setDialog(null)} />}
      {dialog === "lookup" && <LookupDialog post={post} onClose={() => setDialog(null)} />}
    </section>
  );
}
