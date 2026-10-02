import { useState } from "react";
import { CalendarClock, ClipboardList, Info, Lock, MapPin, Users } from "lucide-react";
import { Toggle, type ActivityDraft } from "@/components/ActivityFields";

/**
 * 작성 화면 오른쪽 열 — 활동 신청 설정.
 *
 * 기존 `ActivityFields` 와 다른 점은 **일시를 입력받는 방식**뿐이다.
 * `datetime-local` 두 칸 대신 날짜 1개 + 시작/종료 시각으로 나눈다.
 * 교사가 실제로 쓰는 모양이 "10월 15일 14시~16시" 이기 때문이다.
 *
 * 저장할 때는 다시 하나로 합쳐 `ActivityDraft` 로 내보낸다
 * (`panelToDraft`). 그래서 `activityToPayload` 와 서버는 그대로다.
 *
 * 수정 화면은 아직 `ActivityFields` 를 쓴다. 거기서는 여러 날 활동을
 * `datetime-local` 로 직접 고칠 수 있다.
 */

export type ActivityPanelDraft = Omit<ActivityDraft, "eventStart" | "eventEnd"> & {
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm (선택)
  /** 켜면 종료 날짜 칸이 열린다. 수련회처럼 며칠에 걸친 활동. */
  multiDay: boolean;
  endDate: string; // yyyy-MM-dd (multiDay 일 때만)
};

export const emptyActivityPanel: ActivityPanelDraft = {
  applyEnabled: false,
  date: "",
  startTime: "",
  endTime: "",
  multiDay: false,
  endDate: "",
  location: "",
  capacity: "",
  applyStart: "",
  applyDeadline: "",
  applyNote: "",
  allowWaitlist: true,
  usePassword: false,
  applyPassword: "",
};

// ── 날짜 계산 ─────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** 날짜와 시각을 datetime-local 문자열로 합친다. 둘 중 하나라도 없으면 빈 문자열. */
function combine(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 종료 일시를 정한다.
 *
 * 여러 날 활동이면 종료 날짜를 그대로 쓴다.
 * 하루짜리인데 **종료 시각이 시작보다 이르면 자정을 넘긴 것**으로 보고
 * 다음 날로 계산한다. 그렇게 하지 않으면 서버가 "종료가 시작보다 빠르다" 로
 * 막는다 (20:00~01:00 같은 야간 관측 활동이 실제로 있다).
 */
function resolveEnd(p: ActivityPanelDraft): { endDate: string; crossesMidnight: boolean } {
  if (p.multiDay) return { endDate: p.endDate, crossesMidnight: false };
  if (!p.date || !p.endTime || !p.startTime) return { endDate: p.date, crossesMidnight: false };
  const crosses = p.endTime < p.startTime;
  return { endDate: crosses ? shiftDate(p.date, 1) : p.date, crossesMidnight: crosses };
}

/** 패널 상태를 기존 `ActivityDraft` 로 되돌린다. 저장 경로는 그대로 쓴다. */
export function panelToDraft(p: ActivityPanelDraft): ActivityDraft {
  const { endDate } = resolveEnd(p);
  const { date, startTime, endTime, multiDay, endDate: _ed, ...rest } = p;
  return {
    ...rest,
    eventStart: combine(date, startTime),
    eventEnd: combine(endDate, endTime),
  };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: string): string {
  const d = new Date(`${date}T00:00`);
  return Number.isNaN(d.getTime()) ? "" : WEEK[d.getDay()];
}

/** "10/15(목) 14:00~16:00 · 제2과학실 · 24명" */
export function summarize(p: ActivityPanelDraft): string {
  if (!p.date || !p.startTime) return "날짜와 시작 시각을 입력하면 여기에 요약됩니다.";

  const d = new Date(`${p.date}T00:00`);
  const head = `${d.getMonth() + 1}/${d.getDate()}(${weekday(p.date)}) ${p.startTime}`;

  let tail = "";
  if (p.endTime) {
    const { endDate, crossesMidnight } = resolveEnd(p);
    if (p.multiDay && endDate) {
      const e = new Date(`${endDate}T00:00`);
      tail = ` ~ ${e.getMonth() + 1}/${e.getDate()}(${weekday(endDate)}) ${p.endTime}`;
    } else if (crossesMidnight) {
      tail = ` ~ 다음 날 ${p.endTime}`;
    } else {
      tail = `~${p.endTime}`;
    }
  } else if (p.multiDay && p.endDate) {
    const e = new Date(`${p.endDate}T00:00`);
    tail = ` ~ ${e.getMonth() + 1}/${e.getDate()}(${weekday(p.endDate)})`;
  }

  const place = p.location.trim() ? ` · ${p.location.trim()}` : "";
  const cap = p.capacity.trim() ? ` · ${p.capacity.trim()}명` : " · 정원 제한 없음";
  return head + tail + place + cap;
}

// ── 작은 조각들 ───────────────────────────────────────────

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-foreground">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function GroupHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
      {icon}
      {children}
    </div>
  );
}

