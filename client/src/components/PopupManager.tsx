import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Eye, EyeOff, Settings, ChevronLeft, Upload, Loader2 } from "lucide-react";
import type { Popup } from "@shared/schema";
import { useAdmin } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";
import { PopupDisplay } from "@/components/PopupDisplay";

interface PopupFormData {
  title: string;
  content: string;
  imageUrl: string;
  linkUrl: string;
  linkLabel: string;
  active: boolean;
}

const empty: PopupFormData = {
  title: "", content: "", imageUrl: "",
  linkUrl: "", linkLabel: "", active: true,
};

type View = "list" | "form";

export function PopupManager() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [popups, setPopups] = useState<Popup[]>([]);
  const [form, setForm] = useState<PopupFormData>(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewPopup, setPreviewPopup] = useState<Popup | null>(null);
  const { password } = useAdmin();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeaders = { "Content-Type": "application/json", "x-admin-password": password };

  const load = async () => {
    try {
      const r = await fetch("/api/admin/popups", { headers: authHeaders });
      const data = await r.json();
      if (Array.isArray(data)) setPopups(data);
    } catch {}
  };

  useEffect(() => { if (open) load(); }, [open]);

  const openNew = () => {
    setForm(empty); setEditId(null); setView("form");
    setTimeout(() => scrollRef.current?.scrollTo(0, 0), 0);
  };

  const openEdit = (p: Popup) => {
    setForm({
      title: p.title, content: p.content,
      imageUrl: p.imageUrl ?? "", linkUrl: p.linkUrl ?? "",
      linkLabel: p.linkLabel ?? "", active: p.active,
    });
    setEditId(p.id); setView("form");
    setTimeout(() => scrollRef.current?.scrollTo(0, 0), 0);
  };

  const goList = () => { setView("list"); setEditId(null); setForm(empty); };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": file.type, "x-admin-password": password },
        body: file,
      });
      if (res.ok) {
        const data = await res.json() as { url?: string };
        if (data.url) {
          setForm((f) => ({ ...f, imageUrl: data.url! }));
          toast({ title: "이미지 업로드 완료" });
        }
      } else {
        toast({ title: "업로드 실패", variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: "제목을 입력하세요.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title, content: form.content,
        imageUrl: form.imageUrl || null, linkUrl: form.linkUrl || null,
        linkLabel: form.linkLabel || null, active: form.active,
      };
      const url = editId ? `/api/admin/popups/${editId}` : "/api/admin/popups";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: editId ? "팝업이 수정되었습니다." : "팝업이 등록되었습니다." });
        await load(); goList();
      } else {
        toast({ title: "저장에 실패했습니다.", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const toggleActive = async (p: Popup) => {
    await fetch(`/api/admin/popups/${p.id}`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ active: !p.active }),
    });
    await load();
  };

  const del = async (p: Popup) => {
    if (!confirm(`"${p.title}" 팝업을 삭제할까요?`)) return;
    await fetch(`/api/admin/popups/${p.id}`, { method: "DELETE", headers: authHeaders });
    toast({ title: "삭제되었습니다." }); await load();
  };

  const modal = open && (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />

      {/* 모달 */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            {view === "form" && (
              <button onClick={goList} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-bold text-gray-800">
              {view === "list" ? "팝업 관리" : editId ? "팝업 수정" : "새 팝업"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && (
              <button onClick={openNew}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> 새 팝업
              </button>
            )}
            <button onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 p-5">
          {/* 목록 뷰 */}
          {view === "list" && (
            <div className="space-y-3">
              {popups.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">등록된 팝업이 없습니다.</p>
                  <button onClick={openNew}
                    className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                    첫 팝업 만들기
                  </button>
                </div>
              ) : popups.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50 hover:bg-gray-100 transition-colors">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${!p.active ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {p.title}
                    </p>
                    {p.content && <p className="text-xs text-gray-400 truncate mt-0.5">{p.content}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActive(p)} title={p.active ? "비활성화" : "활성화"}
                      className="p-1.5 rounded-lg hover:bg-white transition-colors">
                      {p.active ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button onClick={() => setPreviewPopup(p)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-white transition-colors">
                      미리보기
                    </button>
                    <button onClick={() => openEdit(p)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-white transition-colors">
                      수정
                    </button>
                    <button onClick={() => del(p)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 폼 뷰 */}
          {view === "form" && (
            <div className="space-y-4">
              {/* 제목 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">제목 *</label>
                <input type="text" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="팝업 제목을 입력하세요"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500" />
              </div>

              {/* 내용 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">내용</label>
                <textarea rows={3} value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="팝업에 표시할 내용"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500 resize-y" />
              </div>

              {/* 이미지 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">이미지</label>
                {/* 파일 업로드 */}
                <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-all ${uploading ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}>
                  {uploading
                    ? <><Loader2 className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-xs text-blue-500 font-semibold">업로드 중...</span></>
                    : <><Upload className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500 font-semibold">파일 업로드</span></>
                  }
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                    disabled={uploading} />
                </label>
                {/* URL 직접 입력 */}
                <input type="text" value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="또는 이미지 URL 직접 입력"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500" />
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="" className="w-full h-24 object-cover rounded-xl border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>

              {/* 링크 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">링크 URL</label>
                <input type="text" value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500" />
              </div>

              {/* 링크 버튼 텍스트 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">링크 버튼 텍스트</label>
                <input type="text" value={form.linkLabel}
                  onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                  placeholder="자세히 보기"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500" />
              </div>

              {/* 활성화 */}
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
                저장 즉시 활성화 (방문자에게 표시)
              </label>
            </div>
          )}
        </div>

        {/* 푸터 (폼 뷰) */}
        {view === "form" && (
          <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 shrink-0">
            <button onClick={goList}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-white border hover:bg-gray-100 transition-colors">
              취소
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => { setOpen(true); setView("list"); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        title="팝업 관리"
      >
        <Settings className="w-3.5 h-3.5" /> 팝업
      </button>

      {/* Portal로 body에 직접 렌더링 → z-index 문제 없음 */}
      {createPortal(modal, document.body)}

      {/* 미리보기 */}
      {previewPopup && (
        createPortal(
          <PopupDisplay previewPopup={previewPopup} onPreviewClose={() => setPreviewPopup(null)} />,
          document.body
        )
      )}
    </>
  );
}
