import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/**
 * 맨 위줄 — 학교 이름과 오늘 날짜·시각.
 *
 * **1분마다만 갱신한다.** 초를 보여주지 않으므로 더 자주 돌 이유가 없고, TV 는
 * 하루 종일 켜져 있어서 1초 타이머가 86,400번 돈다.
 *
 * 다음 분이 시작할 때 맞춰 갱신한다 — 고정 60초 간격이면 "09:00" 이 09:00:59 에
 * 바뀌어 최대 59초 늦은 시각이 보인다.
 */
export function TvClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = new Date();
      setNow(current);
      // 다음 분 경계까지 남은 시간. 1초를 더해 경계를 확실히 넘긴다.
      const wait = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 1_000;
      timer = setTimeout(tick, wait);
    };

    const first = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 1_000;
    timer = setTimeout(tick, first);
    return () => clearTimeout(timer);
    // 처음 한 번만 세운다. `now` 를 의존성에 넣으면 갱신마다 타이머가 다시 생긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-baseline justify-between gap-8 px-12 pt-8 pb-5">
      <h1 className="text-[40px] font-black tracking-tight" style={{ color: "var(--tv-text)" }}>
        미사강변고등학교{" "}
        <span style={{ color: "var(--tv-accent)" }}>과학중점고</span>
      </h1>
      <div className="flex items-baseline gap-6 shrink-0">
        <span className="text-[28px] font-semibold" style={{ color: "var(--tv-dim)" }}>
          {format(now, "M월 d일 (EEE)", { locale: ko })}
        </span>
        <span className="text-[44px] font-black tabular-nums leading-none">
          {format(now, "HH:mm")}
        </span>
      </div>
    </div>
  );
}