// ── 본체 ──────────────────────────────────────────────────

export function ActivityPanel({
  value,
  onChange,
}: {
  value: ActivityPanelDraft;
  onChange: (next: ActivityPanelDraft) => void;
}) {
  // 마감 칩을 누를 수 없을 때 보여주는 안내. 입력하면 사라진다.
  const [chipError, setChipError] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const set = <K extends keyof ActivityPanelDraft>(key: K, v: ActivityPanelDraft[K]) => {
    if (key === "date" || key === "startTime") setChipError(false);
    onChange({ ...value, [key]: v });
  };

  /** 신청 마감을 활동 시작 기준으로 채운다. 0 이면 시작 시각 그대로. */
  const fillDeadline = (daysBefore: number) => {
    if (!value.date || !value.startTime) {
      setChipError(true);
      return;
    }
    const date = daysBefore === 0 ? value.date : shiftDate(value.date, -daysBefore);
    onChange({ ...value, applyDeadline: combine(date, value.startTime) });
  };

  return (
    <aside className="lg:sticky lg:top-4 rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
      <Toggle
        checked={value.applyEnabled}
        onChange={(v) => set("applyEnabled", v)}
        label="활동 신청 받기"
        hint="학생 참가 신청을 받을 때만 켜세요."
      />

      {value.applyEnabled && (
        <div className="space-y-4 pt-4 border-t border-border">
          {/* 활동 정보 */}
          <GroupHeading icon={<CalendarClock className="w-3.5 h-3.5" />}>활동 정보</GroupHeading>

          <Field label="날짜 *">
            <input
              type="date"
              value={value.date}
              onChange={(e) => set("date", e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 *">
              <input
                type="time"
                value={value.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="종료" hint="(선택)">
              <input
                type="time"
                value={value.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Toggle
            checked={value.multiDay}
            onChange={(v) => set("multiDay", v)}
            label="여러 날 활동"
            hint="수련회처럼 며칠에 걸친 활동이면 켜세요."
          />

          {value.multiDay && (
            <Field label="종료 날짜">
              <input
                type="date"
                value={value.endDate}
                min={value.date || undefined}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="장소">
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={value.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="제2과학실"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
            <Field label="정원" hint="(비우면 제한 없음)">
              <div className="relative">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={value.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder="24"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
          </div>

          {/* 신청 기간 */}
          <div className="pt-1">
            <GroupHeading icon={<ClipboardList className="w-3.5 h-3.5" />}>신청 기간</GroupHeading>
          </div>

          <Field label="신청 시작" hint="(비우면 지금부터)">
            <input
              type="datetime-local"
              value={value.applyStart}
              onChange={(e) => set("applyStart", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="신청 마감" hint="(비우면 활동 시작까지)">
            <input
              type="datetime-local"
              value={value.applyDeadline}
              onChange={(e) => set("applyDeadline", e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fillDeadline(1)}
              className="px-3 py-1.5 rounded-full border-2 border-border bg-background text-xs font-semibold hover:border-primary hover:text-primary transition-colors"
            >
              활동 1일 전
            </button>
            <button
              type="button"
              onClick={() => fillDeadline(0)}
              className="px-3 py-1.5 rounded-full border-2 border-border bg-background text-xs font-semibold hover:border-primary hover:text-primary transition-colors"
            >
              활동 시작 시각
            </button>
          </div>

          {chipError && (
            <p className="text-xs text-destructive font-medium">
              활동 날짜와 시작 시각을 먼저 입력하세요.
            </p>
          )}

          {/* 요약 */}
          <div className="flex gap-2 items-start rounded-lg bg-primary/5 text-primary px-3 py-2.5 text-xs">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="font-medium break-words">{summarize(value)}</span>
          </div>

          {/* 추가 옵션 */}
          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              aria-expanded={optionsOpen}
              className="w-full text-left pt-3 text-xs font-bold text-foreground hover:text-primary transition-colors"
            >
              추가 옵션 {optionsOpen ? "접기" : "열기"}
            </button>

            {optionsOpen && (
              <div className="space-y-3 pt-3">
                <Toggle
                  checked={value.allowWaitlist}
                  onChange={(v) => set("allowWaitlist", v)}
                  label="정원이 차면 대기자로 받기"
                  hint="끄면 정원이 차는 즉시 신청이 막힙니다."
                />

                <Toggle
                  checked={value.usePassword}
                  onChange={(v) => set("usePassword", v)}
                  label="신청 비밀번호 사용"
                  hint="해당 학급에만 알려주면 사실상 그 반만 신청할 수 있습니다."
                />
                {value.usePassword && (
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={value.applyPassword}
                      onChange={(e) => set("applyPassword", e.target.value)}
                      placeholder="학급에 알려줄 비밀번호"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                )}

                <Field label="준비물 · 유의사항" hint="(선택)">
                  <textarea
                    value={value.applyNote}
                    onChange={(e) => set("applyNote", e.target.value)}
                    rows={2}
                    placeholder="실험복 지참, 점심 식사 후 집합 등"
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
