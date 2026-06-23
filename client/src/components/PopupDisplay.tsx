import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import type { Popup } from "@shared/schema";

const DISMISSED_KEY = "popup_dismissed";

function getDismissed(): Set<number> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function setDismissed(id: number) {
  try {
    const d = getDismissed();
    d.add(id);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(d)));
  } catch {}
}

export function PopupDisplay() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch("/api/popups")
      .then((r) => r.json())
      .then((data: Popup[]) => {
        const dismissed = getDismissed();
        const filtered = data.filter((p) => !dismissed.has(p.id));
        if (filtered.length > 0) {
          setPopups(filtered);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const current = popups[currentIdx];

  const handleClose = () => {
    if (current) setDismissed(current.id);
    if (currentIdx + 1 < popups.length) {
      setCurrentIdx((i) => i + 1);
    } else {
      setVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && current && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative bg-card rounded-2xl shadow-2xl overflow-hidden w-full max-w-md"
          >
            {/* 닫기 버튼 */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* 팝업 카운터 */}
            {popups.length > 1 && (
              <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-full bg-black/20 text-white text-xs font-bold">
                {currentIdx + 1} / {popups.length}
              </div>
            )}

            {/* 이미지 */}
            {current.imageUrl && (
              <div className="w-full h-52 overflow-hidden bg-muted">
                <img
                  src={current.imageUrl}
                  alt={current.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* 내용 */}
            <div className="p-6">
              <h2 className="text-xl font-black text-foreground mb-2">{current.title}</h2>
              {current.content && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap mb-4">
                  {current.content}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                {current.linkUrl ? (
                  <a
                    href={current.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    {current.linkLabel || "자세히 보기"} <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : <div />}
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
