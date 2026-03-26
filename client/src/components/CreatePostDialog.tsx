import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@shared/routes";
import { useCreatePost } from "@/hooks/use-posts";
import { X, Loader2, Pencil, Plus, Trash2, ImageIcon, AlignLeft } from "lucide-react";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { contentBlockSchema, type ContentBlock } from "@shared/schema";

type FormValues = z.infer<typeof api.posts.create.input>;

interface Props {
  category: string;
  categoryLabel: string;
}

function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const addBlock = () => onChange([...blocks, { imageUrl: "", content: "" }]);
  const removeBlock = (idx: number) => onChange(blocks.filter((_, i) => i !== idx));
  const updateBlock = (idx: number, field: keyof ContentBlock, value: string) =>
    onChange(blocks.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <div key={idx} className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary/70 uppercase tracking-wide">블록 {idx + 1}</span>
            {blocks.length > 1 && (
              <button type="button" onClick={() => removeBlock(idx)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              🖼️ 이미지 URL 붙여넣기
            </div>
            <input
              type="text"
              value={block.imageUrl ?? ""}
              onChange={(e) => updateBlock(idx, "imageUrl", e.target.value)}
              placeholder="학교 홈페이지 등에서 이미지 주소 복사 후 붙여넣기"
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-primary/20 bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {block.imageUrl && /^https?:\/\//.test(block.imageUrl) && (
              <img
                src={block.imageUrl}
                alt="미리보기"
                className="w-full h-40 object-cover rounded-lg border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <AlignLeft className="w-3.5 h-3.5 text-primary" />
              📝 텍스트 내용
            </div>
            <textarea
              value={block.content ?? ""}
              onChange={(e) => updateBlock(idx, "content", e.target.value)}
              placeholder="이미지 아래에 들어갈 설명이나 내용을 입력하세요..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-y"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addBlock}
        className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary/70 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-medium text-sm"
      >
        <Plus className="w-4 h-4" /> 블록 추가 (이미지 + 텍스트 세트)
      </button>
    </div>
  );
}

export function CreatePostDialog({ category, categoryLabel }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ imageUrl: "", content: "" }]);
  const createPost = useCreatePost();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(api.posts.create.input),
    defaultValues: {
      category,
      title: "",
      content: "",
      imageUrl: "",
    },
  });

  const handleClose = () => {
    setIsOpen(false);
    form.reset();
    setBlocks([{ imageUrl: "", content: "" }]);
  };

  const onSubmit = (data: FormValues) => {
    const cleanedBlocks = blocks
      .map((b) => ({
        imageUrl: b.imageUrl?.trim() || undefined,
        content: b.content?.trim() || undefined,
      }))
      .filter((b) => b.imageUrl || b.content);

    const firstText = cleanedBlocks.find((b) => b.content)?.content ?? "";

    createPost.mutate(
      {
        ...data,
        content: firstText,
        blocks: cleanedBlocks.length > 0 ? cleanedBlocks : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "게시글이 등록되었습니다.", description: "성공적으로 저장되었습니다." });
          handleClose();
        },
        onError: (err) => {
          toast({ title: "오류가 발생했습니다.", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 transition-all duration-200"
        data-testid="button-create-post"
      >
        <Pencil className="w-4 h-4" />
        글쓰기
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b bg-muted/30 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">새 글 작성</h2>
                  <p className="text-sm text-muted-foreground mt-1">[{categoryLabel}] 카테고리에 글을 작성합니다.</p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-full hover:bg-black/5 text-muted-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1">
                <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <input type="hidden" {...form.register("category")} />

                  {/* Title */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">제목</label>
                    <input
                      {...form.register("title")}
                      placeholder="게시글 제목을 입력하세요"
                      className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                    {form.formState.errors.title && (
                      <p className="text-sm text-destructive font-medium">{form.formState.errors.title.message}</p>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      대표 이미지 URL
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(목록 썸네일 — 비워두면 본문 첫 이미지 사용)</span>
                    </label>
                    <input
                      {...form.register("imageUrl")}
                      placeholder="https://example.com/thumbnail.jpg"
                      className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                    {form.watch("imageUrl") && (
                      <img
                        src={form.watch("imageUrl") as string}
                        alt="썸네일 미리보기"
                        className="w-full h-36 object-cover rounded-xl border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>

                  {/* Blocks */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      본문 블록
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(이미지와 내용을 자유롭게 조합)</span>
                    </label>
                    <BlockEditor blocks={blocks} onChange={setBlocks} />
                  </div>
                </form>
              </div>

              {/* Footer */}
              <div className="p-6 border-t bg-muted/30 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl font-semibold text-foreground hover:bg-black/5 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  form="create-post-form"
                  disabled={createPost.isPending}
                  className="flex items-center justify-center min-w-[120px] px-6 py-3 rounded-xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {createPost.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "등록하기"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
