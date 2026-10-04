import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  LayoutList,
  Loader2,
  X,
} from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import { CATEGORY_LABEL_MAX, type ApplicationSummary, type PublicCategory } from "@shared/schema";
import { categoryLabelSchema } from "@shared/categoryForms";
import { useAuthHeaders } from "@/contexts/admin";
import { useCategories, useInvalidateCategories } from "@/hooks/use-categories";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { usePosts } from "@/hooks/use-posts";

/**
 * 게시판 관리 — **admin 전용.**
 *
 * 이름·숨김·순서만 바꾼다. **게시판 주소와 내부 id 는 바뀌지 않는다** — 이미 나간
 * 링크가 깨지면 안 되고, 글이 가리키는 값이라 바꾸면 글이 떠돈다.
 * 새 게시판 만들기·지우기는 2단계다 (`docs/TODO.md`).
 *
 * 저장은 **칸을 벗어날 때가 아니라 버튼을 누를 때** 한다. 교사가 글자를 지우는
 * 도중에 저장되면 빈 이름이 서버로 간다.
 */

type Draft = { id: string; label: string; hidden: boolean };

/** 순서가 바뀌었는지. 배열 비교라 한 줄이면 된다. */
const sameOrder = (a: Draft[], b: PublicCategory[]) =>
  a.length === b.length && a.every((d, i) => d.id === b[i].id);

/**
 * 열림 상태는 **`Navigation` 이 들고 있다.** 트리거 버튼이 "관리" 드롭다운으로
 * 옮겨 갔기 때문이다.
 *
 * 드롭다운은 닫히면 사라지므로, 버튼이 그 안에 있고 모달이 이 컴포넌트 안에
 * 있으면 **드롭다운을 닫는 순간 모달도 사라진다.** 그래서 상태를 위로 올렸다.
 * (`PasswordChange` 가 이미 같은 모양이다.)
 */
