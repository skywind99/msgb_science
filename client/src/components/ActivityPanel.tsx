import { useState } from "react";
import { CalendarClock, ClipboardList, Info, Lock, MapPin, Users } from "lucide-react";
import { Toggle, type ActivityDraft } from "@/components/ActivityFields";
import { todayInKst } from "@shared/activity";

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

/**
 * AI 가 채울 수 있는 패널 칸. 보라색 표시도 이 이름으로 추적한다.
 * 모두 문자열 칸이라 비울 때 `""` 하나로 끝난다.
 */
export const AI_FILLED_FIELDS = [
  "date", "endDate", "startTime", "endTime",
  "location", "capacity", "applyStart", "applyDeadline", "applyNote",
] as const;

export type AiFilledField = (typeof AI_FILLED_FIELDS)[number];

/** `POST /api/ai/fill` 이 돌려주는 모양 중 패널이 쓰는 부분. */
export type AiDates = {
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  capacity: number | null;
  applyStart: string | null;
  applyDeadline: string | null;
  applyNote: string | null;
};

/**
 * AI 결과를 패널 상태로 옮긴다.
 *
 * **두 가지가 틀리기 쉽다.**
 *
 * 1) 종료 날짜를 정하는 길이 둘이라 겹치면 날이 하루 더 밀린다.
 *    `multiDay` 가 켜져 있으면 `endDate` 를 그대로 쓰고, 꺼져 있으면 종료 시각이
 *    시작보다 이를 때 **자동으로 +1일** 한다. 그래서 AI 가 `endDate` 를 줬다고
 *    무턱대고 토글을 켜지 않는다.
 *     - 밤을 넘기는 하루짜리 (12/19 20:00 ~ 12/20 01:00)
 *         → 토글 끔. 자동 +1 에 맡긴다. 요약에 "다음 날 01:00" 으로 나온다.
 *     - 진짜 여러 날 (4/2 ~ 4/3)
 *         → 토글 켬. `endDate` 를 그대로 넣는다.
 *
 * 2) **두 번째 AI 실행에서 지난 결과가 섞인다.** 새 안내문에 없는 칸은 채우지
 *    않으므로, 먼저 돌린 안내문의 장소·정원·신청 기간이 그대로 남는다. 두 행사의
 *    정보가 뒤섞인 글이 만들어진다. 그래서 **채우기 전에 `previouslyFilled`
 *    (아직 보라색인 칸)을 비운다.** 사용자가 직접 고친 칸은 보라색이 이미 풀려
 *    있으므로 그대로 남는다.
 *
 * 날짜를 못 읽었으면 날짜 관련 칸을 비운 채로 둔다. **사용자가 직접 켠 여러 날
 * 토글과 종료 날짜는 건드리지 않는다** — AI 가 날짜를 줬을 때만 그 판정을 한다.
 */
