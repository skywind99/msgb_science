import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, BookOpen, FlaskConical, Users, Globe, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { usePosts } from "@/hooks/use-posts";
import { PostCard, PostCardSkeleton } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { UpcomingActivities } from "@/components/UpcomingActivities";
import { useAdmin } from "@/contexts/admin";
import { useCategories } from "@/hooks/use-categories";
import { useHomeView } from "@/hooks/use-home-view";
import { ViewSwitcher } from "@/components/home/ViewSwitcher";
import { BoardView } from "@/components/home/BoardView";
import { NewsBig } from "@/components/home/NewsBig";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useCallback } from "react";

const FEATURES = [
  { title: "첨단 과학실", desc: "최신 기자재를 갖춘 융합 과학 실험실", icon: FlaskConical, color: "bg-blue-100 text-blue-600", href: "/lab" },
  { title: "창의융합과정", desc: "미래 사회를 주도할 융합형 인재 양성", icon: BookOpen, color: "bg-indigo-100 text-indigo-600", href: "/career" },
  { title: "학생중심연구", desc: "스스로 탐구하고 문제를 해결하는 프로젝트", icon: Users, color: "bg-sky-100 text-sky-600", href: "/student" },
  { title: "지역연계활동", desc: "마을 교육 공동체와 함께하는 과학 나눔", icon: Globe, color: "bg-cyan-100 text-cyan-600", href: "/community" },
];

interface ScienceNewsItem {
  title: string;
  summary: string;
  imageUrl: string | null;
  link: string;
  date: string;
}

/**
 * 기사 이미지가 없을 때 쓰는 **단색 블록**.
 *
 * 예전에는 제목 키워드로 Unsplash 사진을 골랐다(`getFallbackImage`). 그게
 * "뉴스 이미지가 기사 내용과 안 맞는다" 는 제보의 한 원인이었다 — 말라리아
 * 기사에 실험실 사진이, 심해 기사에 바다 스톡 사진이 붙었다. **관계없는 사진은
 * 없는 것보다 나쁘다.** 읽는 사람은 그게 그 기사의 사진이라고 믿는다.
 *
 * 학교 파랑(`--primary`, `hsl(221 83% 53%)`)의 단색 SVG 다. 그 위에 이미 있는
 * "사이언스타임즈" 라벨이 얹히므로, 이미지가 없다는 사실이 그대로 보인다.
 * `<img src>` 에 그대로 넣을 수 있어 구조를 바꾸지 않는다.
 */
const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" preserveAspectRatio="none">' +
      '<rect width="16" height="9" fill="hsl(221 83% 53%)"/></svg>'
  );

