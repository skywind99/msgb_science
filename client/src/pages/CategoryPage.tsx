import { motion } from "framer-motion";
import { usePosts } from "@/hooks/use-posts";
import { PostCard, PostCardSkeleton } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { NAV_ITEMS } from "@/components/Navigation";
import { FileQuestion } from "lucide-react";

interface Props {
  categoryId: string;
}

export default function CategoryPage({ categoryId }: Props) {
  const { data: posts, isLoading } = usePosts(categoryId);
  
  // Find category metadata
  const categoryInfo = NAV_ITEMS.find(item => item.id === categoryId);
  const title = categoryInfo?.label || "게시판";

  return (
    <div className="min-h-screen bg-background pb-24">
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
              <CreatePostDialog category={categoryId} categoryLabel={title} />
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
              <CreatePostDialog category={categoryId} categoryLabel={title} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
