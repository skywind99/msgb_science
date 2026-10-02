import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@shared/routes";
import { useCreatePost } from "@/hooks/use-posts";
import { X, Loader2, Pencil } from "lucide-react";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  firstText,
  newEditorBlock,
  toContentBlocks,
  type EditorBlock,
} from "@shared/postBlocks";
import { ImageInput } from "@/components/ImageInput";
import { PostBlockEditor } from "@/components/PostBlockEditor";
import { useAuthHeaders } from "@/contexts/admin";
import { activityToPayload } from "@/components/ActivityFields";
import {
  ActivityPanel,
  emptyActivityPanel,
  panelToDraft,
  type ActivityPanelDraft,
} from "@/components/ActivityPanel";

// 활동 필드는 별도 state 로 다루므로 폼이 직접 등록하는 항목만 여기에 둔다.
// 활동 정보의 앞뒤 관계 검사는 저장 직전에 서버와 같은 스키마로 한 번 더 돌린다.
const formSchema = z.object({
  category: z.string(),
  title: z.string().trim().min(1, "제목을 입력해 주세요."),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// 인증 헤더를 context에서 가져오기
function useAdminPw(): Record<string, string> {
  try {
    return useAuthHeaders();
  } catch {
    return {};
  }
}

interface Props {
  category: string;
  categoryLabel: string;
}

export function CreatePostDialog({ category, categoryLabel }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => [newEditorBlock("text")]);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [activity, setActivity] = useState<ActivityPanelDraft>(emptyActivityPanel);
  const createPost = useCreatePost();
  const { toast } = useToast();
  const authHeaders = useAdminPw();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category,
      title: "",
      content: "",
      imageUrl: "",
    },
  });

  const handleClose = () => {
    setIsOpen(false);
    form.reset({ category, title: "", content: "", imageUrl: "" });
    setBlocks([newEditorBlock("text")]);
    setThumbnailUrl("");
    setActivity(emptyActivityPanel);
  };

  const onSubmit = (data: FormValues) => {
    const cleanedBlocks = toContentBlocks(blocks);

    const payload = {
      ...data,
      category, // prop에서 직접 사용 (hidden input 무시)
      imageUrl: thumbnailUrl || undefined,
      content: firstText(cleanedBlocks),
      blocks: cleanedBlocks.length > 0 ? cleanedBlocks : undefined,
      // 날짜 1개 + 시각 둘을 일시로 합쳐서 기존 변환 함수에 그대로 넘긴다
      ...activityToPayload(panelToDraft(activity), "create"),
    };

    // 활동 일시·마감의 앞뒤 관계를 서버와 같은 규칙으로 미리 확인한다.
    const checked = api.posts.create.input.safeParse(payload);
    if (!checked.success) {
      toast({
        title: "입력을 확인해 주세요.",
        description: checked.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    createPost.mutate(
      checked.data,
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
              className="relative w-full max-w-5xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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
                {/* 왼쪽은 글, 오른쪽은 활동 설정. 좁은 화면에서는 한 줄로 쌓인다. */}
                <form
                  id="create-post-form"
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                >
                  <input type="hidden" {...form.register("category")} />

                  <div className="lg:col-span-7 space-y-5 min-w-0">
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

                    {/* 대표 이미지 — 카드로 묶는다. 3단계에서 이 카드 안에
                        AI 상태 줄과 개인정보 안내가 들어온다. */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">대표 이미지</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          목록 썸네일입니다. 비워두면 본문 첫 이미지를 씁니다.
                        </p>
                      </div>
                      <ImageInput
                        value={thumbnailUrl}
                        onChange={setThumbnailUrl}
                        authHeaders={authHeaders}
                        variant="compact"
                        placeholder="https://example.com/thumbnail.jpg"
                      />
                    </div>

                    {/* Blocks */}
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <label className="text-sm font-semibold text-foreground">본문 블록</label>
                        <span className="text-xs text-muted-foreground">총 {blocks.length}개</span>
                      </div>
                      <PostBlockEditor blocks={blocks} onChange={setBlocks} authHeaders={authHeaders} />
                    </div>
                  </div>

                  <div className="lg:col-span-5 min-w-0">
                    <ActivityPanel value={activity} onChange={setActivity} />
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
