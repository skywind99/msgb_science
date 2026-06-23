import React from "react";
import { type Post, type ContentBlock } from "@shared/schema";
import { Link } from "wouter";
import { format } from "date-fns";
import { Calendar, ChevronRight, Microscope, FlaskConical, BookOpen, Rocket, Users, Globe } from "lucide-react";

const CATEGORY_META: Record<string, { icon: React.ReactNode; from: string; to: string }> = {
  home:             { icon: <Microscope className="w-14 h-14 text-white/80" />, from: "from-blue-500",    to: "to-indigo-600" },
  lab_intro:        { icon: <FlaskConical className="w-14 h-14 text-white/80" />, from: "from-emerald-500", to: "to-teal-600" },
  science_class:    { icon: <BookOpen className="w-14 h-14 text-white/80" />,    from: "from-violet-500",  to: "to-purple-600" },
  career_program:   { icon: <Rocket className="w-14 h-14 text-white/80" />,      from: "from-orange-400",  to: "to-rose-500" },
  student_program:  { icon: <Users className="w-14 h-14 text-white/80" />,       from: "from-sky-400",     to: "to-blue-600" },
  local_community:  { icon: <Globe className="w-14 h-14 text-white/80" />,       from: "from-lime-400",    to: "to-green-600" },
};

const isImageUrl = (str?: string | null): str is string => {
  if (!str) return false;
  return /^https?:\/\/.+/i.test(str) && (
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(str) ||
    /\/(img|image|photo|upload|thumb|picture|bbs_\d|widg)/i.test(str)
  );
};

interface Props {
  post: Post;
}

export function PostCard({ post }: Props) {
  const blocks = post.blocks as ContentBlock[] | null;
  const firstBlockImg = blocks?.map(b => isImageUrl(b.imageUrl) ? b.imageUrl : isImageUrl(b.content) ? b.content : null).find(Boolean) ?? null;
  const thumbnail = post.imageUrl || firstBlockImg || null;
  const categoryMeta = CATEGORY_META[post.category];

  return (
    <Link href={`/posts/${post.id}`} className="group bg-card rounded-2xl overflow-hidden border border-border shadow-md hover:shadow-xl transition-all duration-300 flex flex-col h-full cursor-pointer" data-testid={`card-post-${post.id}`}>
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
          </>
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br ${categoryMeta?.from ?? "from-primary/20"} ${categoryMeta?.to ?? "to-blue-200"}`}>
            {categoryMeta?.icon}
          </div>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-grow">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
          <Calendar className="w-4 h-4" />
          {post.createdAt ? format(new Date(post.createdAt), "yyyy. MM. dd") : "최근"}
        </div>
        
        <h3 className="text-xl font-bold text-foreground mb-3 line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {post.title}
        </h3>
        
        <p className="text-muted-foreground text-sm line-clamp-3 mb-6 flex-grow">
          {post.content}
        </p>
        
        <div className="mt-auto pt-4 border-t flex items-center justify-between">
          <span className="text-sm font-bold text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
            자세히 보기 <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm flex flex-col h-full animate-pulse">
      <div className="h-48 w-full bg-muted" />
      <div className="p-6 flex flex-col flex-grow">
        <div className="w-24 h-4 bg-muted rounded mb-4" />
        <div className="w-full h-6 bg-muted rounded mb-2" />
        <div className="w-3/4 h-6 bg-muted rounded mb-4" />
        <div className="w-full h-4 bg-muted rounded mb-2" />
        <div className="w-full h-4 bg-muted rounded mb-2" />
        <div className="w-2/3 h-4 bg-muted rounded mb-6 flex-grow" />
        <div className="mt-auto pt-4 border-t">
          <div className="w-20 h-4 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
