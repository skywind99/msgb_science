import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@shared/routes";
import {
  AI_KEY_ADMIN_MESSAGES,
  AI_PROVIDERS,
  type AiKeysAdminResponse,
  type AiProvider,
} from "@shared/schema";
import { useAuthHeaders } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

/**
 * AI 설정 — **admin 전용.**
 *
 * 키의 주인은 사람이 아니라 사이트다. 여기서 한 번 등록하면 모든 교사의
 * AI 버튼이 같은 키를 쓴다. 교사는 키를 입력하지 않고 상태만 본다.
 *
 * 입력한 키는 서버가 AES-256-GCM 으로 암호화해 DB 에 넣는다.
 * **한 번 저장하면 다시 볼 수 없다** — 복호화는 서버에서만 하고, 이 화면으로
 * 내려오는 응답에는 키 값이 들어 있지 않다. 바꾸려면 새로 입력한다.
 */

const PROVIDER_LABEL: Record<AiProvider, string> = {
  groq: "Groq",
  gemini: "Gemini",
};

const PROVIDER_HINT: Record<AiProvider, string> = {
  groq: "console.groq.com 에서 만듭니다. 글자 분석을 먼저 맡습니다.",
  gemini: "aistudio.google.com 에서 만듭니다. 이미지 읽기를 먼저 맡습니다.",
};

const STATE_STYLE: Record<string, string> = {
  ok: "text-emerald-700 bg-emerald-50 border-emerald-200",
  none: "text-muted-foreground bg-muted border-border",
  unreadable: "text-amber-700 bg-amber-50 border-amber-200",
};

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 열림 상태는 **`Navigation` 이 들고 있다.** 트리거 버튼이 "관리" 드롭다운으로
 * 옮겨 갔기 때문이다.
 *
 * 드롭다운은 닫히면 사라지므로, 버튼이 그 안에 있고 모달이 이 컴포넌트 안에
 * 있으면 **드롭다운을 닫는 순간 모달도 사라진다.** 그래서 상태를 위로 올렸다.
 * (`PasswordChange` 가 이미 같은 모양이다.)
 */
