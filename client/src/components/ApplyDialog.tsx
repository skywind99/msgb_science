import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader2,
  Check,
  Copy,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import type {
  ApplyResponse,
  CancelResponse,
  LookupResponse,
  MyApplication,
  PublicPost,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

/**
 * 학생용 신청 · 조회 화면.
 *
 * 계정이 없으므로 신청의 증거는 6자리 확인코드 하나뿐이다.
 * 완료 화면에서 이 번호를 반드시 눈에 띄게 보여주고, 다시 알려줄 방법이
 * 없다는 것도 함께 알린다. 서버는 해시만 저장한다.
 */

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

/** 서버가 보내는 안내 문구를 그대로 쓴다. 요청 제한·마감 사유가 여기 담긴다. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data as { message?: string } | null)?.message ?? "요청을 처리할 수 없습니다."
    );
  }
  return data as T;
}

type Who = { grade: string; classNo: string; studentNo: string };
const emptyWho: Who = { grade: "", classNo: "", studentNo: "" };

function whoToNumbers(who: Who) {
  return {
    grade: Number(who.grade),
    classNo: Number(who.classNo),
    studentNo: Number(who.studentNo),
  };
}

function whoFilled(who: Who): boolean {
  const n = whoToNumbers(who);
  return (
    n.grade >= 1 && n.grade <= 3 &&
    n.classNo >= 1 && n.classNo <= 20 &&
    n.studentNo >= 1 && n.studentNo <= 50
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

/** 학년·반·번호. 신청과 조회가 같은 입력을 쓴다. */
function StudentIdFields({
  value,
  onChange,
  disabled,
}: {
  value: Who;
  onChange: (next: Who) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof Who>(key: K, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="학년">
        <select
          value={value.grade}
          onChange={(e) => set("grade", e.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">선택</option>
          <option value="1">1학년</option>
          <option value="2">2학년</option>
          <option value="3">3학년</option>
        </select>
      </Field>
      <Field label="반">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={value.classNo}
          onChange={(e) => set("classNo", e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      </Field>
      <Field label="번호">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={value.studentNo}
          onChange={(e) => set("studentNo", e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="flex items-start justify-between gap-3 p-5 border-b bg-muted/30 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="p-1.5 rounded-full hover:bg-black/5 text-muted-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 overflow-y-auto flex-1">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

const STATUS_TEXT: Record<MyApplication["status"], string> = {
  applied: "신청 확정",
  waitlisted: "대기자 등록",
};

function StatusLine({ app }: { app: MyApplication }) {
  return (
    <p className="text-sm font-semibold text-foreground">
      {app.grade}학년 {app.classNo}반 {app.studentNo}번 {app.name} —{" "}
      <span className={app.status === "applied" ? "text-emerald-600" : "text-amber-600"}>
        {STATUS_TEXT[app.status]}
        {app.status === "waitlisted" && app.waitlistPosition != null && (
          <> (대기 {app.waitlistPosition}번)</>
        )}
      </span>
    </p>
  );
}

/** 확인코드는 여기서 한 번만 보여줄 수 있다. 서버는 해시만 갖고 있다. */
function CodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 못 쓰는 브라우저도 있다. 숫자는 화면에 그대로 보이므로 그냥 넘어간다.
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.04] p-4 text-center space-y-2">
      <div className="text-xs font-bold text-primary">확인코드</div>
      <div className="font-mono text-4xl font-bold tracking-[0.2em] text-foreground">{code}</div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "복사했습니다" : "복사하기"}
      </button>
      <p className="text-xs text-destructive font-semibold pt-1">
        이 번호를 꼭 저장해 두세요. 다시 알려드릴 수 없습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        신청 내용을 확인하거나 취소할 때 필요합니다. 잊어버렸으면 담당 선생님께 문의하세요.
      </p>
    </div>
  );
}

/** 신청 현황 캐시를 다시 불러온다. 남은 자리가 바로 갱신되어야 한다. */
function useRefreshSummary(postId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/posts", postId, "applications", "summary"],
    });
    queryClient.invalidateQueries({ queryKey: [api.applications.summaries.path] });
  };
}

// ── 신청 ──────────────────────────────────────────────────

export function ApplyDialog({ post, onClose }: { post: PublicPost; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefreshSummary(post.id);

  const [who, setWho] = useState<Who>(emptyWho);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<ApplyResponse | null>(null);

  const canSubmit = whoFilled(who) && name.trim().length >= 2 && agree && !pending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      const result = await postJson<ApplyResponse>(
        buildUrl(api.applications.apply.path, { id: post.id }),
        {
          ...whoToNumbers(who),
          name: name.trim(),
          memo: memo.trim() || undefined,
          agree: true,
          ...(post.hasApplyPassword ? { applyPassword: password } : {}),
        }
      );
      setDone(result);
      refresh();
    } catch (err) {
      toast({
        title: "신청하지 못했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <Modal title="신청이 접수되었습니다" subtitle={post.title} onClose={onClose}>
        <div className="space-y-4">
          <StatusLine app={done.application} />
          {done.application.status === "waitlisted" && (
            <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              정원이 찼기 때문에 대기자로 등록되었습니다. 앞 순번이 취소하면 자동으로
              신청 확정으로 바뀝니다. 확인코드로 조회하면 바뀐 상태를 볼 수 있습니다.
            </p>
          )}
          <CodeCard code={done.code} />
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
          >
            확인했습니다
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="활동 신청" subtitle={post.title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <StudentIdFields value={who} onChange={setWho} disabled={pending} />

        <Field label="이름">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            maxLength={20}
            disabled={pending}
            className={inputClass}
          />
        </Field>

        <Field label="담당 선생님께 남길 말 (선택)">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="알레르기, 희망하는 조 등"
            disabled={pending}
            className={`${inputClass} resize-y`}
          />
        </Field>

        {post.hasApplyPassword && (
          <Field label="신청 비밀번호">
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="선생님이 알려주신 비밀번호"
                maxLength={50}
                disabled={pending}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>
        )}

        {/* 개인정보 수집 고지. 항목을 늘리려면 여기 문구도 함께 고쳐야 한다. */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            개인정보 수집·이용 안내
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            <li>수집 항목 — 학년, 반, 번호, 이름 (선택: 남긴 말)</li>
            <li>이용 목적 — 활동 참가자 확인 및 명단 관리</li>
            <li>보유 기간 — 활동 종료 후 30일 이내 삭제</li>
          </ul>
          <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={pending}
              className="mt-0.5 w-4 h-4 accent-primary"
            />
            <span className="text-xs font-semibold text-foreground">
              위 내용에 동의하며 신청합니다.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          신청하기
        </button>
      </form>
    </Modal>
  );
}

// ── 조회 · 취소 ───────────────────────────────────────────

export function LookupDialog({ post, onClose }: { post: PublicPost; onClose: () => void }) {
  const { toast } = useToast();
  const refresh = useRefreshSummary(post.id);

  const [who, setWho] = useState<Who>(emptyWho);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [found, setFound] = useState<LookupResponse | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const body = () => ({ postId: post.id, ...whoToNumbers(who), code });
  const canSubmit = whoFilled(who) && /^\d{6}$/.test(code) && !pending;

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      setFound(await postJson<LookupResponse>(api.applications.lookup.path, body()));
    } catch (err) {
      toast({
        title: "조회하지 못했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    setPending(true);
    try {
      const result = await postJson<CancelResponse>(api.applications.cancel.path, body());
      setCancelled(true);
      setFound(null);
      setConfirming(false);
      refresh();
      toast({
        title: "신청을 취소했습니다",
        description: result.promoted
          ? "빈 자리에 대기자 한 명이 신청 확정으로 올라갔습니다."
          : undefined,
      });
    } catch (err) {
      toast({
        title: "취소하지 못했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  if (cancelled) {
    return (
      <Modal title="신청이 취소되었습니다" subtitle={post.title} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            신청 기록을 삭제했습니다. 다시 신청하려면 마감 전에 새로 신청해 주세요.
            새 확인코드가 발급됩니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
          >
            닫기
          </button>
        </div>
      </Modal>
    );
  }

  if (found) {
    return (
      <Modal title="내 신청 내용" subtitle={post.title} onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
            <StatusLine app={found.application} />
            {found.application.memo && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                남긴 말 — {found.application.memo}
              </p>
            )}
          </div>

          {confirming ? (
            <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">
                정말 취소하시겠습니까? 되돌릴 수 없습니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                  신청 취소
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="flex-1 py-2 rounded-lg border-2 border-border text-sm font-bold"
                >
                  그만두기
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full py-2.5 rounded-xl border-2 border-destructive/40 text-destructive text-sm font-bold hover:bg-destructive/5 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              신청 취소하기
            </button>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="신청 조회 · 취소" subtitle={post.title} onClose={onClose}>
      <form onSubmit={lookup} className="space-y-4">
        <StudentIdFields value={who} onChange={setWho} disabled={pending} />

        <Field label="확인코드 6자리">
          <div className="relative">
            <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              disabled={pending}
              className={`${inputClass} pl-8 font-mono tracking-[0.2em]`}
            />
          </div>
        </Field>

        <p className="text-xs text-muted-foreground">
          신청할 때 받은 6자리 번호입니다. 여러 번 틀리면 잠시 조회가 막힙니다.
          코드를 잊어버렸으면 담당 선생님께 문의해 주세요.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          조회하기
        </button>
      </form>
    </Modal>
  );
}
