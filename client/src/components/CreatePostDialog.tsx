import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@shared/routes";
import { useCreatePost } from "@/hooks/use-posts";
import { X, Loader2, Pencil, Sparkles, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
  applyAiDates,
  emptyActivityPanel,
  panelToDraft,
  type ActivityPanelDraft,
  type AiFilledField,
} from "@/components/ActivityPanel";
import { errorMessage, fetchAiStatus, readImage, readText } from "@/lib/aiFill";
import { isPublicStorageUrl } from "@shared/storageUrl";

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

  // AI 가 채운 칸. 사용자가 고치면 그 칸만 빠진다.
  const [aiFilled, setAiFilled] = useState<Set<AiFilledField>>(new Set());
  const [aiTitleFilled, setAiTitleFilled] = useState(false);
  const [aiBusy, setAiBusy] = useState<"image" | "text" | null>(null);

  // 키가 등록돼 있는지. 다이얼로그를 열 때만 묻는다.
  const { data: aiStatus } = useQuery({
    queryKey: [api.ai.status.path],
    enabled: isOpen,
    staleTime: 60_000,
    queryFn: () => fetchAiStatus(authHeaders),
  });
  const aiReady = !!aiStatus && (aiStatus.groq || aiStatus.gemini);
  const aiHint = aiStatus && !aiReady ? "관리자가 AI를 설정하지 않았어요." : undefined;

  /** 대표 이미지가 우리 스토리지에 있어야 서버가 읽을 수 있다. */
  const thumbnailReadable = isPublicStorageUrl(
    thumbnailUrl,
    import.meta.env.VITE_SUPABASE_URL as string | undefined
  );
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
    setAiFilled(new Set());
    setAiTitleFilled(false);
    setAiBusy(null);
  };

  /**
   * AI 결과를 화면에 넣는다.
   *
   * **기존에 쓴 내용을 지우거나 덮어쓰지 않는다.**
   *  - 제목: 비어 있을 때만 채운다
   *  - 본문: 빈 글상자가 있으면 거기에, 없으면 새 글상자로 덧붙인다
   *  - 활동 정보: `applyAiDates` 가 날짜 규칙까지 맞춰 준다
   */
  const applyAiResult = (result: {
    title: string | null;
    body: string | null;
    [k: string]: unknown;
  }) => {
    const marked = new Set(aiFilled);

    if (result.title && !form.getValues("title").trim()) {
      form.setValue("title", result.title);
      setAiTitleFilled(true);
    }

    if (result.body) {
      setBlocks((prev) => {
        const emptyIdx = prev.findIndex((b) => b.type === "text" && !b.value.trim());
        if (emptyIdx >= 0) {
          const next = [...prev];
          next[emptyIdx] = { ...next[emptyIdx], value: result.body! };
          return next;
        }
        return [...prev, newEditorBlock("text", result.body!)];
      });
    }

    const { next, filled } = applyAiDates(activity, result as never);
    setActivity(next);
    filled.forEach((f) => marked.add(f));
    setAiFilled(marked);

    return filled.length + (result.title ? 1 : 0) + (result.body ? 1 : 0);
  };

  /** 대표 이미지 한 장을 읽는다. **버튼을 눌렀을 때만 전송된다.** */
  const runReadImage = async () => {
    setAiBusy("image");
    try {
      const filled = applyAiResult(await readImage(thumbnailUrl, authHeaders));
      toast(
        filled > 0
          ? { title: "AI가 읽은 값을 채웠습니다.", description: "보라색 칸을 꼭 확인해 주세요." }
          : { title: "읽을 수 있는 정보가 없었어요.", description: "직접 입력해 주세요." }
      );
    } catch (err) {
      toast({ title: "AI로 읽지 못했어요", description: errorMessage(err), variant: "destructive" });
    } finally {
      setAiBusy(null);
    }
  };

  /** 본문 글상자의 **글자만** 보낸다. 이미지는 보내지 않는다. */
  const runReadText = async () => {
    const text = blocks
      .filter((b) => b.type === "text" && b.value.trim())
      .map((b) => b.value.trim())
      .join("\n\n");

    if (!text) {
      toast({
        title: "본문이 비어 있어요",
        description: "글상자에 안내문을 붙여 넣은 뒤 다시 눌러 주세요.",
      });
      return;
    }

    setAiBusy("text");
    try {
      const filled = applyAiResult(await readText(text, authHeaders));
      toast(
        filled > 0
          ? { title: "AI가 읽은 값을 채웠습니다.", description: "보라색 칸을 꼭 확인해 주세요." }
          : { title: "읽을 수 있는 정보가 없었어요.", description: "직접 입력해 주세요." }
      );
    } catch (err) {
      toast({ title: "AI로 읽지 못했어요", description: errorMessage(err), variant: "destructive" });
    } finally {
      setAiBusy(null);
    }
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
                        {...form.register("title", {
                          onChange: () => setAiTitleFilled(false),
                        })}
                        placeholder="게시글 제목을 입력하세요"
                        className={`w-full px-4 py-3 rounded-xl border-2 bg-background focus:outline-none focus:ring-4 transition-all ${
                          aiTitleFilled
                            ? "border-violet-300 bg-violet-50 focus:border-violet-500 focus:ring-violet-200"
                            : "border-border focus:border-primary focus:ring-primary/10"
                        }`}
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

                      {/* 개인정보 안내 — 이미지가 있을 때만. 누르기 전에 읽히도록 버튼 위에 둔다. */}
                      {thumbnailUrl && (
                        <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong>"AI로 읽기"를 누르면</strong> 이 이미지가 AI 서비스(Google
                            Gemini, 장애 시 Groq)로 전송됩니다. 무료 이용 중에는 입력한 내용이
                            공급자의 서비스 개선에 쓰일 수 있습니다. 학생의 이름·얼굴이 나온
                            사진이나 개인정보가 담긴 글은 보내지 마세요.
                          </span>
                        </p>
                      )}

                      {thumbnailUrl && (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={runReadImage}
                            disabled={!aiReady || !thumbnailReadable || aiBusy !== null}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border-2 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {aiBusy === "image" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {aiBusy === "image" ? "읽는 중…" : "AI로 읽기"}
                          </button>

                          <p className="text-xs text-muted-foreground">
                            {!aiStatus
                              ? "AI 설정을 확인하는 중…"
                              : !aiReady
                                ? "관리자가 AI를 설정하지 않았어요."
                                : !thumbnailReadable
                                  ? "외부 주소 이미지는 읽을 수 없어요. URL 탭의 “저장” 을 눌러 서버에 보관한 뒤 다시 시도해 주세요."
                                  : "AI 사용 가능 · 포스터라면 제목과 활동 정보를 채워 줍니다."}
                          </p>
                        </div>
                      )}
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
                    <ActivityPanel
                      value={activity}
                      onChange={(next) => {
                        // 사용자가 고친 칸은 보라색 표시를 푼다.
                        const changed = (Object.keys(next) as Array<keyof ActivityPanelDraft>).filter(
                          (k) => next[k] !== activity[k]
                        );
                        if (changed.length > 0 && aiFilled.size > 0) {
                          const rest = new Set(aiFilled);
                          changed.forEach((k) => rest.delete(k as AiFilledField));
                          setAiFilled(rest);
                        }
                        setActivity(next);
                      }}
                      aiFilled={aiFilled}
                      onAiFill={runReadText}
                      aiBusy={aiBusy === "text"}
                      aiHint={aiHint}
                    />
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
