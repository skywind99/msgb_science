import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import type { CreateInviteResponse, InviteSummary } from "@shared/schema";
import { useAuthHeaders } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

/**
 * 교사 초대 발급 (관리자 전용).
 *
 * 자율 가입을 열지 않기로 했으므로 교사 계정은 여기서 발급한 링크로만 생긴다.
 * 링크의 평문 토큰은 발급 직후 한 번만 볼 수 있다. 서버는 해시만 저장한다.
 */

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(i: InviteSummary): { label: string; className: string } {
  if (i.used) return { label: "사용됨", className: "bg-muted text-muted-foreground" };
  if (i.expired) return { label: "만료", className: "bg-muted text-muted-foreground" };
  return { label: "사용 가능", className: "bg-emerald-100 text-emerald-800" };
}

/** 방금 발급한 링크. 이 화면을 닫으면 다시 볼 수 없다. */
function FreshLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${window.location.origin}${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 못 쓰는 환경도 있다. 링크는 화면에 그대로 보인다.
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.04] p-4 space-y-2">
      <div className="text-xs font-bold text-primary">초대 링크가 만들어졌습니다</div>
      <p className="text-xs font-mono break-all text-foreground bg-background rounded-lg border border-border p-2">
        {full}
      </p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "복사했습니다" : "링크 복사"}
      </button>
      <p className="text-xs text-destructive font-semibold">
        이 링크는 지금만 볼 수 있습니다. 창을 닫으면 다시 확인할 수 없습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        해당 선생님에게만 전달하세요. 링크를 받은 사람은 계정을 하나 만들 수 있습니다.
      </p>
    </div>
  );
}

export function InviteManager() {
  const authHeaders = useAuthHeaders();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [role, setRole] = useState<"teacher" | "admin">("teacher");
  const [days, setDays] = useState("7");
  const [fresh, setFresh] = useState<CreateInviteResponse | null>(null);

  const { data: list, isLoading } = useQuery<InviteSummary[]>({
    queryKey: [api.invites.list.path],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(api.invites.list.path, { headers: authHeaders });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "초대 목록을 불러올 수 없습니다.");
      }
      return res.json();
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [api.invites.list.path] });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.invites.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          role,
          memo: memo.trim() || undefined,
          expiresInDays: Number(days) || 7,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "초대를 만들지 못했습니다.");
      return body as CreateInviteResponse;
    },
    onSuccess: (data) => {
      setFresh(data);
      setMemo("");
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "발급하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.invites.remove.path, { id }), {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "삭제하지 못했습니다.");
      }
    },
    onSuccess: () => {
      refresh();
      toast({ title: "초대를 삭제했습니다" });
    },
    onError: (err: Error) =>
      toast({ title: "삭제하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const close = () => {
    setOpen(false);
    setFresh(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="교사 초대"
        className="p-2 rounded-full text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
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
              className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-start justify-between gap-3 p-5 border-b bg-muted/30 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-foreground">교사 초대</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    자율 가입은 없습니다. 여기서 만든 링크로만 계정이 생깁니다.
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

              <div className="p-5 overflow-y-auto flex-1 space-y-5">
                {fresh ? (
                  <>
                    <FreshLink link={fresh.link} />
                    <button
                      type="button"
                      onClick={() => setFresh(null)}
                      className="w-full py-2.5 rounded-xl border-2 border-border text-sm font-bold hover:bg-muted/50 transition-colors"
                    >
                      확인했습니다
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-foreground">
                        메모 <span className="font-normal text-muted-foreground">(누구에게 주는 링크인지)</span>
                      </label>
                      <input
                        type="text"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="2학년 과학 김OO 선생님"
                        maxLength={100}
                        className={inputClass}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-foreground">권한</label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value as "teacher" | "admin")}
                          className={inputClass}
                        >
                          <option value="teacher">교사 (자기 활동만)</option>
                          <option value="admin">전체 관리자</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-foreground">
                          유효 기간 <span className="font-normal text-muted-foreground">(일)</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={days}
                          onChange={(e) => setDays(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => create.mutate()}
                      disabled={create.isPending}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center justify-center gap-2"
                    >
                      {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      초대 링크 만들기
                    </button>
                  </div>
                )}

                <div className="pt-4 border-t border-border space-y-2">
                  <h3 className="text-xs font-bold text-foreground">발급한 초대</h3>
                  {isLoading && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
                    </p>
                  )}
                  {list && list.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      아직 발급한 초대가 없습니다.
                    </p>
                  )}
                  {list?.map((i) => {
                    const st = statusOf(i);
                    return (
                      <div
                        key={i.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.className}`}
                            >
                              {st.label}
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {i.role === "admin" ? "전체 관리자" : "교사"}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground mt-1 break-words">
                            {i.memo || "(메모 없음)"}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {i.used ? `사용 ${fmt(i.usedAt)}` : `만료 ${fmt(i.expiresAt)}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove.mutate(i.id)}
                          disabled={remove.isPending}
                          aria-label="초대 삭제"
                          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