function useScienceNews() {
  const [newsList, setNewsList] = useState<ScienceNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/science-news")
      .then((r) => r.json())
      .then((data: ScienceNewsItem[]) => {
        setNewsList(Array.isArray(data) ? data : [data]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { newsList, loading };
}

function NewsSlider({ newsList }: { newsList: ScienceNewsItem[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const prev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => (i - 1 + newsList.length) % newsList.length);
  }, [newsList.length]);

  const next = useCallback(() => {
    setDirection(1);
    setIndex((i) => (i + 1) % newsList.length);
  }, [newsList.length]);

  // 8초마다 자동 슬라이드
  useEffect(() => {
    if (newsList.length <= 1) return;
    const timer = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % newsList.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [newsList.length]);

  const news = newsList[index];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <div className="relative w-full lg:w-[340px] shrink-0">
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-md bg-white">
        <AnimatePresence custom={direction} mode="wait">
          <motion.a
            key={index}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            href={news.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            {/* 썸네일: 원본 이미지 우선, 없거나 실패하면 학교 파랑 단색.
                예전에는 제목 키워드로 Unsplash 사진을 골랐다 — 관계없는 사진이
                붙어서 기사 내용과 안 맞는다는 제보가 있었다. */}
            <div className="relative h-48 w-full overflow-hidden">
              <img
                src={news.imageUrl ?? NO_IMAGE}
                alt={news.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (img.src !== NO_IMAGE) img.src = NO_IMAGE;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

              {/* 출처 뱃지 */}
              <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                사이언스타임즈
              </div>

              {/* 인디케이터 */}
              {newsList.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {newsList.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.preventDefault();
                        setDirection(i > index ? 1 : -1);
                        setIndex(i);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === index ? "bg-white w-4" : "bg-white/50 w-1.5"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 본문 */}
            <div className="p-5">
              <h3 className="text-base font-bold text-foreground leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                {news.title}
              </h3>
              {news.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                  {news.summary}
                </p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">{news.date}</span>
                <span className="text-xs font-bold text-primary flex items-center gap-1">
                  기사 읽기 <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          </motion.a>
        </AnimatePresence>
      </div>

      {/* 화살표 버튼 */}
      {newsList.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-24 -translate-y-1/2 z-10 bg-white/80 hover:bg-white border border-border rounded-full w-8 h-8 flex items-center justify-center shadow-sm hover:shadow-md transition-all"
            aria-label="이전 기사"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-24 -translate-y-1/2 z-10 bg-white/80 hover:bg-white border border-border rounded-full w-8 h-8 flex items-center justify-center shadow-sm hover:shadow-md transition-all"
            aria-label="다음 기사"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const { data: posts, isLoading } = usePosts("home");
  const { isAdmin } = useAdmin();
  const { newsList, loading: newsLoading } = useScienceNews();
  /**
   * 숨긴 게시판으로 가는 버튼을 감춘다.
   *
   * 버튼의 글귀("과학실 둘러보기")는 게시판 이름이 아니라 **문구**라 그대로 둔다.
   * 다만 그 게시판을 숨겼으면 눌러도 "준비 중" 이 나오므로 버튼 자체를 감춘다 —
   * 막다른 길을 남기지 않는다.
   */
  const { visible, routeOf } = useCategories();
  const canGo = (id: string) => visible.some((c) => c.id === id);

  /**
   * 보기 모드. 기본값은 "기본" 이고, 그 모드에서는 **아래 네 섹션이 지금과 똑같이**
   * 그려진다 — 감싸는 조건문만 추가했고 안쪽은 한 줄도 고치지 않았다.
   */
  const { mode, setMode, perPage, setPerPage } = useHomeView();
  const { toast } = useToast();

  return (
    <div className="min-h-screen pb-20">
      {/* 보기 전환 — 히어로 **위**. 높이 44px, margin 없음.
          그래서 기본 모드에서 아래 내용이 밀리는 양이 정확히 44px 이다. */}
      <ViewSwitcher
        mode={mode}
        onChange={setMode}
        /* TV 는 별도 라우트(PR 2)다. 아직 없으니 누르면 안내만 한다 —
           빈 화면이나 404 를 보여주면 고장으로 보인다. */
        pending={["tv"]}
        onPending={(label) =>
          toast({
            title: `${label} 화면은 준비 중이에요.`,
            description: "곧 열립니다. 지금은 기본과 카드보드를 쓸 수 있어요.",
          })
        }
      />

      {mode === "board" && <BoardView perPage={perPage} onPerPageChange={setPerPage} />}
      {mode === "news" && <NewsBig />}

      {mode === "default" && (<>
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-blue-50/50 -z-10" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* 왼쪽: 히어로 텍스트 */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex-1"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6 border border-primary/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                2026학년도 과학중점학교 지정
              </div>

              <h1 className="text-5xl lg:text-7xl font-black text-foreground tracking-tight leading-[1.1] mb-6">
                미래를 선도하는 <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                  창의융합 인재 육성
                </span>
              </h1>

              <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl">
                미사강변고등학교 과학중점과정은 깊이 있는 탐구와 실험 중심의
                교육으로 4차 산업혁명 시대를 이끌어갈 글로벌 리더를 키웁니다.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                {canGo("lab_intro") && (
                  <Link
                    href={routeOf("lab_intro")}
                    className="px-8 py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
                  >
                    과학실 둘러보기
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                )}
                {canGo("science_class") && (
                  <Link
                    href={routeOf("science_class")}
                    className="px-8 py-4 rounded-xl font-bold bg-white text-foreground border-2 border-border shadow-sm hover:border-primary/30 hover:bg-primary/5 hover:-translate-y-1 transition-all duration-300"
                  >
                    교육과정 안내
                  </Link>
                )}
              </div>
            </motion.div>

            {/* 오른쪽: 슬라이딩 뉴스 카드 */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
              className="w-full lg:w-[340px] shrink-0"
            >
              {newsLoading ? (
                <div className="bg-white rounded-2xl border border-border shadow-md overflow-hidden animate-pulse">
                  <div className="h-48 bg-muted" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 bg-muted rounded" />
                    <div className="h-5 w-4/5 bg-muted rounded" />
                    <div className="h-3 bg-muted rounded" />
                    <div className="h-3 w-3/4 bg-muted rounded" />
                  </div>
                </div>
              ) : newsList.length > 0 ? (
                <NewsSlider newsList={newsList} />
              ) : null}
            </motion.div>

          </div>
        </div>
      </section>

      {/* 신청 마감 임박 활동 — 없으면 스스로 사라진다 */}
      <UpcomingActivities />

      {/* Features Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((feature, idx) => (
              <Link key={feature.title} href={feature.href}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-8 rounded-3xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer h-full"
                  data-testid={`button-feature-${idx}`}
                >
                  <div className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Posts Section */}
      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2">학교 새소식</h2>
              <p className="text-muted-foreground">과학중점학교의 생생한 활동 현장을 전해드립니다.</p>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && <CreatePostDialog category="home" categoryLabel="학교 새소식" />}
              {canGo("science_class") && (
                <Link
                  href={routeOf("science_class")}
                  className="hidden sm:flex items-center gap-1 text-primary font-bold hover:gap-2 transition-all"
                >
                  모든 소식 보기 <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => <PostCardSkeleton key={i} />)
            ) : posts && posts.length > 0 ? (
              posts.slice(0, 3).map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-border">
                <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">아직 등록된 소식이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </section>
      </>)}
    </div>
  );
}
