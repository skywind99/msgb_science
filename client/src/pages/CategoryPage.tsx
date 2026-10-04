import { motion } from "framer-motion";
import { usePosts } from "@/hooks/use-posts";
import { PostCard, PostCardSkeleton } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { useCategories } from "@/hooks/use-categories";
import { useAdmin } from "@/contexts/admin";
import { EyeOff, FileQuestion } from "lucide-react";

interface Props {
  categoryId: string;
}

export default function CategoryPage({ categoryId }: Props) {
  const { data: posts, isLoading } = usePosts(categoryId);
  const { isAdmin, user } = useAdmin();
  const { labelOf, isHidden, all } = useCategories();

  const title = labelOf(categoryId);
  /**
   * 숨긴 게시판인가. **`hidden` 은 admin 응답에만 있다.** 그래서 비로그인은
   * `isHidden` 으로 알 수 없고, "목록에 없다" 로 판단한다.
   */
  const hiddenForAdmin = isHidden(categoryId);
  const missingFromList = !all.some((c) => c.id === categoryId);

  /**
   * 비로그인·교사에게 "준비 중" 을 보여줄지.
   *
   * 404 를 주지 않는 이유는 숨김이 **보안이 아니라 정리**이기 때문이다. 글은
   * `/posts/:id` 로 어차피 공개돼 있어서 404 로도 감춰지지 않고, 404 면 교사가
   * 자기 글을 못 찾고 북마크·외부 링크가 죽는다.
   */
  const showPlaceholder = missingFromList && user?.role !== "admin";

  if (showPlaceholder) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center py-24">
          <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-6">
            <EyeOff className="w-10 h-10 text-muted-foreground/60" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">준비 중인 게시판입니다</h1>
          <p className="text-muted-foreground">
            지금은 볼 수 없어요. 열리면 상단 메뉴에 다시 나타납니다.
          </p>
          <a
            href="/"
            className="inline-block mt-8 px-6 py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            홈으로
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* 숨긴 게시판에 admin 이 들어왔을 때. 평소 화면을 그대로 보여주고 띠만 얹는다 —
          여기서 글 목록을 막으면 숨긴 게시판의 글을 손볼 방법이 없어진다. */}
      {hiddenForAdmin && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start gap-2 text-sm text-amber-800">
            <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>숨겨진 게시판입니다.</strong> 학생에게는 메뉴와 활동 신청 목록에서
              보이지 않습니다. 게시판 관리에서 다시 보이게 할 수 있어요.
            </span>
          </div>
        </div>
      )}

      {/* Category Header */}
      <div className="bg-primary/5 py-16 md:py-24 border-b border-primary/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div>
              <div className="text-sm font-bold text-primary mb-2 tracking-wider">미사강변고등학교</div>
              <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight">{title}</h1>
            </div>
            
            <div>
              {isAdmin && <CreatePostDialog category={categoryId} categoryLabel={title} />}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => <PostCardSkeleton key={i} />)
          ) : posts && posts.length > 0 ? (
            posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <PostCard post={post} />
              </motion.div>
            ))
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full flex flex-col items-center justify-center py-32 px-4 text-center bg-white rounded-3xl border border-dashed border-border"
            >
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                <FileQuestion className="w-10 h-10 text-muted-foreground/60" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">게시글이 없습니다</h3>
              <p className="text-muted-foreground text-lg mb-8 max-w-md">
                이 카테고리에 등록된 첫 번째 게시글의 주인공이 되어보세요!
              </p>
              {isAdmin && <CreatePostDialog category={categoryId} categoryLabel={title} />}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
