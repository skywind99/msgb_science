import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, BookOpen, FlaskConical, Users, Globe } from "lucide-react";
import { usePosts } from "@/hooks/use-posts";
import { PostCard, PostCardSkeleton } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { useAdmin } from "@/contexts/admin";

const FEATURES = [
  {
    title: "첨단 과학실",
    desc: "최신 기자재를 갖춘 융합 과학 실험실",
    icon: FlaskConical,
    color: "bg-blue-100 text-blue-600",
    href: "/lab",
  },
  {
    title: "창의융합과정",
    desc: "미래 사회를 주도할 융합형 인재 양성",
    icon: BookOpen,
    color: "bg-indigo-100 text-indigo-600",
    href: "/career",
  },
  {
    title: "학생중심연구",
    desc: "스스로 탐구하고 문제를 해결하는 프로젝트",
    icon: Users,
    color: "bg-sky-100 text-sky-600",
    href: "/student",
  },
  {
    title: "지역연계활동",
    desc: "마을 교육 공동체와 함께하는 과학 나눔",
    icon: Globe,
    color: "bg-cyan-100 text-cyan-600",
    href: "/community",
  },
];

export default function Home() {
  const { data: posts, isLoading } = usePosts("home");
  const { isAdmin } = useAdmin();

  return (
    <div className="min-h-screen pb-20">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden">
        {/* Background gradient & pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-blue-50/50 -z-10" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay -z-10" />

        {/* landing page hero scenic laboratory */}
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-10 pointer-events-none hidden lg:block -z-10">
          <img
            src="https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&q=80"
            alt="Science Lab"
            className="w-full h-full object-cover mask-image-gradient"
            style={{
              maskImage: "linear-gradient(to left, black, transparent)",
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-3xl"
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
              <Link
                href="/lab"
                className="px-8 py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
              >
                과학실 둘러보기
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/class"
                className="px-8 py-4 rounded-xl font-bold bg-white text-foreground border-2 border-border shadow-sm hover:border-primary/30 hover:bg-primary/5 hover:-translate-y-1 transition-all duration-300"
              >
                교육과정 안내
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

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
                  <div
                    className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
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
              <h2 className="text-3xl font-bold text-foreground mb-2">
                학교 새소식
              </h2>
              <p className="text-muted-foreground">
                과학중점학교의 생생한 활동 현장을 전해드립니다.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && <CreatePostDialog category="home" categoryLabel="학교 새소식" />}
              <Link
                href="/class"
                className="hidden sm:flex items-center gap-1 text-primary font-bold hover:gap-2 transition-all"
              >
                모든 소식 보기 <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {isLoading ? (
              Array(3)
                .fill(0)
                .map((_, i) => <PostCardSkeleton key={i} />)
            ) : posts && posts.length > 0 ? (
              posts
                .slice(0, 3)
                .map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-border">
                <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  아직 등록된 소식이 없습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
