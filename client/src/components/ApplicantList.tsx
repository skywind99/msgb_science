import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import type { PublicPost, RosterEntry, RosterResponse } from "@shared/schema";
import { useAuthHeaders } from "@/contexts/admin";
import { useToast } from "@/hooks/use-toast";

/**
 * 교사용 신청자 명단.
 *
 * 개별 신청자가 화면에 나오는 유일한 곳이다. 담당 교사와 admin 만 서버를 통과한다.
 * 학생 정보를 다루므로 기본은 접힌 상태로 두고, 펼칠 때 불러온다.
 */

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * CSV 한 칸.
 *
 * `=` `+` `-` `@` 로 시작하는 값은 엑셀이 수식으로 해석한다. 학생이 남긴 말에
 * 그런 문자가 들어올 수 있으므로 앞에 작은따옴표를 붙여 글자로 고정한다.
 */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const STATUS_LABEL: Record<RosterEntry["status"], string> = {
  applied: "신청 확정",
  waitlisted: "대기",
};

function downloadCsv(roster: RosterResponse) {
  const header = ["학년", "반", "번호", "이름", "상태", "남긴 말", "신청일시"];
  const lines = [
    header.map(csvCell).join(","),
    ...roster.entries.map((e) =>
      [
        e.grade,
        e.classNo,
        e.studentNo,
        e.name,
        STATUS_LABEL[e.status],
        e.memo ?? "",
        fmtDateTime(e.createdAt),
      ]
        .map(csvCell)
        .join(",")
    ),
  ];

  // 앞의 BOM 이 없으면 엑셀이 한글을 깨서 연다.
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const safeTitle = roster.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50);
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}_명단_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ApplicantList({ post }: { post: PublicPost }) {
  const authHeaders = useAuthHeaders();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const rosterPath = buildUrl(api.roster.list.path, { id: post.id });

  // 펼칠 때만 불러온다. 명단을 굳이 미리 받아둘 이유가 없다.
  const { data: roster, isLoading, error } = useQuery<RosterResponse>({
    queryKey: [rosterPath],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(rosterPath, { headers: authHeaders });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "명단을 불러올 수 없습니다.");
      }
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [rosterPath] });
    queryClient.invalidateQueries({
      queryKey: ["/api/posts", post.id, "applications", "summary"],
    });
    queryClient.invalidateQueries({ queryKey: [api.applications.summaries.path] });
  };

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: RosterEntry["status"] }) => {
      const res = await fetch(buildUrl(api.roster.update.path, { id }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "상태를 바꾸지 못했습니다.");
      }
      return res.json();
    },
    onSuccess: refresh,
    onError: (err: Error) =>
      toast({ title: "변경하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.roster.remove.path, { id }), {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "삭제하지 못했습니다.");
      }
    },
    onSuccess: () => {
      setConfirmDelete(null);
      refresh();
      toast({ title: "신청을 삭제했습니다" });
    },
    onError: (err: Error) =>
      toast({ title: "삭제하지 못했습니다", description: err.message, variant: "destructive" }),
  });

  const counts = useMemo(() => {
    const entries = roster?.entries ?? [];
    return {
      applied: entries.filter((e) => e.status === "applied").length,
      waitlisted: entries.filter((e) => e.status === "waitlisted").length,
    };
  }, [roster]);

  const overCapacity =
    roster?.capacity != null && counts.applied > roster.capacity;

  return (
    <section className="rounded-2xl border-2 border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="w-4 h-4 text-primary" />
          신청자 명단
          <span className="font-normal text-muted-foreground">(교사만 보입니다)</span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive font-medium">{(error as Error).message}</p>
          )}

          {roster && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-foreground">
                  <span className="font-bold">신청 확정 {counts.applied}명</span>
                  {roster.capacity != null && (
                    <span className="text-muted-foreground"> / 정원 {roster.capacity}명</span>
                  )}
                  {counts.waitlisted > 0 && (
                    <span className="text-muted-foreground"> · 대기 {counts.waitlisted}명</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => downloadCsv(roster)}
                  disabled={roster.entries.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border text-xs font-bold hover:bg-muted/50 disabled:opacity-40 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  엑셀(CSV) 내려받기
                </button>
              </div>

              {overCapacity && (
                <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <TriangleAlert className="w-4 h-4 shrink-0" />
                  신청 확정이 정원을 넘었습니다. 의도한 것이면 그대로 두셔도 됩니다.
                </p>
              )}

              {roster.entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  아직 신청자가 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-semibold whitespace-nowrap">학년·반·번호</th>
                        <th className="py-2 pr-3 font-semibold whitespace-nowrap">이름</th>
                        <th className="py-2 pr-3 font-semibold whitespace-nowrap">상태</th>
                        <th className="py-2 pr-3 font-semibold">남긴 말</th>
                        <th className="py-2 pr-3 font-semibold whitespace-nowrap">신청일시</th>
                        <th className="py-2 font-semibold whitespace-nowrap">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.entries.map((e) => (
                        <tr key={e.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap font-medium">
                            {e.grade}-{e.classNo}-{e.studentNo}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap font-medium">{e.name}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                e.status === "applied"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {STATUS_LABEL[e.status]}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground break-words min-w-[8rem]">
                            {e.memo}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                            {fmtDateTime(e.createdAt)}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {confirmDelete === e.id ? (
                              <span className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => remove.mutate(e.id)}
                                  disabled={remove.isPending}
                                  className="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold disabled:opacity-40"
                                >
                                  삭제
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1 rounded-md border border-border text-[11px] font-bold"
                                >
                                  취소
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    changeStatus.mutate({
                                      id: e.id,
                                      status: e.status === "applied" ? "waitlisted" : "applied",
                                    })
                                  }
                                  disabled={changeStatus.isPending}
                                  className="px-2 py-1 rounded-md border border-border text-[11px] font-bold hover:bg-muted/50 disabled:opacity-40"
                                >
                                  {e.status === "applied" ? "대기로" : "확정으로"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(e.id)}
                                  aria-label="신청 삭제"
                                  className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                학생이 직접 취소하면 대기자가 자동으로 올라갑니다. 반면 선생님이 여기서
                삭제한 자리는 자동으로 채워지지 않습니다 — 필요하면 "확정으로"를 눌러
                직접 올려 주세요. 명단은 활동 종료 30일 후 자동으로 삭제됩니다.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
