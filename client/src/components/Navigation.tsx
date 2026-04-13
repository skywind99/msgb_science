import { Link, useLocation } from "wouter";
import { Microscope, Menu, X, Lock, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

export const NAV_ITEMS = [
  { id: "home", label: "홈", path: "/" },
  { id: "lab_intro", label: "과학실 소개", path: "/lab" },
  { id: "science_class", label: "과학중점반활동", path: "/class" },
  { id: "career_program", label: "창의융합진로프로그램", path: "/career" },
  { id: "student_program", label: "학생중심프로그램", path: "/student" },
  { id: "local_community", label: "지역교육공동체활동", path: "/community" },
];

function AdminLoginModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAdmin();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(pw);
    setLoading(false);
    if (ok) {
      toast({ title: "관리자로 로그인되었습니다." });
      onClose();
    } else {
      toast({ title: "비밀번호가 올바르지 않습니다.", variant: "destructive" });
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
            <h2 className="text-lg font-bold text-foreground">관리자 로그인</h2>
            <p className="text-xs text-muted-foreground">관리자 비밀번호를 입력하세요</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
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
              disabled={loading || !pw}
              className="flex-1 px-4 py-3 rounded-xl font-semibold bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
            >
              {loading ? "확인 중..." : "로그인"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function Navigation() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { isAdmin, logout } = useAdmin();

  return (
    <>
      <header className="glass-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <Microscope className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-primary tracking-wider">미사강변고등학교</span>
                <span className="text-xl font-black text-foreground tracking-tight">과학중점고</span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex space-x-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.path;
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    className={`
                      relative px-4 py-2 rounded-full text-sm font-semibold transition-colors duration-200
                      ${isActive ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-black/5"}
                    `}
                  >
                    {item.label}
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
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  관리자 로그아웃
                </button>
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
                className="p-2 lg:hidden text-foreground hover:bg-black/5 rounded-full transition-colors"
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
              className="lg:hidden border-t bg-white"
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
