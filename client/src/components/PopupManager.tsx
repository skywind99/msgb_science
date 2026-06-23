import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Eye, EyeOff, Settings } from "lucide-react";
import type { Popup } from "@shared/schema";
import { useAdmin } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

interface PopupFormData {
  title: string;
  content: string;
  imageUrl: string;
  linkUrl: string;
  linkLabel: string;
  active: boolean;
}

const empty: PopupFormData = { title: "", content: "", imageUrl: "", linkUrl: "", linkLabel: "", active: true };

export function PopupManager() {
  const [open, setOpen] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [form, setForm] = useState<PopupFormData>(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { password } = useAdmin();
  const { toast } = useToast();

  const headers = { "Content-Type": "application/json", "x-admin-password": password };

  const load = () =>
    fetch("/api/admin/popups", { headers })
      .then((r) => r.json())
      .then(setPopups)
      .catch(() => {});

  useEffect(() => { if (open) load(); }, [open]);

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "제목을 입력하세요.", variant: "destructive" });
      return;
    }
    const body = {
      title: form.title,
      content: form.content,
      imageUrl: form.imageUrl || null,
      linkUrl: form.linkUrl || null,
      linkLabel: form.linkLabel || null,
      active: form.active,
    };
    const url = editId ? `/api/admin/popups/${editId}` : "/api/admin/popups";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editId ? "팝업이 수정되었습니다." : "팝업이 등록되었습니다." });
      setForm(empty); setEditId(null); setShowForm(false); load();
    } else {
      toast({ title: "저장에 실패했습니다.", variant: "destructive" });
    }
  };

  const toggleActive = async (p: Popup) => {
    await fetch(`/api/admin/popups/${p.id}`, {
      method: "PATCH", headers, body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const del = async (id: number) => {
    await fetch(`/api/admin/popups/${id}`, { method: "DELETE", headers });
    toast({ title: "팝업이 삭제되었습니다." });
    load();
  };

  const startEdit = (p: Popup) => {
    setForm({
      title: p.title, content: p.content,
      imageUrl: p.imageUrl ?? "", linkUrl: p.linkUrl ?? "",
      linkLabel: p.linkLabel ?? "", active: p.active,
    });
    setEditId(p.id); setShowForm(true);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        title="팝업 관리"
      >
        <Settings className="w-3.5 h-3.5" /> 팝업
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between p-5 border-b shrink-0">
                <h2 className="text-lg font-bold">팝업 관리</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setForm(empty); setEditId(null); setShowForm(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 새 팝업
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {/* 팝업 목록 */}
                {popups.length === 0 && !showForm && (
                  <p className="text-sm text-muted-foreground text-center py-8">등록된 팝업이 없습니다.</p>
                )}
                {popups.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl border bg-muted/20">
                    {p.imageUrl && (
                      <img src={p.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${!p.active ? "text-muted-foreground line-through" : ""}`}>{p.title}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{p.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleActive(p)} title={p.active ? "비활성화" : "활성화"}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                        {p.active ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-xs font-semibold text-primary">수정</button>
                      <button onClick={() => del(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* 팝업 폼 */}
                {showForm && (
                  <div className="border-2 border-primary/20 rounded-2xl p-4 space-y-3 bg-primary/5">
                    <h3 className="font-bold text-sm text-primary">{editId ? "팝업 수정" : "새 팝업 등록"}</h3>
                    {(["title", "content", "imageUrl", "linkUrl", "linkLabel"] as const).map((key) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">
                          {{ title: "제목 *", content: "내용", imageUrl: "이미지 URL", linkUrl: "링크 URL", linkLabel: "링크 버튼 텍스트" }[key]}
                        </label>
                        {key === "content" ? (
                          <textarea rows={3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:border-primary resize-y" />
                        ) : (
                          <input type="text" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:border-primary" />
                        )}
                        {key === "imageUrl" && form.imageUrl && (
                          <img src={form.imageUrl} alt="" className="w-full h-32 object-cover rounded-lg border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                      </div>
                    ))}
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-primary" />
                      바로 활성화
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setShowForm(false); setEditId(null); setForm(empty); }}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">취소</button>
                      <button onClick={save}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">저장</button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
