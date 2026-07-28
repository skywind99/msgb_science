import { Link, useLocation } from "wouter";
import { Microscope, Menu, X, Lock, LogOut, ShieldCheck, HardDrive } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { ApplicationSummary } from "@shared/schema";
import { useAdmin, useAuthHeaders } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";
import { PopupManager } from "@/components/PopupManager";
import { InviteManager } from "@/components/InviteManager";

export const NAV_ITEMS = [
  { id: "home", label: "홈", path: "/" },
  // "일정" 은 보기만 하는 곳처럼 들려서 "신청" 으로 바꿨다. 옆의 숫자(지금 신청할 수
  // 있는 활동 수)와 함께 학생이 메뉴만 보고도 새 활동이 열린 걸 알아채게 하려는 것.
  // 경로는 `/schedule` 그대로다 — 이미 나간 링크가 깨지면 안 된다.
  { id: "schedule", label: "활동 신청", path: "/schedule" },
  { id: "lab_intro", label: "과학실 소개", path: "/lab" },
  { id: "science_class", label: "과학중점반활동", path: "/class" },
  { id: "career_program", label: "창의융합진로프로그램", path: "/career" },
  { id: "student_program", label: "학생중심프로그램", path: "/student" },
  { id: "local_community", label: "지역교육공동체활동", path: "/community" },
];

/**
 * 지금 신청할 수 있는 활동 수.
 *
 * 집계 API 만 쓴다 — 게시물 목록은 본문·블록까지 실려 무겁고, 여기서 필요한 것은
 * 숫자 하나뿐이다. `isOpen` 판정은 서버가 `shared/activity.ts` 로 한다.
 *
 * 0 이면 배지를 감춘다. "0" 을 띄우면 신청할 게 있다는 착각을 준다.
 */
function useOpenActivityCount(): number {
  const { data } = useQuery<ApplicationSummary[]>({
    queryKey: [api.applications.summaries.path],
    staleTime: 60_000,
  });
  return (data ?? []).filter((s) => s.isOpen).length;
}

/** 메뉴 옆 숫자. 새 활동이 열리면 늘어난다. */
function OpenCountBadge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  return (
    <span
      aria-label={`신청할 수 있는 활동 ${count}건`}
      className={`ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold ${
        active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
      }`}
    >
      {count}
    </span>
  );
}

function AdminLoginModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginWithEmail, teacherLoginAvailable } = useAdmin();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await loginWithEmail(loginId, pw);
    setLoading(false);
    if (res.ok) {
      toast({ title: "로그인되었습니다." });
      onClose();
    } else {
      toast({ title: res.message ?? "로그인에 실패했습니다.", variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-card rounded-2xl shadow-2xl p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">교사 로그인</h2>
            <p className="text-xs text-muted-foreground">
              발급받은 아이디와 비밀번호를 입력하세요
            </p>
          </div>
        </div>

        {/* 환경변수가 없으면 로그인 자체가 불가능하다. 예전에는 관리자 비밀번호가
            안전망이었지만 그 방식을 제거했으므로, 조용히 실패하지 않게 알린다. */}
        {!teacherLoginAvailable ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              로그인 설정이 완료되지 않았습니다. 배포 환경변수
              <code className="mx-1 px-1 rounded bg-muted text-xs">VITE_SUPABASE_URL</code>과
              <code className="mx-1 px-1 rounded bg-muted text-xs">VITE_SUPABASE_ANON_KEY</code>를
              확인해 주세요.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl font-semibold border-2 border-border hover:bg-muted/50 transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="아이디"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary transition-all"
            />
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary transition-all"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-foreground hover:bg-black/5 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading || !pw || !loginId}
                className="flex-1 px-4 py-3 rounded-xl font-semibold bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
              >
                {loading ? "확인 중..." : "로그인"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              비밀번호를 잊었으면 관리자에게 재설정을 요청해 주세요.
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function StorageBadge() {
  const [info, setInfo] = useState<{ used: number; total: number } | null>(null);
  const authHeaders = useAuthHeaders();
  const headerKey = JSON.stringify(authHeaders);

  useEffect(() => {
    fetch("/api/storage-usage", { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.used === "number") setInfo(d);
      })
      .catch(() => {});
    // 헤더 내용이 바뀔 때만 다시 조회한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerKey]);

  if (!info) return null;

  const usedMB = (info.used / 1024 / 1024).toFixed(1);
  const totalMB = info.total / 1024 / 1024;
  const pct = Math.min(100, (info.used / info.total) * 100);
  const color = pct > 80 ? "text-red-500" : pct > 50 ? "text-yellow-500" : "text-green-500";

  return (
    <div className="flex items-center gap-1 shrink-0 whitespace-nowrap px-2 py-1.5 rounded-full bg-muted text-xs font-semibold" title={`Storage ${usedMB}MB / ${totalMB}MB (${pct.toFixed(1)}%)`}>
      <HardDrive className={`w-3.5 h-3.5 ${color}`} />
      <span className={color}>{usedMB}M</span>
    </div>
  );
}

export function Navigation() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { isAdmin, logout, user } = useAdmin();
  const openCount = useOpenActivityCount();

  return (
    <>
      {/*
        메뉴가 8개(홈·활동 신청·카테고리 5개)에 관리자 버튼 4개까지 붙는다.
        본문은 `max-w-7xl`(1280px)이지만 **헤더만 더 넓게** 쓴다. 그러지 않으면
        노트북 폭에서 라벨이 단어 중간에 줄바꿈된다 ("과학실 소 / 개").
        라벨에 `whitespace-nowrap` 을 걸어 두었으므로 폭이 모자라면 잘리는 대신
        가로로 넘치고, 그 전에 `xl` 미만에서는 햄버거 메뉴로 넘어간다.
      */}
      <header className="glass-nav">
        <div className="max-w-[110rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-4 h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <Microscope className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-primary tracking-wider whitespace-nowrap">미사강변고등학교</span>
                <span className="text-xl font-black text-foreground tracking-tight whitespace-nowrap">과학중점고</span>
              </div>
            </Link>

            {/* Desktop Nav — xl 미만에서는 햄버거로 넘긴다 (lg 에서는 라벨이 깨졌다) */}
            <nav className="hidden xl:flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.path;
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    className={`
                      relative whitespace-nowrap px-3 py-2 rounded-full text-[13px] font-semibold transition-colors duration-200
                      ${isActive ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-black/5"}
                    `}
                  >
                    {item.label}
                    {item.id === "schedule" && (
                      <OpenCountBadge count={openCount} active={isActive} />
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 border-2 border-primary/20 rounded-full z-[-1]"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side: Admin + Mobile Menu */}
            {/* 관리자로 들어오면 버튼이 넷 늘어난다. 이 영역이 줄어들면 안 되므로
                shrink-0 을 걸고, 대신 메뉴 쪽이 좁아지지 않게 라벨을 nowrap 으로 뒀다. */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin ? (
                <>
                  <StorageBadge />
                  <PopupManager />
                  {/* 초대 발급은 관리자만. 기존 관리자 비밀번호로 들어온 경우도 관리자다. */}
                  {(!user || user.role === "admin") && <InviteManager />}
                  {user && (
                    <span
                      className="hidden 2xl:inline text-xs font-semibold text-muted-foreground px-1 whitespace-nowrap"
                      title={user.role === "admin" ? "전체 관리자" : "교사"}
                    >
                      {user.name}
                    </span>
                  )}
                  <button
                    onClick={logout}
                    title={user ? "로그아웃" : "관리자 로그아웃"}
                    className="p-2 rounded-full text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="p-2 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
                  title="관리자 로그인"
                >
                  <Lock className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 xl:hidden text-foreground hover:bg-black/5 rounded-full transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="xl:hidden border-t bg-white"
            >
              <nav className="flex flex-col px-4 py-4 space-y-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <Link
                      key={item.id}
                      href={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`
                        px-4 py-3 rounded-xl text-base font-semibold transition-colors
                        ${isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-black/5"}
                      `}
                    >
                      {item.label}
                      {item.id === "schedule" && (
                        <OpenCountBadge count={openCount} active={isActive} />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {showLoginModal && <AdminLoginModal onClose={() => setShowLoginModal(false)} />}
      </AnimatePresence>
    </>
  );
}
