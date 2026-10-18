import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type PublicPost, type ContentBlock } from "@shared/schema";
import { api } from "@shared/routes";
import { splitLinks } from "@shared/linkify";
import {
  firstText,
  renderBlock,
  toContentBlocks,
  toEditorBlocks,
  type EditorBlock,
} from "@shared/postBlocks";
import { ActivityInfo } from "@/components/ActivityInfo";
import { ApplicantList } from "@/components/ApplicantList";
import { ImageInput } from "@/components/ImageInput";
import { PostBlockEditor } from "@/components/PostBlockEditor";
import {
  ActivityFields,
  activityFromPost,
  activityToPayload,
  emptyActivity,
  type ActivityDraft,
} from "@/components/ActivityFields";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Pencil, Trash2, MoreVertical, Bell } from "lucide-react";
import { YoutubeEmbed, isYoutubeUrl } from "@/components/YoutubeEmbed";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAdmin, useAuthHeaders } from "@/contexts/admin";
import { useCategories } from "@/hooks/use-categories";
import { planPopupRegister, postPopupLink } from "@shared/postLink";

// 이름과 돌아가기 주소는 `useCategories()` 에서 온다. 상수를 여기 두면 교사가
// 이름을 바꿔도 글 상세만 옛 이름으로 남는다.

