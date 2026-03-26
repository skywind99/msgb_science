import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Post, type ContentBlock } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Pencil, Trash2, Lock, Plus, ImageIcon, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const isImageUrl = (str?: string | null): str is string => {
  if (!str) return false;
  return /^https?:\/\/.+/i.test(str) && (
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(str) ||
    /\/(img|image|photo|upload|thumb|picture|bbs_\d|widg)/i.test(str)
  );
};

const CATEGORY_LABELS: Record<string, string> = {
  home: "홈",
  lab_intro: "과학실 소개",
  science_class: "과학중점반활동",
  career_program: "창의융합진로프로그램",
  student_program: "학생중심프로그램",
  local_community: "지역교육공동체활동",
};

const CATEGORY_ROUTES: Record<string, string> = {
  home: "/",
  lab_intro: "/lab",
  science_class: "/class",
  career_program: "/career",
  student_program: "/student",
  local_community: "/community",
};

type PendingAction = "edit" | "delete" | null;

function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const addBlock = () => onChange([...blocks, { imageUrl: "", content: "" }]);
  const removeBlock = (idx: number) => onChange(blocks.filter((_, i) => i !== idx));
  const updateBlock = (idx: number, field: keyof ContentBlock, value: string) => {
    onChange(blocks.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  return (
    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
      {blocks.map((block, idx) => (
        <div key={idx} className="rounded-xl border-2 border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">블록 {idx + 1}</span>
            {blocks.length > 1 && (
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <ImageIcon className="w-3 h-3 text-primary" /> 🖼️ 이미지 URL 붙여넣기
            </div>
            <Input
              value={block.imageUrl ?? ""}
              onChange={(e) => updateBlock(idx, "imageUrl", e.target.value)}
              placeholder="학교 홈페이지 이미지 주소를 붙여넣으세요"
              className="text-sm"
            />
            {block.imageUrl && /^https?:\/\//.test(block.imageUrl) && (
              <img
                src={block.imageUrl}
                alt=""
                className="w-full h-28 object-cover rounded-lg border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <AlignLeft className="w-3 h-3 text-primary" /> 📝 텍스트 내용
            </div>
            <Textarea
              value={block.content ?? ""}
              onChange={(e) => updateBlock(idx, "content", e.target.value)}
              placeholder="이미지 아래에 들어갈 설명이나 내용..."
              rows={2}
              className="text-sm resize-y"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addBlock}
        className="w-full py-2 rounded-xl border-2 border-dashed border-primary/30 text-primary/70 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-medium text-sm"
      >
        <Plus className="w-4 h-4" /> 블록 추가
      </button>
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>([{ imageUrl: "", content: "" }]);

  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ["/api/posts", id],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${id}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
  });

  const authedFetch = async (method: string, url: string, data?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(body.message || "오류가 발생했습니다.");
    }
    return res;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { title: string; imageUrl?: string; blocks?: ContentBlock[]; content: string }) =>
      authedFetch("PATCH", `/api/posts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setEditOpen(false);
      toast({ title: "수정 완료", description: "게시물이 수정되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => authedFetch("DELETE", `/api/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "삭제 완료", description: "게시물이 삭제되었습니다." });
      navigate(post ? (CATEGORY_ROUTES[post.category] ?? "/") : "/");
    },
    onError: (err: Error) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const openPasswordDialog = (action: PendingAction) => {
    setPendingAction(action);
    setPassword("");
    setPasswordError("");
    setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = async () => {
    if (!password.trim()) { setPasswordError("비밀번호를 입력해 주세요."); return; }
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({}),
    });
    if (res.status === 401) { setPasswordError("비밀번호가 올바르지 않습니다."); return; }
    setPasswordDialogOpen(false);
    if (pendingAction === "edit" && post) {
      setEditTitle(post.title);
      setEditImageUrl(post.imageUrl ?? "");
      const existingBlocks = (post.blocks as ContentBlock[] | null);
      setEditBlocks(
        existingBlocks && existingBlocks.length > 0
          ? existingBlocks
          : [{ imageUrl: "", content: post.content ?? "" }]
      );
      setEditOpen(true);
    } else if (pendingAction === "delete") {
      setDeleteOpen(true);
    }
  };

  const handleEditSubmit = () => {
    const cleanedBlocks = editBlocks
      .map((b) => ({ imageUrl: b.imageUrl?.trim() || undefined, content: b.content?.trim() || undefined }))
      .filter((b) => b.imageUrl || b.content);
    const firstText = cleanedBlocks.find((b) => b.content)?.content ?? "";
    updateMutation.mutate({
      title: editTitle,
      imageUrl: editImageUrl.trim() || undefined,
      blocks: cleanedBlocks.length > 0 ? cleanedBlocks : undefined,
      content: firstText,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 animate-pulse">
        <div className="h-6 bg-muted rounded w-24 mb-8" />
        <div className="h-10 bg-muted rounded w-3/4 mb-4" />
        <div className="space-y-3 mt-10">
          {Array(5).fill(0).map((_, i) => <div key={i} className="h-4 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-xl text-muted-foreground">게시물을 찾을 수 없습니다.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>홈으로</Button>
      </div>
    );
  }

  const backRoute = CATEGORY_ROUTES[post.category] ?? "/";
  const categoryLabel = CATEGORY_LABELS[post.category] ?? post.category;
  const postBlocks = (post.blocks as ContentBlock[] | null);
  const displayBlocks: ContentBlock[] =
    postBlocks && postBlocks.length > 0
      ? postBlocks
      : [{ imageUrl: post.imageUrl ?? undefined, content: post.content || undefined }];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header (no image) */}
      <div className="bg-gradient-to-br from-primary/8 via-background to-blue-50/40 border-b border-primary/10 pt-14 pb-10">
        <div className="max-w-3xl mx-auto px-4">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold mb-4">
            {categoryLabel}
          </span>
          <h1 className="text-2xl md:text-4xl font-black text-foreground leading-tight">{post.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(backRoute)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openPasswordDialog("edit")} data-testid="button-edit">
              <Pencil className="w-4 h-4 mr-1" /> 수정
            </Button>
            <Button
              variant="outline" size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => openPasswordDialog("delete")}
              data-testid="button-delete"
            >
              <Trash2 className="w-4 h-4 mr-1" /> 삭제
            </Button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-10">
          <Calendar className="w-4 h-4" />
          {post.createdAt ? format(new Date(post.createdAt), "yyyy년 MM월 dd일") : ""}
        </div>

        {/* Blocks */}
        <div className="space-y-8">
          {displayBlocks.map((block, idx) => {
            const imgSrc = isImageUrl(block.imageUrl) ? block.imageUrl
                         : isImageUrl(block.content) ? block.content
                         : null;
            const textContent = isImageUrl(block.content) ? null : (block.content || null);
            return (
              <div key={idx}>
                {imgSrc && (
                  <div className="mb-4 rounded-2xl overflow-hidden border border-border shadow-md">
                    <img
                      src={imgSrc}
                      alt=""
                      className="w-full object-cover max-h-[500px]"
                      data-testid={`img-block-${idx}`}
                    />
                  </div>
                )}
                {textContent && (
                  <div className="prose prose-lg max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                    {textContent}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> 관리자 인증
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              {pendingAction === "edit" ? "수정" : "삭제"}하려면 관리자 비밀번호를 입력하세요.
            </p>
            <Input
              type="password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordConfirm()}
              data-testid="input-admin-password"
              autoFocus
            />
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>취소</Button>
            <Button onClick={handlePasswordConfirm} data-testid="button-confirm-password">확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>게시물 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label>
                대표 이미지 URL
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(목록 썸네일)</span>
              </Label>
              <Input
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                placeholder="https://example.com/thumbnail.jpg"
                data-testid="input-edit-image-url"
              />
              {editImageUrl && (
                <img
                  src={editImageUrl}
                  alt=""
                  className="w-full h-32 object-cover rounded-lg border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>본문 블록</Label>
              <BlockEditor blocks={editBlocks} onChange={setEditBlocks} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>취소</Button>
            <Button onClick={handleEditSubmit} disabled={updateMutation.isPending} data-testid="button-submit-edit">
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>게시물 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2">이 게시물을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
