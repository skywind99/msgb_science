import { Link } from "wouter";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarClock, MapPin, Users, ArrowRight, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { usePosts } from "@/hooks/use-posts";
import { activityStage, applyClosesAt } from "@/components/ActivityInfo";
import { type PublicPost } from "@shared/schema";

/**
 * 홈 상단 "신청 마감 임박 활동".
 *
 * 학생이 홈에 들어와서 가장 먼저 알아야 하는 것은 놓치면 안 되는 마감이다.
 * 신청을 받는 중인 활동만, 마감이 빠른 순으로 최대 3건 보여준다.
 * 보여줄 활동이 없으면 영역 자체가 사라진다.
 */
export function upcomingActivities(posts: PublicPost[], limit = 3): PublicPost[] {
  const now = new Date();
  return posts
    .filter((p) => p.applyEnabled && activityStage(p, now) === "open")
    .sort((a, b) => {
      // 마감이 없는 활동은 뒤로 보낸다
      const ac = applyClosesAt(a)?.getTime() ?? Infinity;
      const bc = applyClosesAt(b)?.getTime() ?? Infinity;
      return ac - bc;
    })
    .slice(0, limit);
}

function DeadlineChip({ post }: { post: PublicPost }) {
  const closes = applyClosesAt(post);
  if (!closes) return null;

  const days = Math.floor((closes.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const urgent = days <= 2;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
        urgent ? "bg-rose-100 text-rose-700" : "bg-primary/10 text-primary"
      }`}
    >
      <Timer className="w-3 h-3" />
      {days <= 0 ? "오늘 마감" : `마감 D-${days}`}
    </span>
  );
}

export function UpcomingActivities() {
  const { data: posts, isLoading } = usePosts();
  if (isLoading) return null;

  const items = upcomingActivities(posts ?? []);
  if (items.length === 0) return null;

  return (
    <section className="py-14 bg-white border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">신청 마감 임박 활동</h2>
            <p className="text-sm text-muted-foreground">지금 신청할 수 있는 활동입니다.</p>
          </div>
          <Link
            href="/schedule"
            className="hidden sm:flex items-center gap-1 text-primary font-bold text-sm hover:gap-2 transition-all"
          >
            전체 일정 보기 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((post, idx) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
            >
              <Link
                href={`/posts/${post.id}`}
                className="group flex flex-col h-full p-5 rounded-2xl border-2 border-primary/15 bg-primary/[0.02] hover:border-primary/40 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <DeadlineChip post={post} />
                  {post.capacity != null && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Users className="w-3 h-3" /> {post.capacity}명
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 mb-3 group-hover:text-primary transition-colors">
                  {post.title}
                </h3>

                <div className="mt-auto space-y-1.5 text-xs text-muted-foreground">
                  {post.eventStart && (
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-primary" />
                      {format(new Date(post.eventStart), "M월 d일 (E) HH:mm", { locale: ko })}
                    </div>
                  )}
                  {post.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      {post.location}
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