/**
 * 글 안의 `http(s)://` 주소를 눌러 갈 수 있게 그린다.
 *
 * **`dangerouslySetInnerHTML` 을 쓰지 않는다.** 교사가 쓴 글이 그대로 HTML 이 되면
 * `<script>` 한 줄로 끝난다. React 요소로 만들면 글자는 늘 글자로 남는다.
 *
 * 어디서 끊을지는 `shared/linkify.ts` 가 정한다 (`http`/`https` 만, 뒤따르는
 * 문장 부호와 짝 없는 닫는 괄호는 떼어낸다). 줄바꿈은 바깥의
 * `whitespace-pre-wrap` 이 그대로 살린다.
 */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 break-all hover:opacity-80"
          >
            {part.value}
          </a>
        ) : (
          part.value
        )
      )}
    </>
  );
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // `isAdmin` 은 "로그인됨" 이다. 삭제 권한은 서버가 내려주는 `post.canDelete` 로 본다.
  const { isAdmin, user } = useAdmin();
  const { labelOf, routeOf } = useCategories();
  const authHeaders = useAuthHeaders();
  /** 로그인 신원. 캐시 키에 넣어야 `canDelete` 가 로그인 전 값으로 굳지 않는다. */
  const authKey = user?.id ?? "anon";

  const [editOpen, setEditOpen] = useState(false);
  const [popupRegistering, setPopupRegistering] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editBlocks, setEditBlocks] = useState<EditorBlock[]>([]);
  const [editActivity, setEditActivity] = useState<ActivityDraft>(emptyActivity);

  const { data: post, isLoading } = useQuery<PublicPost>({
    queryKey: ["/api/posts", id, authKey],
    queryFn: async () => {
      // 토큰을 보내야 서버가 `canDelete` 를 계산한다. 예전에는 헤더 없이 불러서
      // 로그인해도 삭제 권한을 알 수 없었다.
      const res = await fetch(`/api/posts/${id}`, { headers: authHeaders });
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
  });

  const authedFetch = async (method: string, url: string, data?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders },
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
    mutationFn: async (data: Record<string, unknown>) =>
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
      navigate(post ? routeOf(post.category) : "/");
    },
    onError: (err: Error) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });


  /** 알림을 놓치기 쉬워 성공은 더 길게 띄운다. 기본값은 Radix 의 5초다. */
  const SUCCESS_MS = 8000;
  /** 문구를 한 곳에 둔다. 교사 계정도 "관리" 안에 팝업 관리가 보인다. */
  const WHERE = "상단 '관리' 메뉴의 '팝업 관리'에서 확인하거나 끌 수 있어요.";

  /**
   * 이 글을 팝업으로 등록한다.
   *
   * **먼저 같은 글의 팝업이 있는지 본다.** 전에는 누를 때마다 새로 만들어서, 알림을
   * 못 본 교사가 다시 누르면 같은 팝업이 두 개 떴다. 방문자는 같은 안내를 두 번
   * 닫아야 한다.
   *
   * 꺼진 팝업과 켜진 팝업을 구분해 알린다 — "이미 있다" 만 말하면 등록했는데 왜 안
   * 뜨는지 알 수 없다.
   *
   * 판정은 `planPopupRegister` 가 한다(`shared/postLink.ts`). 글 번호를 정확히
   * 비교하므로 `/posts/1` 이 `/posts/12` 와 섞이지 않는다.
   */
  const registerAsPopup = async () => {
    if (!post) return;
    setPopupRegistering(true);
    try {
      // 1) 지금 있는 팝업 확인. 실패하면 중복 검사를 건너뛰지 않고 멈춘다 —
      //    모르는 채로 만들면 두 개가 될 수 있다.
      const listRes = await fetch("/api/admin/popups", { headers: authHeaders });
      if (!listRes.ok) {
        toast({
          title: "팝업 목록을 확인할 수 없어요.",
          description: "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }
      const popups = (await listRes.json()) as Array<{
        id: number;
        linkUrl: string | null;
        active: boolean;
      }>;

      const plan = planPopupRegister(popups, post.id);
      if (plan.action === "exists") {
        toast({
          title: "이미 이 글의 팝업이 등록되어 있어요.",
          description: WHERE,
          duration: SUCCESS_MS,
        });
        return;
      }
      if (plan.action === "disabled") {
        toast({
          title: "꺼져 있는 팝업이 있어요.",
          description: "팝업 관리에서 켜세요. 새로 만들지 않았습니다.",
          duration: SUCCESS_MS,
        });
        return;
      }

      // 2) 만든다. 주소는 **상대 경로**다 — `window.location.origin` 을 붙이면
      //    Preview 에서 등록할 때 Preview 주소가 박힌다(팝업은 운영 DB 에 있다).
      const body = {
        title: post.title,
        content: post.content?.slice(0, 200) || "",
        imageUrl: post.imageUrl || null,
        linkUrl: postPopupLink(post.id),
        linkLabel: "게시물 보기",
        active: true,
      };
      const res = await fetch("/api/admin/popups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({
          title: "팝업으로 등록되었습니다.",
          description: WHERE,
          variant: "success",
          duration: SUCCESS_MS,
        });
      } else {
        toast({ title: "팝업 등록에 실패했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setPopupRegistering(false);
    }
  };

  const openEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditImageUrl(post.imageUrl ?? "");
    // 예전 글은 한 블록에 이미지·유튜브·글이 같이 들어 있다. 종류별로 쪼개서
    // 보여주되 순서를 상세 페이지와 똑같이 유지한다 (shared/postBlocks.ts).
    setEditBlocks(toEditorBlocks(post.blocks as ContentBlock[] | null, post));
    setEditActivity(activityFromPost(post));
    setEditOpen(true);
  };

  const handleEditSubmit = () => {
    const cleanedBlocks = toContentBlocks(editBlocks);

    const payload = {
      title: editTitle,
      imageUrl: editImageUrl.trim() || undefined,
      blocks: cleanedBlocks.length > 0 ? cleanedBlocks : undefined,
      content: firstText(cleanedBlocks),
      ...activityToPayload(editActivity, "update"),
    };

    // 활동 일시·마감의 앞뒤 관계를 서버와 같은 규칙으로 미리 확인한다.
    const checked = api.posts.update.input.safeParse(payload);
    if (!checked.success) {
      toast({
        title: "입력을 확인해 주세요.",
        description: checked.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(checked.data);
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

  const backRoute = routeOf(post.category);
  const categoryLabel = labelOf(post.category);
  const postBlocks = post.blocks as ContentBlock[] | null;
  const displayBlocks: ContentBlock[] =
    postBlocks && postBlocks.length > 0
      ? postBlocks
      : [{ imageUrl: post.imageUrl ?? undefined, content: post.content || undefined }];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/8 via-background to-blue-50/40 border-b border-primary/10 pt-14 pb-10">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold mb-4">
                {categoryLabel}
              </span>
              <h1 className="text-2xl md:text-4xl font-black text-foreground leading-tight mb-3">
                {post.title}
              </h1>
              {/* 날짜 - 제목 아래 */}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {post.createdAt ? format(new Date(post.createdAt), "yyyy년 MM월 dd일") : ""}
              </div>
            </div>

            {/* 관리자 버튼 - 오른쪽 상단 */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 mt-1">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEdit}>
                    <Pencil className="w-4 h-4 mr-2" /> 수정
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={registerAsPopup} disabled={popupRegistering}>
                    <Bell className="w-4 h-4 mr-2" /> {popupRegistering ? "등록 중..." : "팝업으로 등록"}
                  </DropdownMenuItem>
                  {/* 삭제만 권한이 갈린다. 서버가 계산해 내려준 값으로 판단한다 —
                      화면이 authorId 와 비교하지 않는다(공개 응답에 없다). */}
                  {post.canDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> 삭제
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* 대표 이미지 */}
      {post.imageUrl && (
        <div className="max-w-3xl mx-auto px-4 pt-8">
          {/* 세로로 긴 안내문·포스터가 잘리지 않도록 원본 비율로 전체를 보여준다 */}
          <div className="rounded-2xl overflow-hidden border border-border shadow-md">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-auto"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        </div>
      )}

      {/* 활동 정보 — 본문보다 위에 둔다. 일시·마감이 가장 먼저 필요한 정보다. */}
      {post.applyEnabled && (
        <div className="max-w-3xl mx-auto px-4 pt-8 space-y-4">
          <ActivityInfo post={post} />
          {/* 명단은 교사에게만. 서버도 담당 교사·admin 만 통과시킨다. */}
          {isAdmin && <ApplicantList post={post} />}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* 본문 블록 */}
        <div className="space-y-8">
          {displayBlocks.map((block, idx) => {
            const { imgSrc, ytUrl, textContent } = renderBlock(block);
            // 블록이 없는 예전 글은 대표 이미지로 첫 블록을 만들어 쓴다.
            // 그때만 위쪽 대표 이미지와 겹치므로 본문 쪽을 건너뛴다.
            const skipImg = imgSrc && imgSrc === post.imageUrl && idx === 0 && !postBlocks;
            return (
              <div key={idx} className="space-y-4">
                {imgSrc && !skipImg && (
                  <div className="rounded-2xl overflow-hidden border border-border shadow-md">
                    <img
                      src={imgSrc}
                      alt=""
                      className="w-full h-auto"
                      data-testid={`img-block-${idx}`}
                    />
                  </div>
                )}
                {ytUrl && isYoutubeUrl(ytUrl) && (
                  <YoutubeEmbed url={ytUrl} />
                )}
                {textContent && (
                  <div className="prose prose-lg max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                    <LinkedText text={textContent} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 목록으로 - 본문 아래 */}
        <div className="mt-16 pt-8 border-t border-border">
          <button
            onClick={() => navigate(backRoute)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </button>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>게시물 수정</DialogTitle>
          </DialogHeader>
          {/* 활동 정보까지 들어가면 길어지므로 본문 영역만 스크롤한다 */}
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
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
                대표 이미지
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(목록 썸네일)</span>
              </Label>
              <ImageInput
                value={editImageUrl}
                onChange={setEditImageUrl}
                authHeaders={authHeaders}
                variant="compact"
              />
            </div>
            <div className="space-y-2">
              <Label>본문 블록</Label>
              <PostBlockEditor blocks={editBlocks} onChange={setEditBlocks} authHeaders={authHeaders} />
            </div>
            <div className="space-y-2">
              <Label>활동 신청</Label>
              <ActivityFields value={editActivity} onChange={setEditActivity} />
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
