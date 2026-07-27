import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, MapPin, Users, Timer, Lock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { usePosts } from "@/hooks/use-posts";
import { activityStage, applyClosesAt } from "@shared/activity";
import { api } from "@shared/routes";
import { NAV_ITEMS } from "@/components/Navigation";
import { type ApplicationSummary, type PublicPost } from "@shared/schema";

/**
 * 활동 일정.
 *
 * 카테고리별로 흩어진 활동을 날짜순 한 줄로 모아 본다.
 * 기본은 "다가오는 활동"만 보여주고, 지난 활동은 따로 펼쳐서 본다.
 */

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.id, n.label])
);

const STAGE_STYLE: Record<string, { label: string; className: string }> = {
  before: { label: "신청 예정", className: "bg-amber-100 text-amber-800" },
  open: { label: "신청 받는 중", className: "bg-emerald-100 text-emerald-800" },
  closed: { label: "신청 마감", className: "bg-muted text-muted-foreground" },
  ended: { label: "종료", className: "bg-muted text-muted-foreground" },
};

const startOf = (p: PublicPost) => (p.eventStart ? new Date(p.eventStart) : null);

function ActivityRow({ post, summary }: { post: PublicPost; summary?: ApplicationSummary }) {
  const start = startOf(post);
  const end = post.eventEnd ? new Date(post.eventEnd) : null;
  const closes = applyClosesAt(post);
  const stage = activityStage(post);
  const badge = STAGE_STYLE[stage];

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex items-stretch gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
    >
      {/* 날짜 블록 */}
      <div className="shrink-0 w-16 flex flex-col items-center justify-center rounded-xl bg-primary/5 border border-primary/10 py-2">
        {start ? (
          <>
            <span className="text-[11px] font-bold text-primary">
              {format(start, "M월", { locale: ko })}
            </span>
            <span className="text-2xl font-black leading-none text-foreground">
              {format(start, "d")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {format(start, "EEE", { locale: ko })}
            </span>
          </>
        ) : (
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {CATEGORY_LABELS[post.category] ?? post.category}
          </span>
          {post.hasApplyPassword && <Lock className="w-3 h-3 text-muted-foreground" />}
        </div>

        <h3 className="text-base font-bold text-foreground leading-snug line-clamp-1 group-hover:text-primary transition-colors">
          {post.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
          {start && (
            <span>
              {format(start, "HH:mm")}
              {end && ` ~ ${format(end, isSameDay(start, end) ? "HH:mm" : "M월 d일 HH:mm")}`}
            </span>
          )}
          {post.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {post.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {post.capacity == null
              ? summary && summary.applied > 0
                ? `${summary.applied}명 신청`
                : "제한 없음"
              : summary
                ? `${summary.applied} / ${post.capacity}명`
                : `${post.capacity}명`}
            {summary && post.capacity != null && stage === "open" && (
              <span
                className={`font-bold ${
                  summary.remaining === 0 ? "text-destructive" : "text-primary"
                }`}
              >
                {summary.remaining === 0 ? "정원 마감" : `${summary.remaining}자리`}
              </span>
            )}
          </span>
          {stage === "open" && closes && (
            <span className="flex items-center gap-1 font-semibold text-primary">
              <Timer className="w-3 h-3" /> {format(closes, "M월 d일 HH:mm")} 마감
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="shrink-0 self-center w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </Link>
  );
}

export default function Schedule() {
  const { data: posts, isLoading } = usePosts();
  const [showPast, setShowPast] = useState(false);

  // 남은 자리는 활동마다 따로 묻지 않고 한 번에 받는다. 집계라 개인정보가 없다.
  const { data: summaries } = useQuery<ApplicationSummary[]>({
    queryKey: [api.applications.summaries.path],
    staleTime: 60_000,
  });
  const summaryByPost = useMemo(
    () => new Map((summaries ?? []).map((s) => [s.postId, s])),
    [summaries]
  );

  const { upcoming, past } = useMemo(() => {
    const activities = (posts ?? []).filter((p) => p.applyEnabled && p.eventStart);
    const now = new Date();
    const isPast = (p: PublicPost) => {
      const finish = p.eventEnd ? new Date(p.eventEnd) : startOf(p);
      return !!finish && finish < now;
    };
    const byStartAsc = (a: PublicPost, b: PublicPost) =>
      (startOf(a)?.getTime() ?? 0) - (startOf(b)?.getTime() ?? 0);

    return {
      upcoming: activities.filter((p) => !isPast(p)).sort(byStartAsc),
      // 지난 활동은 최근 것이 위로
      past: activities.filter(isPast).sort((a, b) => byStartAsc(b, a)),
    };
  }, [posts]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-br from-primary/8 via-background to-blue-50/40 border-b border-primary/10 pt-14 pb-10">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3">활동 일정</h1>
          <p className="text-muted-foreground">
            과학중점과정의 모든 활동을 날짜순으로 모았습니다.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        {isLoading ? (
          <div className="space-y-3">
            {Array(4)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
              ))}
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">
                다가오는 활동
                <span className="ml-1.5 font-normal text-muted-foreground">{upcoming.length}건</span>
              </h2>
              {upcoming.length > 0 ? (
                upcoming.map((post, idx) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx, 6) * 0.05 }}
                  >
                    <ActivityRow post={post} summary={summaryByPost.get(post.id)} />
                  </motion.div>
                ))
              ) : (
                <div className="py-14 text-center rounded-2xl border border-dashed border-border">
                  <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">예정된 활동이 없습니다.</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    새 활동이 등록되면 이곳에 표시됩니다.
                  </p>
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="space-y-3">
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  지난 활동 {past.length}건 {showPast ? "접기" : "보기"}
                </button>
                {showPast && (
                  <div className="space-y-3 opacity-70">
                    {past.map((post) => (
                      <ActivityRow key={post.id} post={post} summary={summaryByPost.get(post.id)} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