export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const authHeaders = useAuthHeaders();
  const { all, routeOf } = useCategories();
  const invalidate = useInvalidateCategories();

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * 창을 열 때 서버 값을 초안으로 복사한다.
   *
   * `useEffect` 를 쓰는 유일한 곳이다. 여는 순간 한 번만 맞추면 되는데, 그 뒤로는
   * 교사가 고치는 중이라 서버 값으로 덮어쓰면 **입력이 날아간다.**
   */
  useEffect(() => {
    if (!open) return;
    setDrafts(all.map((c) => ({ id: c.id, label: c.label, hidden: c.hidden === true })));
    setErrors({});
    // `all` 을 의존성에 넣지 않는다 — 넣으면 저장할 때마다 초안이 덮어써진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 신청받는 중인 활동 수. 숨기기 경고에 쓴다. */
  const { data: summaries } = useQuery<ApplicationSummary[]>({
    queryKey: [api.applications.summaries.path],
    enabled: open,
    staleTime: 60_000,
  });
  const { data: posts } = usePosts();
  /**
   * 게시판별 "지금 신청받는 중" 인 활동 수.
   *
   * 숨긴 게시판의 활동은 **서버 집계에서 빠진다.** 그래서 이미 숨긴 게시판은 0 으로
   * 보인다 — 경고는 "지금 숨기려는" 게시판에 대한 것이므로 그게 맞다.
   */
  const openByCategory = new Map<string, number>();
  for (const s of summaries ?? []) {
    if (!s.isOpen) continue;
    const post = (posts ?? []).find((p) => p.id === s.postId);
    if (!post) continue;
    openByCategory.set(post.category, (openByCategory.get(post.category) ?? 0) + 1);
  }

  const close = () => {
    if (saveOne.isPending || saveOrder.isPending) return;
    onClose();
  };

  const saveOne = useMutation({
    mutationFn: async (input: { id: string; label?: string; hidden?: boolean }) => {
      const { id, ...body } = input;
      const res = await fetch(buildUrl(api.categories.update.path, { id }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "저장하지 못했습니다.");
      return data as PublicCategory[];
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: "저장하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const saveOrder = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(api.categories.reorder.path, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "순서를 저장하지 못했습니다.");
      return data as PublicCategory[];
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "순서를 저장했습니다" });
    },
    onError: (err: Error) =>
      toast({ title: "저장하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[to]] = [next[to], next[index]];
    setDrafts(next);
  };

  const setLabel = (id: string, label: string) => {
    setDrafts((p) => p.map((d) => (d.id === id ? { ...d, label } : d)));
    setErrors((p) => ({ ...p, [id]: "" }));
  };

  /** 이름 저장. **서버와 같은 스키마로 먼저 본다** — 갈라지면 화면은 통과인데 400 이다. */
  const submitLabel = (d: Draft) => {
    const parsed = categoryLabelSchema.safeParse(d.label);
    if (!parsed.success) {
      setErrors((p) => ({ ...p, [d.id]: parsed.error.errors[0].message }));
      return;
    }
    const server = all.find((c) => c.id === d.id);
    if (server?.label === parsed.data) return; // 바뀐 게 없다
    saveOne.mutate({ id: d.id, label: parsed.data });
  };

  const toggleHidden = (d: Draft) => {
    const next = !d.hidden;
    const openCount = openByCategory.get(d.id) ?? 0;
    if (next && openCount > 0) {
      const ok = window.confirm(
        `이 게시판에 신청받는 중인 활동 ${openCount}건이 있어요.\n\n` +
          "숨기면 \"활동 신청\" 목록과 메뉴 숫자에서 빠집니다.\n" +
          "학생이 이미 받은 링크로는 계속 신청할 수 있어요.\n\n숨길까요?"
      );
      if (!ok) return;
    }
    setDrafts((p) => p.map((x) => (x.id === d.id ? { ...x, hidden: next } : x)));
    saveOne.mutate({ id: d.id, hidden: next });
  };

  const orderChanged = !sameOrder(drafts, all);
  const busy = saveOne.isPending || saveOrder.isPending;

  return (
    <>
      {/*
        **반드시 포털로 띄운다.** `glass-nav` 헤더의 `backdrop-blur-md` 가 자손
        `position: fixed` 의 기준을 뷰포트에서 네비 바로 바꾼다. 포털 없이 두면
        모달이 네비 높이 안에 갇힌다.

        **포털이 `AnimatePresence` 밖에 있어야 한다.** 반대로 감싸면 상태는 바뀌는데
        화면에 아무것도 안 나온다 (`AiSettings`·`InviteManager` 와 같은 규칙).
      */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
              >
                <div className="flex items-start justify-between gap-3 p-5 border-b bg-muted/30 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-primary" />
                      게시판 관리
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      이름·숨김·순서를 바꿉니다. 주소와 기존 글은 그대로입니다.
                    </p>
                  </div>
                  <button
                    onClick={close}
                    disabled={busy}
                    aria-label="닫기"
                    className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-40 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-2 overflow-y-auto">
                  {drafts.map((d, i) => (
                    <div
                      key={d.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        d.hidden ? "border-border bg-muted/40" : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* ▲▼ — 순서는 버튼을 눌러 한 번에 저장한다 */}
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            onClick={() => move(i, -1)}
                            disabled={i === 0 || busy}
                            aria-label="위로"
                            className="p-0.5 rounded text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-25 transition-colors"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === drafts.length - 1 || busy}
                            aria-label="아래로"
                            className="p-0.5 rounded text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-25 transition-colors"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={d.label}
                          maxLength={CATEGORY_LABEL_MAX}
                          onChange={(e) => setLabel(d.id, e.target.value)}
                          onBlur={() => submitLabel(d)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              submitLabel(d);
                            }
                          }}
                          className={`flex-1 min-w-0 px-2.5 py-2 text-sm rounded-lg border-2 bg-background focus:outline-none transition-colors ${
                            errors[d.id]
                              ? "border-destructive focus:border-destructive"
                              : "border-border focus:border-primary"
                          }`}
                        />

                        {/* 숨긴 게시판에 들어가는 길. 메뉴에는 admin 에게도 안 보인다. */}
                        <a
                          href={routeOf(d.id)}
                          title="열기"
                          className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <button
                          type="button"
                          onClick={() => toggleHidden(d)}
                          disabled={busy}
                          title={d.hidden ? "다시 보이게" : "숨기기"}
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold border-2 disabled:opacity-40 transition-colors ${
                            d.hidden
                              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              : "border-border text-muted-foreground hover:bg-black/5"
                          }`}
                        >
                          {d.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {d.hidden ? "숨김" : "보임"}
                        </button>
                      </div>

                      {errors[d.id] && (
                        <p className="text-xs text-destructive font-medium pl-7">{errors[d.id]}</p>
                      )}
                      {!errors[d.id] && (openByCategory.get(d.id) ?? 0) > 0 && !d.hidden && (
                        <p className="text-xs text-muted-foreground pl-7">
                          신청받는 중인 활동 {openByCategory.get(d.id)}건
                        </p>
                      )}
                    </div>
                  ))}

                  <p className="flex gap-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg p-2.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      숨기면 <strong>메뉴와 활동 신청 목록에서만</strong> 빠집니다. 글과 글
                      주소는 그대로 살아 있어, 학생이 이미 받은 링크로는 계속 신청할 수 있어요.
                      새 게시판 만들기·지우기는 아직 없습니다.
                    </span>
                  </p>
                </div>

                <div className="p-5 border-t bg-muted/30 flex items-center justify-between gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {orderChanged ? "순서가 바뀌었습니다" : "이름은 입력 후 바로 저장됩니다"}
                  </span>
                  <button
                    type="button"
                    onClick={() => saveOrder.mutate(drafts.map((d) => d.id))}
                    disabled={!orderChanged || busy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {saveOrder.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    순서 저장
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
