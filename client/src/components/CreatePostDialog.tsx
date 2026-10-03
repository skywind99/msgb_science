import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@shared/routes";
import { useCreatePost } from "@/hooks/use-posts";
import { X, Loader2, Pencil } from "lucide-react";
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
  clearAiFields,
  emptyActivityPanel,
  panelToDraft,
  type ActivityPanelDraft,
  type AiFilledField,
} from "@/components/ActivityPanel";
import { errorMessage, fetchAiStatus, readImage, readText } from "@/lib/aiFill";
import { AiFillCard, type AiImageNotice } from "@/components/AiFillCard";
import type { AiFillResult } from "@shared/aiForms";

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
  /**
   * AI 가 넣은 본문 글상자. 다시 돌릴 때 **그 칸만** 갈아끼우기 위해 기억한다.
   * `text` 는 넣을 당시의 내용이다 — 사용자가 고쳤으면 달라져 있으므로 건드리지 않는다.
   */
  const [aiBody, setAiBody] = useState<{ id: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<"image" | "text" | null>(null);
  /**
   * AI 가 실제로 읽은 이미지 주소. 성공했을 때만 쓴다.
   *
   * `thumbnailUrl` 하나를 AI 카드와 대표 이미지 줄이 **같이 쓴다.** 그래서 "지금
   * 올라와 있는 사진" 만 보면 AI 가 읽은 사진인지 알 수 없다. 읽은 주소를 따로
   * 쥐고 맞춰 봐야 "AI가 읽었어요" 가 거짓이 되지 않는다.
   */
  const [aiReadImage, setAiReadImage] = useState("");
  /**
   * 주황 안내. **AI 카드에서 사진을 바꿨을 때만 세운다.**
   *
   * 두 입구가 같은 state 를 쓰므로 "사진이 달라졌는가" 로는 구분이 안 된다.
   * 그래서 **누가 바꿨는가** 로 판정한다 — 대표 이미지 줄에서 바꾼 것은 썸네일을
   * 고르는 일이고, AI 가 읽은 내용과 아무 상관이 없다. 그때 주황 안내가 뜨면
   * 교사는 자기가 건드리지 않은 것을 경고받는다.
   */
  const [aiImageNotice, setAiImageNotice] = useState<AiImageNotice | null>(null);
  /**
   * 신청 받기를 **AI 가 켰는가.** 사용자가 직접 켠 것과 구분해야 한다.
   *
   * `applyAiDates` 는 활동 칸이 하나라도 채워지면 토글을 켠다. 지울 때 그걸
   * 되돌리려면 "원래 꺼져 있었다" 는 사실이 필요하다.
   */
  const [aiEnabledApply, setAiEnabledApply] = useState(false);

  // 키가 등록돼 있는지. 다이얼로그를 열 때만 묻는다.
  const { data: aiStatus } = useQuery({
    queryKey: [api.ai.status.path],
    enabled: isOpen,
    staleTime: 60_000,
    queryFn: () => fetchAiStatus(authHeaders),
  });
  // 아직 모르면 undefined. 카드가 "확인 중" 과 "설정 없음" 을 구분해 보여준다.
  const aiReady = aiStatus ? aiStatus.groq || aiStatus.gemini : undefined;

  /** 카드 상태 줄. 성공 문구와 AI_FILL_MESSAGES 오류가 같은 자리에 온다. */
  const [aiStatusLine, setAiStatusLine] =
    useState<{ kind: "ok" | "error"; message: string } | null>(null);

  /** 등록을 눌렀을 때 막힌 활동 칸. 고치면 지운다. */
  const [activityErrors, setActivityErrors] =
    useState<Partial<Record<"date" | "startTime", string>>>({});
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
    setAiBody(null);
    setAiBusy(null);
    setAiReadImage("");
    setAiImageNotice(null);
    setAiEnabledApply(false);
    setAiStatusLine(null);
    setActivityErrors({});
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
    // 제목: AI 가 넣었고 사용자가 안 고쳤으면 갈아끼운다. 직접 쓴 제목은 그대로 둔다.
    const titleIsAis = aiTitleFilled;
    if (titleIsAis || !form.getValues("title").trim()) {
      form.setValue("title", result.title ?? "");
      setAiTitleFilled(!!result.title);
    }

    // 본문: AI 가 넣은 글상자가 그대로면 갈아끼우고, 사용자가 고쳤으면 손대지 않는다.
    setBlocks((prev) => {
      const mineIdx = aiBody
        ? prev.findIndex((b) => b.id === aiBody.id && b.value === aiBody.text)
        : -1;

      if (mineIdx >= 0) {
        const next = [...prev];
        if (result.body) {
          next[mineIdx] = { ...next[mineIdx], value: result.body };
          setAiBody({ id: next[mineIdx].id, text: result.body });
        } else {
          // 새 결과에 본문이 없으면 지난 본문을 비운다. 블록은 남겨 둔다
          // (최소 1개 규칙과 순서를 흔들지 않기 위해).
          next[mineIdx] = { ...next[mineIdx], value: "" };
          setAiBody(null);
        }
        return next;
      }

      if (!result.body) return prev;

      const emptyIdx = prev.findIndex((b) => b.type === "text" && !b.value.trim());
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = { ...next[emptyIdx], value: result.body };
        setAiBody({ id: next[emptyIdx].id, text: result.body });
        return next;
      }
      const block = newEditorBlock("text", result.body);
      setAiBody({ id: block.id, text: result.body });
      return [...prev, block];
    });

    // 활동 정보: 아직 보라색인 칸을 먼저 비우고 새 결과를 채운다.
    // 그래야 먼저 돌린 안내문의 장소·정원·신청 기간이 남지 않는다.
    const { next, filled } = applyAiDates(activity, result as never, aiFilled);
    setActivity(next);
    setAiFilled(new Set(filled));
    // 꺼져 있던 토글이 켜졌으면 AI 가 켠 것이다. 사용자가 미리 켜 뒀으면 그대로 둔다.
    if (!activity.applyEnabled && next.applyEnabled) setAiEnabledApply(true);

    return filled.length + (result.title ? 1 : 0) + (result.body ? 1 : 0);
  };

  /**
   * 호출 한 번. **버튼을 눌렀을 때만 들어온다** — 올리기만 해서는 불리지 않는다.
   * 결과와 오류 모두 카드 상태 줄에 남긴다. 오류 문구는 AI_FILL_MESSAGES 그대로다.
   */
  const runFill = async (
    mode: "image" | "text",
    call: () => Promise<AiFillResult>
  ): Promise<boolean> => {
    setAiBusy(mode);
    setAiStatusLine(null);
    try {
      const filled = applyAiResult(await call());
      setAiStatusLine({
        kind: "ok",
        message:
          filled > 0
            ? "제목, 본문, 활동 정보를 채웠어요. 보라색 칸을 확인해 주세요."
            : "읽을 수 있는 정보가 없었어요. 직접 입력해 주세요.",
      });
      return true;
    } catch (err) {
      setAiStatusLine({ kind: "error", message: errorMessage(err) });
      return false;
    } finally {
      setAiBusy(null);
    }
  };

  /**
   * 올린 이미지 한 장을 읽는다. 카드에서 올린 것이라 늘 우리 스토리지에 있다.
   *
   * **성공했을 때만** 읽은 주소를 갈아끼우고 안내를 내린다. 실패했는데 내리면
   * 교사는 이전 사진의 값을 새 사진의 값으로 믿게 된다.
   */
  const runReadImage = async () => {
    const url = thumbnailUrl;
    if (await runFill("image", () => readImage(url, authHeaders))) {
      setAiReadImage(url);
      setAiImageNotice(null);
    }
  };

  /**
   * 붙여 넣은 **글자만** 보낸다. 이미지는 보내지 않는다.
   *
   * 그래서 `aiReadImage` 도, 이미지 안내도 건드리지 않는다. 글을 고치는 것은
   * 이미지와 무관하므로 안내할 일이 없다.
   */
  const runReadText = async (text: string) => {
    await runFill("text", () => readText(text, authHeaders));
  };

  /**
   * 지울 AI 내용이 남아 있는가.
   *
   * 본문은 `aiBody` 가 있는 것만으로는 모른다 — 사용자가 고쳤으면 더 이상 AI 값이
   * 아니므로 **블록과 맞춰 봐야** 한다. 제목과 활동 칸은 고치는 순간 표시가 풀린다.
   */
  const aiBodyIntact =
    !!aiBody && blocks.some((b) => b.id === aiBody.id && b.value === aiBody.text);
  const hasAiContent = aiTitleFilled || aiFilled.size > 0 || aiBodyIntact;

  /**
   * AI 카드에서 사진을 바꾸거나 지웠다.
   *
   * **값은 하나도 건드리지 않는다.** 알려 주기만 하고, 지울지 다시 읽을지는
   * 교사가 버튼으로 고른다. 읽은 적이 없거나 지울 내용이 없으면 알릴 것도 없다.
   */
  const handleAiCardImage = (url: string) => {
    setThumbnailUrl(url);
    if (!aiReadImage || !hasAiContent) {
      setAiImageNotice(null);
      return;
    }
    if (!url) setAiImageNotice("cleared");
    else if (url !== aiReadImage) setAiImageNotice("replaced");
    else setAiImageNotice(null);
  };

  /**
   * AI 가 채웠고 **사용자가 고치지 않은** 값만 지운다.
   *
   * 판정 기준을 새로 만들지 않았다. 이미 있는 세 가지를 그대로 쓴다 —
   * 제목은 `aiTitleFilled`, 활동 칸은 `aiFilled`(고치면 그 칸만 빠진다),
   * 본문은 `aiBody`(고치면 내용이 달라져 안 맞는다). 사용자가 입력하거나 고친
   * 값은 어느 경로로도 여기 들어오지 않는다.
   */
  const clearAiFilled = () => {
    if (aiTitleFilled) {
      form.setValue("title", "");
      setAiTitleFilled(false);
    }

    // 블록은 남기고 내용만 비운다 — 최소 1개 규칙과 순서를 흔들지 않기 위해서다.
    if (aiBodyIntact && aiBody) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === aiBody.id && b.value === aiBody.text ? { ...b, value: "" } : b))
      );
    }
    setAiBody(null);

    setActivity((prev) => clearAiFields(prev, aiFilled, aiEnabledApply));

    setAiFilled(new Set());
    setAiEnabledApply(false);
    setAiImageNotice(null);
    // "채웠어요" 가 더는 사실이 아니다.
    setAiStatusLine(null);
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
      /**
       * 서버 문구는 "활동 일시를 입력해야 합니다" 하나뿐이라 **어느 칸이 문제인지
       * 가리키지 못한다.** 날짜는 채웠는데 시각만 빈 경우가 흔해서, 그때는
       * 칸을 짚어 준다.
       */
      const needsStartTime = activity.applyEnabled && !!activity.date && !activity.startTime;
      const needsDate = activity.applyEnabled && !activity.date;

      setActivityErrors(
        needsStartTime
          ? { startTime: "시작 시각을 입력해 주세요." }
          : needsDate
            ? { date: "활동 날짜를 입력해 주세요." }
            : {}
      );

      toast({
        title: "입력을 확인해 주세요.",
        description: needsStartTime
          ? "시작 시각을 입력해 주세요."
          : needsDate
            ? "활동 날짜를 입력해 주세요."
            : checked.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }
    setActivityErrors({});

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
                <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <input type="hidden" {...form.register("category")} />

                  {/* AI 입구는 여기 하나뿐이다. 전체 폭이라 오른쪽 패널과 같은 줄에 두지 않는다. */}
                  <AiFillCard
                    authHeaders={authHeaders}
                    imageUrl={thumbnailUrl}
                    onImageChange={handleAiCardImage}
                    readImageUrl={aiReadImage}
                    notice={hasAiContent ? aiImageNotice : null}
                    onReread={runReadImage}
                    onClearAi={clearAiFilled}
                    onDismissNotice={() => setAiImageNotice(null)}
                    onFillFromImage={runReadImage}
                    onFillFromText={runReadText}
                    busy={aiBusy}
                    ready={aiReady}
                    status={aiStatusLine}
                  />

                  <div className="border-t border-border" />

                  {/* 왼쪽은 글, 오른쪽은 활동 설정. 좁은 화면에서는 한 줄로 쌓인다. */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

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

                    {/* 대표 이미지 — 평범한 썸네일 카드. AI 입구는 맨 위 카드 하나뿐이다. */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">대표 이미지</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          목록 썸네일입니다. 비워두면 본문 첫 이미지를 씁니다.
                          {thumbnailUrl && " 위에서 올린 이미지가 지정돼 있습니다 — 바꾸려면 아래에서 고르세요."}
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
                        // 고친 칸의 오류 표시는 바로 내린다.
                        if (next.date !== activity.date || next.startTime !== activity.startTime) {
                          setActivityErrors({});
                        }
                        setActivity(next);
                      }}
                      aiFilled={aiFilled}
                      fieldErrors={activityErrors}
                    />
                    </div>
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
