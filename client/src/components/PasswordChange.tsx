import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Info, KeyRound, Loader2, X } from "lucide-react";
import { changeOwnPassword } from "@/lib/passwordChange";
import { PASSWORD_MIN } from "@shared/passwordRule";
import { useToast } from "@/hooks/use-toast";

/**
 * 본인 비밀번호 변경. **교사와 admin 이 같이 쓴다.**
 *
 * 로그인이 아이디 방식이라 메일로 재설정할 수 없다(`shared/teacherId.ts`).
 * 그래서 교사가 스스로 바꿀 수 있는 자리가 여기 하나뿐이고, 관리자 재설정으로
 * 임시 비밀번호를 받은 교사가 반드시 들르는 곳이다.
 *
 * **비밀번호 값을 어디에도 남기지 않는다.** 입력값은 이 컴포넌트의 상태로만 있고,
 * 닫을 때 지운다. `localStorage` 에도, 로그에도, 오류 문구에도 넣지 않는다.
 * `autoComplete` 를 붙이는 것은 브라우저 비밀번호 관리자가 제대로 알아듣게 하려는
 * 것이다 — 그게 없으면 교사가 직접 적어 두게 된다.
 */

type Field = "current" | "next" | "confirm";

const LABEL: Record<Field, string> = {
  current: "현재 비밀번호",
  next: "새 비밀번호",
  confirm: "새 비밀번호 확인",
};

const AUTOCOMPLETE: Record<Field, string> = {
  current: "current-password",
  next: "new-password",
  confirm: "new-password",
};

export function PasswordChange({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<Field, string>>({
    current: "",
    next: "",
    confirm: "",
  });
  /** 칸별 보기/숨기기. 기본은 숨김 — 어깨 너머로 보이는 교무실이다. */
  const [shown, setShown] = useState<Record<Field, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** 닫을 때 입력값을 지운다. 열어 두고 자리를 비우는 일이 있다. */
  const close = () => {
    if (busy) return;
    setValues({ current: "", next: "", confirm: "" });
    setShown({ current: false, next: false, confirm: false });
    setError(null);
    onClose();
  };

  const set = (field: Field, v: string) => {
    setValues((p) => ({ ...p, [field]: v }));
    // 고치는 중인 칸의 오류는 바로 내린다.
    if (error?.field === field) setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await changeOwnPassword(values);
      if (!result.ok) {
        setError(result.problem);
        return;
      }
      toast({
        title: "비밀번호를 바꿨습니다",
        description: result.othersSignedOut
          ? "다른 기기의 로그인은 해제했어요. 이 기기는 그대로 쓸 수 있어요."
          : "이 기기는 그대로 쓸 수 있어요.",
      });
      // 성공했으니 값을 비우고 닫는다.
      setValues({ current: "", next: "", confirm: "" });
      setShown({ current: false, next: false, confirm: false });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const field = (name: Field) => (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{LABEL[name]}</label>
      <div className="relative">
        <input
          type={shown[name] ? "text" : "password"}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
          autoComplete={AUTOCOMPLETE[name]}
          aria-invalid={error?.field === name}
          className={`w-full pl-3 pr-10 py-2.5 rounded-xl border-2 bg-background focus:outline-none focus:ring-4 transition-all ${
            error?.field === name
              ? "border-destructive focus:border-destructive focus:ring-destructive/10"
              : "border-border focus:border-primary focus:ring-primary/10"
          }`}
        />
        <button
          type="button"
          onClick={() => setShown((p) => ({ ...p, [name]: !p[name] }))}
          aria-label={shown[name] ? `${LABEL[name]} 숨기기` : `${LABEL[name]} 보기`}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
        >
          {shown[name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error?.field === name && (
        <p className="text-xs text-destructive font-medium">{error.message}</p>
      )}
    </div>
  );

  /*
    **반드시 포털로 띄운다.** `glass-nav` 헤더의 `backdrop-blur-md` 가 자손
    `position: fixed` 의 기준을 뷰포트에서 네비 바로 바꾼다. 포털 없이 두면
    모달이 네비 높이 안에 갇힌다.

    **포털이 `AnimatePresence` 밖에 있어야 한다.** 반대로 감싸면 상태는 바뀌는데
    화면에 아무것도 안 나온다 (`AiSettings`·`InviteManager` 와 같은 규칙).
  */
  return createPortal(
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
            className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b bg-muted/30 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  비밀번호 변경
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {PASSWORD_MIN}자 이상으로 정해 주세요.
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

            <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
              {field("current")}
              <div className="border-t border-border" />
              {field("next")}
              {field("confirm")}

              {/* 메일 재설정이 없다는 사실을 여기서 알려 둔다. 잊으면 관리자를
                  찾아가야 하고, 관리자가 혼자면 더 번거롭다. */}
              <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  이 사이트는 <strong>메일로 비밀번호를 찾을 수 없습니다.</strong> 잊으면
                  관리자에게 재설정을 요청해야 해요. 바꾼 비밀번호를 꼭 기억해 주세요.
                </span>
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border-2 border-border hover:bg-black/5 disabled:opacity-40 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy ? "바꾸는 중…" : "비밀번호 바꾸기"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
