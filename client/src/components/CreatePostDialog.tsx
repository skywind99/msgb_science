import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@shared/routes";
import { useCreatePost } from "@/hooks/use-posts";
import { X, Loader2, Pencil, Plus, Trash2, ImageIcon, AlignLeft, Upload, Link2, Youtube } from "lucide-react";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { contentBlockSchema, type ContentBlock } from "@shared/schema";
import { useAdminPassword } from "@/contexts/admin";

type FormValues = z.infer<typeof api.posts.create.input>;

// 관리자 비밀번호를 context에서 가져오기
function useAdminPw() {
  try {
    return useAdminPassword();
  } catch {
    return "";
  }
}

// 이미지 업로드 (파일 → Storage → URL)
async function uploadImageFile(file: File, adminPassword: string): Promise<string | null> {
  const res = await fetch("/api/upload-image", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-admin-password": adminPassword,
    },
    body: file,
  });
  if (!res.ok) return null;
  const data = await res.json() as { url?: string };
  return data.url ?? null;
}

// 외부 URL → Storage 미러링
async function mirrorImage(url: string, adminPassword: string): Promise<string> {
  try {
    const res = await fetch("/api/mirror-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return url;
    const data = await res.json() as { url?: string };
    return data.url ?? url;
  } catch {
    return url;
  }
}

interface ImageInputProps {
  value: string;
  onChange: (url: string) => void;
  adminPassword: string;
  label?: string;
  placeholder?: string;
}

function ImageInput({ value, onChange, adminPassword, label, placeholder }: ImageInputProps) {
  const [mode, setMode] = useState<"url" | "file">("file");
  const [uploading, setUploading] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file, adminPassword);
      if (url) {
        onChange(url);
        toast({ title: "이미지 업로드 완료" });
      } else {
        toast({ title: "업로드 실패", variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMirror = async () => {
    if (!value || !/^https?:\/\//i.test(value)) return;
    setMirroring(true);
    try {
      const mirrored = await mirrorImage(value, adminPassword);
      onChange(mirrored);
      if (mirrored !== value) toast({ title: "이미지가 서버에 저장되었습니다." });
    } finally {
      setMirroring(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ImageIcon className="w-3.5 h-3.5 text-primary" />
          {label}
        </div>
      )}

      {/* 탭: 파일 / URL */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            mode === "file" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="w-3 h-3" /> 파일 업로드
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            mode === "url" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="w-3 h-3" /> URL 입력
        </button>
      </div>

      {mode === "url" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder ?? "https://example.com/image.jpg"}
              className="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-primary/20 bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {value && /^https?:\/\//i.test(value) && (
              <button
                type="button"
                onClick={handleMirror}
                disabled={mirroring}
                title="이 URL 이미지를 서버에 저장"
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {mirroring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                저장
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            외부 URL 입력 후 <strong>저장</strong> 버튼을 누르면 이미지를 서버에 보관합니다.
          </p>
        </div>
      ) : (
        <div>
          <label
            className={`flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              uploading
                ? "border-primary/30 bg-primary/5"
                : "border-primary/30 hover:border-primary hover:bg-primary/5"
            }`}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-primary/60" />
                <span className="text-xs text-muted-foreground">클릭하여 이미지 선택</span>
                <span className="text-[10px] text-muted-foreground/60">JPG, PNG, GIF, WEBP</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        </div>
      )}

      {/* 미리보기 */}
      {value && /^https?:\/\//.test(value) && (
        <div className="relative">
          <img
            src={value}
            alt="미리보기"
            className="w-full h-40 object-cover rounded-lg border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {value.includes("supabase") && (
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-bold">
              ✓ 서버 저장됨
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BlockEditor({
  blocks,
  onChange,
  adminPassword,
}: {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  adminPassword: string;
}) {
  const addBlock = () => onChange([...blocks, { imageUrl: "", content: "" }]);
  const removeBlock = (idx: number) => onChange(blocks.filter((_, i) => i !== idx));
  const updateBlock = (idx: number, field: keyof ContentBlock, value: string) =>
    onChange(blocks.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <div key={idx} className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary/70 uppercase tracking-wide">블록 {idx + 1}</span>
            {blocks.length > 1 && (
              <button type="button" onClick={() => removeBlock(idx)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <ImageInput
            value={block.imageUrl ?? ""}
            onChange={(url) => updateBlock(idx, "imageUrl", url)}
            adminPassword={adminPassword}
            label="🖼️ 이미지"
            placeholder="이미지 URL 또는 파일 업로드"
          />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Youtube className="w-3.5 h-3.5 text-red-500" />
              🎬 유튜브 URL
            </div>
            <input
              type="text"
              value={(block as any).youtubeUrl ?? ""}
              onChange={(e) => updateBlock(idx, "youtubeUrl" as keyof ContentBlock, e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... 또는 https://youtu.be/..."
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <AlignLeft className="w-3.5 h-3.5 text-primary" />
              📝 텍스트 내용
            </div>
            <textarea
              value={block.content ?? ""}
              onChange={(e) => updateBlock(idx, "content", e.target.value)}
              placeholder="이미지 아래에 들어갈 설명이나 내용을 입력하세요..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-y"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addBlock}
        className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary/70 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-medium text-sm"
      >
        <Plus className="w-4 h-4" /> 블록 추가 (이미지 + 텍스트 세트)
      </button>
    </div>
  );
}

interface Props {
  category: string;
  categoryLabel: string;
}

export function CreatePostDialog({ category, categoryLabel }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ imageUrl: "", content: "" }]);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const createPost = useCreatePost();
  const { toast } = useToast();
  const adminPassword = useAdminPw();

  const form = useForm<FormValues>({
    resolver: zodResolver(api.posts.create.input),
    defaultValues: {
      category,
      title: "",
      content: "",
      imageUrl: "",
    },
  });

  const handleClose = () => {
    setIsOpen(false);
    form.reset({ category, title: "", content: "", imageUrl: "" });
    setBlocks([{ imageUrl: "", content: "" }]);
    setThumbnailUrl("");
  };

  const onSubmit = (data: FormValues) => {
    const cleanedBlocks = blocks
      .map((b) => ({
        imageUrl: b.imageUrl?.trim() || undefined,
        content: b.content?.trim() || undefined,
        youtubeUrl: b.youtubeUrl?.trim() || undefined,
      }))
      .filter((b) => b.imageUrl || b.content || b.youtubeUrl);

    const firstText = cleanedBlocks.find((b) => b.content)?.content ?? "";

    createPost.mutate(
      {
        ...data,
        category, // prop에서 직접 사용 (hidden input 무시)
        imageUrl: thumbnailUrl || undefined,
        content: firstText,
        blocks: cleanedBlocks.length > 0 ? cleanedBlocks : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "게시글이 등록되었습니다.", description: "성공적으로 저장되었습니다." });
          handleClose();
        },
        onError: (err) => {
          toast({ title: "오류가 발생했습니다.", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 transition-all duration-200"
        data-testid="button-create-post"
      >
        <Pencil className="w-4 h-4" />
        글쓰기
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b bg-muted/30 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">새 글 작성</h2>
                  <p className="text-sm text-muted-foreground mt-1">[{categoryLabel}] 카테고리에 글을 작성합니다.</p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-full hover:bg-black/5 text-muted-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1">
                <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <input type="hidden" {...form.register("category")} />

                  {/* Title */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">제목</label>
                    <input
                      {...form.register("title")}
                      placeholder="게시글 제목을 입력하세요"
                      className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                    {form.formState.errors.title && (
                      <p className="text-sm text-destructive font-medium">{form.formState.errors.title.message}</p>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      대표 이미지
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(목록 썸네일 — 비워두면 본문 첫 이미지 사용)</span>
                    </label>
                    <ImageInput
                      value={thumbnailUrl}
                      onChange={setThumbnailUrl}
                      adminPassword={adminPassword}
                      placeholder="https://example.com/thumbnail.jpg"
                    />
                  </div>

                  {/* Blocks */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      본문 블록
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(이미지와 내용을 자유롭게 조합)</span>
                    </label>
                    <BlockEditor blocks={blocks} onChange={setBlocks} adminPassword={adminPassword} />
                  </div>
                </form>
              </div>

              {/* Footer */}
              <div className="p-6 border-t bg-muted/30 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl font-semibold text-foreground hover:bg-black/5 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  form="create-post-form"
                  disabled={createPost.isPending}
                  className="flex items-center justify-center min-w-[120px] px-6 py-3 rounded-xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {createPost.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "등록하기"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
