import { Link, useLocation } from "wouter";
import { Microscope, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const NAV_ITEMS = [
  { id: "home", label: "홈", path: "/" },
  { id: "lab_intro", label: "과학실 소개", path: "/lab" },
  { id: "science_class", label: "과학중점반활동", path: "/class" },
  { id: "career_program", label: "창의융합진로프로그램", path: "/career" },
  { id: "student_program", label: "학생중심프로그램", path: "/student" },
  { id: "local_community", label: "지역교육공동체활동", path: "/community" },
];

export function Navigation() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
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

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 lg:hidden text-foreground hover:bg-black/5 rounded-full transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
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
  );
}