export function applyAiDates(
  base: ActivityPanelDraft,
  ai: Partial<AiDates>,
  /** 아직 보라색인 칸 = AI 가 채웠고 사용자가 안 고친 칸. 새로 채우기 전에 비운다. */
  previouslyFilled: ReadonlySet<AiFilledField> = new Set()
): { next: ActivityPanelDraft; filled: AiFilledField[] } {
  const next = { ...base };

  // 지난 AI 결과 지우기. 사용자가 고친 칸은 보라색이 풀려 있어 여기 들어오지 않는다.
  // (Set 을 직접 순회하지 않는 이유는 tsconfig 의 target 때문이다.)
  AI_FILLED_FIELDS.forEach((field) => {
    if (previouslyFilled.has(field)) next[field] = "";
  });
  // `endDate` 가 AI 가 채운 것이었다면 `multiDay` 도 AI 가 켠 것이다. 같이 되돌린다.
  if (previouslyFilled.has("endDate")) {
    next.multiDay = false;
    next.endDate = "";
  }

  const filled: AiFilledField[] = [];

  /**
   * 빈 칸에만 쓴다.
   *
   * 위에서 지난 AI 값을 비웠으므로, 이 시점에 값이 남아 있는 칸은
   * **사용자가 직접 넣었거나 고친 것**이다. 그건 덮지 않는다.
   */
  const put = <K extends AiFilledField>(key: K, value: string) => {
    if (!value) return;
    if (next[key]) return;
    next[key] = value as ActivityPanelDraft[K];
    filled.push(key);
  };

  const date = ai.date ?? "";
  const startTime = ai.startTime ?? "";
  const endTime = ai.endTime ?? "";

  /**
   * **날짜를 못 읽었으면 활동 정보를 아예 건드리지 않는다.**
   *
   * 날짜가 없는 글은 대개 활동 안내가 아니라 일반 공지다. 그런데 장소 한 줄이
   * 읽혔다고 신청 받기가 켜지면, 교사는 켠 적이 없는 신청 폼이 붙은 글을 보게 된다.
   * 더구나 활동 시작이 없으면 서버가 저장을 막아서 이유도 모른 채 등록이 안 된다.
   *
   * 제목과 본문은 호출하는 쪽에서 따로 채운다. 그건 날짜와 상관없이 쓸모가 있다.
   */
  if (!date) return { next, filled };

  put("date", date);
  put("startTime", startTime);
  put("endTime", endTime);

  // 종료 날짜 판정은 **날짜를 실제로 써 넣었을 때만** 한다.
  //  - AI 가 날짜를 못 읽었으면 사용자가 직접 켠 여러 날 토글을 건드리면 안 된다
  //  - 사용자가 날짜를 직접 넣어 둬서 건너뛴 경우에도 마찬가지다.
  //    AI 의 날짜로 판정하면 화면의 날짜와 어긋난 종료일이 들어간다
  if (filled.includes("date")) {
    const endDate = ai.endDate ?? "";
    if (endDate && endDate !== date) {
      // 하루 뒤 + 종료 시각이 더 이르면 자정을 넘긴 하루짜리다.
      // 이때 multiDay 를 켜면 "여러 날 활동" 으로 잘못 보이고, 끄면 자동 +1 이
      // 같은 결과를 만든다. 끄는 쪽이 맞다.
      const overnight =
        endDate === shiftDate(date, 1) && !!startTime && !!endTime && endTime < startTime;
      if (overnight) {
        next.multiDay = false;
        next.endDate = "";
      } else {
        next.multiDay = true;
        next.endDate = endDate;
        filled.push("endDate");
      }
    }
    // `endDate` 가 없으면 하루짜리다. 위에서 AI 가 켰던 것은 이미 되돌렸고,
    // 사용자가 직접 켠 여러 날은 그대로 남겨 둔다.
  }

  put("location", ai.location ?? "");
  put("capacity", ai.capacity == null ? "" : String(ai.capacity));
  put("applyStart", ai.applyStart ?? "");
  put("applyDeadline", ai.applyDeadline ?? "");
  put("applyNote", ai.applyNote ?? "");

  // 활동 정보가 하나라도 채워졌으면 신청 받기를 켠다. 안 켜면 화면에 안 보인다.
  if (filled.length > 0) next.applyEnabled = true;

  return { next, filled };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: string): string {
  const d = new Date(`${date}T00:00`);
  return Number.isNaN(d.getTime()) ? "" : WEEK[d.getDay()];
}

/**
 * 칸 하나를 바꾼 결과. 화면과 테스트가 같은 규칙을 쓰도록 순수 함수로 둔다.
 *
 * 날짜를 골랐는데 시작 시각이 비어 있으면 기본값을 넣는다. 비워 두면 서버가
 * "활동 일시를 입력해야 합니다" 로 막고, 무엇보다 **신청 마감을 비우면 활동
 * 시작이 곧 마감**이라 시각이 없는 채로 저장되면 안 된다. 바로 고칠 수 있다.
 */