export function AiSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const authHeaders = useAuthHeaders();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [drafts, setDrafts] = useState<Record<AiProvider, string>>({ groq: "", gemini: "" });
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);

  const { data, isLoading, error } = useQuery<AiKeysAdminResponse>({
    queryKey: [api.adminAiKeys.get.path],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(api.adminAiKeys.get.path, { headers: authHeaders });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "AI 설정을 불러올 수 없습니다.");
      }
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [api.adminAiKeys.get.path] });
    // 교사 화면의 상태 표시도 같이 갱신한다.
    queryClient.invalidateQueries({ queryKey: [api.ai.status.path] });
  };

  const save = useMutation({
    mutationFn: async (provider: AiProvider) => {
      const res = await fetch(api.adminAiKeys.put.path, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ provider, key: drafts[provider] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "키를 저장하지 못했습니다.");
      }
      return provider;
    },
    onSuccess: (provider) => {
      // 입력란을 바로 비운다. 화면에 평문을 남겨 둘 이유가 없다.
      setDrafts((d) => ({ ...d, [provider]: "" }));
      refresh();
      toast({ title: `${PROVIDER_LABEL[provider]} 키를 저장했습니다.` });
    },
    onError: (err: Error) =>
      toast({ title: "저장하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (provider: AiProvider) => {
      const res = await fetch(`${api.adminAiKeys.remove.path}?provider=${provider}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "키를 삭제하지 못했습니다.");
      }
      return provider;
    },
    onSuccess: (provider) => {
      setConfirmDelete(null);
      refresh();
      toast({ title: `${PROVIDER_LABEL[provider]} 키를 삭제했습니다.` });
    },
    onError: (err: Error) =>
      toast({ title: "삭제하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const close = () => {
    setDrafts({ groq: "", gemini: "" });
    setConfirmDelete(null);
    onClose();
  };

  return (
    <>
      {/*
        **반드시 포털로 띄운다.** `glass-nav` 헤더의 `backdrop-blur-md` 가
        자손 `position: fixed` 의 기준을 뷰포트에서 네비 바로 바꿔 버린다.
        포털 없이 두면 모달이 높이 80px 짜리 네비 안에 갇힌다.

        **포털이 `AnimatePresence` 밖에 있어야 한다.** 반대로 감싸면 상태는
        바뀌는데 화면에 아무것도 안 나온다. `InviteManager` 주석 참고.
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
                      <Sparkles className="w-4 h-4 text-primary" />
                      AI 설정
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      한 번 등록하면 모든 선생님의 AI 버튼에 적용됩니다.
                    </p>
                  </div>
                  <button
                    onClick={close}
                    aria-label="닫기"
                    className="p-1.5 rounded-full hover:bg-black/5 text-muted-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {isLoading && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
                    </p>
                  )}
                  {error && (
                    <p className="text-sm text-destructive font-medium">
                      {(error as Error).message}
                    </p>
                  )}

                  {data && !data.secretConfigured && (
                    <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        서버에 <code>AI_KEY_SECRET</code> 환경변수가 없어 키를 저장할 수
                        없습니다. Vercel 환경변수에 넣고 재배포한 뒤 다시 시도해 주세요.
                      </span>
                    </p>
                  )}

                  {data &&
                    AI_PROVIDERS.map((provider) => {
                      const entry = data.providers[provider];
                      return (
                        <div
                          key={provider}
                          className="rounded-xl border-2 border-border p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-foreground">
                              {PROVIDER_LABEL[provider]}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${
                                STATE_STYLE[entry.state] ?? STATE_STYLE.none
                              }`}
                            >
                              {entry.state === "ok" ? "사용 가능" : entry.state === "none" ? "미등록" : "확인 필요"}
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {AI_KEY_ADMIN_MESSAGES[entry.state]}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {PROVIDER_HINT[provider]}
                          </p>

                          {entry.updatedAt && (
                            <p className="text-[11px] text-muted-foreground">
                              마지막 변경 {fmt(entry.updatedAt)}
                              {entry.updatedByName && ` · ${entry.updatedByName}`}
                            </p>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="password"
                              autoComplete="off"
                              value={drafts[provider]}
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [provider]: e.target.value }))
                              }
                              placeholder={
                                entry.state === "none"
                                  ? "키를 붙여 넣으세요"
                                  : "바꾸려면 새 키를 붙여 넣으세요"
                              }
                              className={inputClass}
                            />
                            <button
                              type="button"
                              onClick={() => save.mutate(provider)}
                              disabled={
                                drafts[provider].trim().length === 0 ||
                                save.isPending ||
                                data.secretConfigured === false
                              }
                              className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                            >
                              {save.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              저장
                            </button>
                          </div>

                          {entry.state !== "none" &&
                            (confirmDelete === provider ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => remove.mutate(provider)}
                                  disabled={remove.isPending}
                                  className="px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold disabled:opacity-40"
                                >
                                  삭제
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2.5 py-1 rounded-md border border-border text-[11px] font-bold"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(provider)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> 키 삭제
                              </button>
                            ))}
                        </div>
                      );
                    })}

                  {/*
                    개인정보 안내. 문구는 2026-10-03 에 확정했다.
                    **공급자 이름과 폴백 순서를 밝히므로 `PROVIDER_ORDER` 와 짝이다** —
                    한쪽을 바꾸면 여기도 같이 고쳐야 한다.
                    같은 내용이 교사 화면 두 곳(대표 이미지 카드, "AI 입력" 아래)에도 있다.
                  */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                    <div className="text-xs font-bold text-foreground">쓰기 전에 알아 두실 것</div>
                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      <li>• 키는 서버에 암호화되어 저장됩니다. 저장 후에는 다시 볼 수 없습니다.</li>
                      <li>• AI는 선생님이 버튼을 누를 때만 쓰입니다. 이미지를 올리는 것만으로는 분석하지 않습니다.</li>
                      <li>
                        • 보내는 곳은 Google Gemini이고, 장애가 나면 Groq으로 넘어갑니다.
                      </li>
                      <li>
                        • 무료 이용 중에는 입력한 내용이 공급자의 서비스 개선에 쓰일 수 있습니다.
                        <strong>
                          {" "}
                          학생의 이름·얼굴이 나온 사진이나 개인정보가 담긴 글은 보내지 마세요.
                        </strong>
                      </li>
                    </ul>
                  </div>
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
