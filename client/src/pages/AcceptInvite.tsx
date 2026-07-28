import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import { api } from "@shared/routes";
import type { CheckInviteResponse } from "@shared/schema";
import { checkTeacherId, MAX_ID_LENGTH } from "@shared/teacherId";
import { useAdmin } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

/**
 * 초대 링크로 교사 계정을 만드는 화면 (`/invite/:token`).
 *
 * 토큰은 URL 경로에 있지만 SPA 라우팅이라 서버 로그에는 남지 않는다.
 * 계정 생성은 서버가 service_role 로 처리한다 — Supabase 대시보드의
 * 자율 가입을 꺼 두기 때문에 브라우저에서 `signUp` 을 부르면 실패한다.
 */

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

const INVALID_MESSAGE: Record<string, string> = {
  notfound: "유효하지 않은 초대 링크입니다. 링크를 다시 확인해 주세요.",
  used: "이미 사용된 초대 링크입니다. 관리자에게 새 링크를 요청해 주세요.",
  expired: "초대 링크가 만료되었습니다. 관리자에게 새 링크를 요청해 주세요.",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-foreground">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { loginWithEmail, teacherLoginAvailable } = useAdmin();
  const { toast } = useToast();

  const [check, setCheck] = useState<CheckInviteResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  // 서버와 같은 함수로 검사한다. 규칙이 갈라지면 화면은 통과인데 서버가 400 을 준다.
  const idProblem = loginId.length === 0 ? null : checkTeacherId(loginId.trim().toLowerCase());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(api.invites.check.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => null);
        if (!cancelled) {
          setCheck(res.ok ? body : { valid: false, reason: "notfound" });
        }
      } catch {
        if (!cancelled) setCheck({ valid: false, reason: "notfound" });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mismatch = passwordAgain.length > 0 && password !== passwordAgain;
  const canSubmit =
    name.trim().length >= 2 &&
    loginId.trim().length > 0 &&
    !idProblem &&
    password.length >= 8 &&
    password === passwordAgain &&
    !pending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      const res = await fetch(api.invites.accept.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          loginId: loginId.trim().toLowerCase(),
          password,
          name: name.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "계정을 만들지 못했습니다.");

      setDone(true);

      // 만든 계정으로 바로 로그인시킨다. 방금 정한 비밀번호를 또 입력하게 할 이유가 없다.
      if (teacherLoginAvailable) {
        const login = await loginWithEmail(loginId.trim().toLowerCase(), password);
        if (login.ok) {
          toast({ title: "계정이 만들어졌습니다", description: `${name.trim()} 선생님으로 로그인했습니다.` });
          navigate("/");
          return;
        }
      }
      toast({
        title: "계정이 만들어졌습니다",
        description: "상단 자물쇠 버튼에서 이메일로 로그인해 주세요.",
      });
    } catch (err) {
      toast({
        title: "계정을 만들지 못했습니다",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="rounded-2xl border-2 border-border bg-card p-6 space-y-5">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <UserPlus className="w-5 h-5 text-primary" />
              교사 계정 만들기
            </h1>
            <p className="text-sm text-muted-foreground">
              미사강변고 과학중점 사이트 관리자용 계정입니다.
            </p>
          </div>

          {checking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> 초대 링크를 확인하는 중…
            </p>
          )}

          {!checking && check && !check.valid && (
            <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
              <p className="text-sm font-medium text-foreground">
                {INVALID_MESSAGE[check.reason ?? "notfound"]}
              </p>
            </div>
          )}

          {!checking && check?.valid && !done && (
            <form onSubmit={submit} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  {check.role === "admin" ? "전체 관리자" : "교사"} 권한으로 만들어집니다
                </div>
                {check.memo && (
                  <p className="text-xs text-muted-foreground">발급 메모 — {check.memo}</p>
                )}
              </div>

              <Field label="이름" hint="(사이트에 표시됩니다)">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="김OO"
                  maxLength={20}
                  disabled={pending}
                  className={inputClass}
                />
              </Field>

              <Field label="아이디" hint="(로그인에 씁니다)">
                <input
                  type="text"
                  value={loginId}
                  // 입력 즉시 소문자로 낮춘다. 서버도 소문자로 바꿔 저장하므로,
                  // 그냥 두면 화면에는 Kim 인데 실제 아이디는 kim 이 되어 어긋난다.
                  onChange={(e) => setLoginId(e.target.value.toLowerCase())}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="kim"
                  maxLength={MAX_ID_LENGTH}
                  disabled={pending}
                  className={inputClass}
                />
              </Field>
              {idProblem ? (
                <p className="text-xs font-semibold text-destructive">{idProblem}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  영문 소문자로 시작하고, 소문자·숫자·밑줄(_)만 쓸 수 있습니다.
                  이메일은 받지 않습니다.
                </p>
              )}

              <Field label="비밀번호" hint="(8자 이상)">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  disabled={pending}
                  className={inputClass}
                />
              </Field>

              <Field label="비밀번호 확인">
                <input
                  type="password"
                  value={passwordAgain}
                  onChange={(e) => setPasswordAgain(e.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  disabled={pending}
                  className={inputClass}
                />
              </Field>
              {mismatch && (
                <p className="text-xs font-semibold text-destructive">두 비밀번호가 다릅니다.</p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                계정 만들기
              </button>

              <p className="text-xs text-muted-foreground">
                이 링크는 한 번만 쓸 수 있습니다. 계정을 만든 뒤에는 같은 링크로 다시
                만들 수 없습니다.
              </p>
            </form>
          )}

          {done && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                계정이 만들어졌습니다.
              </p>
              <p className="text-sm text-muted-foreground">
                상단 자물쇠 버튼에서 이메일과 비밀번호로 로그인해 주세요.
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full py-2.5 rounded-xl border-2 border-border text-sm font-bold hover:bg-muted/50 transition-colors"
              >
                홈으로
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