export function applyFieldChange<K extends keyof ActivityPanelDraft>(
  value: ActivityPanelDraft,
  key: K,
  v: ActivityPanelDraft[K]
): ActivityPanelDraft {
  const next = { ...value, [key]: v };

  // **시각을 대신 정해 주지 않는다.** 신청 마감을 비우면 활동 시작이 곧 마감이라,
  // 임의로 넣은 시각이 교사가 의도하지 않은 접수 마감이 된다.
  // 비어 있으면 화면에서 채우라고 안내한다.
  return next;
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

/** AI 가 채운 칸. 교사가 눈으로 바로 가려낼 수 있어야 한다. */
const aiClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-violet-300 bg-violet-50 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all";

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
  aiFilled,
}: {
  value: ActivityPanelDraft;
  onChange: (next: ActivityPanelDraft) => void;
  /**
   * AI 가 채운 칸. 사용자가 고치면 호출하는 쪽에서 지운다.
   *
   * **AI 를 부르는 버튼은 여기 없다.** 입구는 글쓰기 화면 맨 위의 `AiFillCard`
   * 하나뿐이다. 이 패널은 결과를 보여주고 고치는 곳이다.
   */
  aiFilled?: ReadonlySet<AiFilledField>;
}) {
  // 마감 칩을 누를 수 없을 때 보여주는 안내. 입력하면 사라진다.
  const [chipError, setChipError] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const set = <K extends keyof ActivityPanelDraft>(key: K, v: ActivityPanelDraft[K]) => {
    if (key === "date" || key === "startTime") setChipError(false);
    onChange(applyFieldChange(value, key, v));
  };

  /** 그 칸이 AI 가 채운 것이면 보라색으로. 사용자가 고치면 호출하는 쪽에서 풀린다. */
  const cls = (field: AiFilledField) => (aiFilled?.has(field) ? aiClass : inputClass);

  // KST 기준으로 본다. 브라우저 시간대가 다를 수 있고, AI 가 연도를 잘못 집으면
  // 작년 날짜가 들어온다. 그때 눈에 띄게 하려는 것이다.
  const isPastDate = !!value.date && value.date < todayInKst();

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

          {aiFilled && aiFilled.size > 0 && (
            <p className="flex gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg p-2.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                보라색 칸은 <strong>AI가 채운 값</strong>이에요. 꼭 확인해 주세요.
                시각이 적혀 있지 않은 신청 기간은 00:00과 23:59로 넣었어요.
              </span>
            </p>
          )}

          <Field label="날짜 *">
            <input
              type="date"
              value={value.date}
              onChange={(e) => set("date", e.target.value)}
              className={cls("date")}
            />
            {/* 저장을 막지는 않는다. 지난 행사를 기록으로 올리는 경우가 있다.
                다만 AI 가 연도를 잘못 집었을 때 눈에 띄어야 한다. */}
            {isPastDate && (
              <p className="text-xs text-amber-700 font-medium">
                이미 지난 날짜예요. 연도를 확인해 주세요.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 *">
              <input
                type="time"
                value={value.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={cls("startTime")}
              />
            </Field>
            <Field label="종료" hint="(선택)">
              <input
                type="time"
                value={value.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                className={cls("endTime")}
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
                className={cls("endDate")}
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
                  className={`${cls("location")} pl-8`}
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
                  className={`${cls("capacity")} pl-8`}
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
              className={cls("applyStart")}
            />
          </Field>

          <Field label="신청 마감" hint="(비우면 활동 시작까지)">
            <input
              type="datetime-local"
              value={value.applyDeadline}
              onChange={(e) => set("applyDeadline", e.target.value)}
              className={cls("applyDeadline")}
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
            <span className="font-medium break-words">
              {summarize(value)}
              {/* 시각을 대신 정해 주지 않는다. 비어 있으면 채우라고 알린다. */}
              {value.date && !value.startTime && (
                <span className="block mt-1.5 font-bold text-amber-700">
                  시작 시각을 입력해 주세요.
                  {!value.applyDeadline && " 신청 마감을 비우면 이 시각에 접수가 닫힙니다."}
                </span>
              )}
            </span>
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
                    className={`${cls("applyNote")} resize-y`}
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
