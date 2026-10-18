import { useCallback, useEffect, useRef, useState } from "react";
import { indexAtElapsed, wrapIndex } from "@shared/homeViews";

/**
 * TV 화면의 타이머를 **한 곳에 모은다.**
 *
 * 뉴스 회전, 카드 회전, 매일 새벽 새로고침, 커서 숨김, Wake Lock, 키보드가 모두
 * 여기 있다. 흩어 두면 어느 `useEffect` 가 무엇을 정리하는지 알 수 없고, TV 는
 * 하루 종일 켜져 있어서 **타이머 하나만 새도 며칠 뒤에 드러난다.**
 *
 * ## 틱을 세지 않는다
 *
 * 인덱스를 `i + 1` 로 올리지 않고 **흐른 시간에서 계산한다**(`indexAtElapsed`).
 * 브라우저는 배경 탭의 `setInterval` 을 늦춘다(최소 1초, 절전 시 1분까지). 틱을
 * 세면 탭으로 돌아왔을 때 밀린 만큼 한꺼번에 넘어간다. 흐른 시간으로 구하면
 * **바로 맞는 자리**로 간다.
 *
 * 그래서 내부 타이머는 "다시 그릴 때" 를 알리는 역할만 한다. 1초마다 깨어나
 * 계산한 인덱스가 바뀌었으면 상태를 올린다 — 간격이 20초든 5초든 같은 코드다.
 */

/** 다시 계산하는 주기. 가장 짧은 회전 간격(2초)보다 촘촘해야 한다. */
const TICK_MS = 1000;

export type TvRotation = {
  newsIndex: number;
  cardOffset: number;
  paused: boolean;
  /** 다음 기사까지의 진행(0~1). 맨 아래 진행 줄이 쓴다. */
  progress: number;
};

/**
 * 활동 단계 판정에 쓰는 "지금". **1분마다만 새 객체를 만든다.**
 *
 * 회전 훅에서 떼어낸 이유는 **순서** 때문이다. 카드 목록은 이 값으로 단계를
 * 판정해야 하고, 회전 훅은 그 카드 수를 알아야 한다. 한 훅에 두면 서로를
 * 기다리게 된다.
 *
 * 매초 새 `Date` 를 만들면 이걸 의존성으로 쓰는 `useMemo` 가 매초 다시 돈다.
 */
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow((prev) =>
        Math.floor(prev.getTime() / 60_000) === Math.floor(Date.now() / 60_000)
          ? prev
          : new Date()
      );
    }, 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useTvRotation({
  newsCount,
  cardCount,
  newsSec,
  cardSec,
}: {
  newsCount: number;
  cardCount: number;
  newsSec: number;
  cardSec: number;
}): TvRotation & { pause: () => void; stepNews: (delta: number) => void } {
  const [state, setState] = useState<TvRotation>(() => ({
    newsIndex: 0,
    cardOffset: 0,
    paused: false,
    progress: 0,
  }));

  /**
   * 회전의 기준 시각. 일시정지하거나 손으로 기사를 넘기면 여기서 다시 센다.
   *
   * `ref` 에 두는 이유는 타이머 콜백이 **오래된 클로저를 잡지 않게** 하려는
   * 것이다. 상태로 두면 매번 타이머를 다시 세워야 한다.
   */
  const base = useRef({ at: Date.now(), news: 0, card: 0 });
  const pausedAt = useRef<number | null>(null);

  const newsMs = Math.max(1, newsSec) * 1000;
  const cardMs = Math.max(1, cardSec) * 1000;

  /** 지금 보여야 할 값을 계산해 상태에 반영한다. 바뀐 게 없으면 그대로 둔다. */
  const recompute = useCallback(() => {
    setState((prev) => {
      if (prev.paused) return prev;

      const elapsed = Date.now() - base.current.at;
      const newsIndex =
        newsCount > 0
          ? wrapIndex(base.current.news + indexAtElapsed(elapsed, newsMs, newsCount), newsCount)
          : 0;
      const cardOffset =
        cardCount > 0
          ? wrapIndex(base.current.card + indexAtElapsed(elapsed, cardMs, cardCount), cardCount)
          : 0;
      const progress = newsMs > 0 ? (elapsed % newsMs) / newsMs : 0;

      if (
        prev.newsIndex === newsIndex &&
        prev.cardOffset === cardOffset &&
        Math.abs(prev.progress - progress) < 0.01
      ) {
        return prev;
      }
      return { ...prev, newsIndex, cardOffset, progress };
    });
  }, [newsCount, cardCount, newsMs, cardMs]);

  // ── 회전 타이머 ──
  useEffect(() => {
    recompute();
    const timer = setInterval(recompute, TICK_MS);
    return () => clearInterval(timer);
  }, [recompute]);

  /**
   * 배경 탭에서 돌아왔을 때 **즉시** 맞춘다.
   *
   * 타이머가 늦춰져 있었으므로 다음 틱까지 기다리면 최대 1분 동안 옛 화면이
   * 보인다. 흐른 시간으로 계산하므로 한 번 부르면 바로 제자리로 간다.
   */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [recompute]);

  // ── 매일 새벽 4시 새로고침 ──
  useEffect(() => {
    /**
     * 하루에 한 번 통째로 새로 불러온다. 며칠 켜 두면 메모리가 쌓이고, 배포된 새
     * 코드도 받아야 한다. 새벽 4시는 아무도 안 보는 시간이다.
     */
    const next = new Date();
    next.setHours(4, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

    const timer = setTimeout(() => window.location.reload(), next.getTime() - Date.now());
    return () => clearTimeout(timer);
  }, []);

  // ── Wake Lock ──
  useEffect(() => {
    /**
     * 화면이 꺼지지 않게 잡아 둔다. **미지원이면 아무것도 하지 않는다** — TV
     * 브라우저마다 지원이 달라서, 없다고 화면이 멈추면 안 된다.
     *
     * 탭이 가려지면 브라우저가 잠금을 풀어 버린다. 돌아올 때 다시 요청한다.
     */
    type Sentinel = { released: boolean; release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.hidden || sentinel?.released === false) return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        // 사용자가 거부했거나 배터리 절약 중. 그냥 넘어간다.
      }
    };

    const onVisible = () => {
      if (!document.hidden) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  // ── 조작 ──
  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.paused) {
        // 멈춰 있던 시간만큼 기준을 뒤로 밀어, 재개할 때 이어서 돈다.
        if (pausedAt.current !== null) base.current.at += Date.now() - pausedAt.current;
        pausedAt.current = null;
        return { ...prev, paused: false };
      }
      pausedAt.current = Date.now();
      return { ...prev, paused: true };
    });
  }, []);

  /** 손으로 기사를 넘긴다. 기준을 지금으로 다시 잡아 바로 다음 20초가 시작된다. */
  const stepNews = useCallback(
    (delta: number) => {
      setState((prev) => {
        const next = newsCount > 0 ? wrapIndex(prev.newsIndex + delta, newsCount) : 0;
        base.current = { at: Date.now(), news: next, card: prev.cardOffset };
        pausedAt.current = prev.paused ? Date.now() : null;
        return { ...prev, newsIndex: next, progress: 0 };
      });
    },
    [newsCount]
  );

  return { ...state, pause, stepNews };
}

/**
 * 마우스가 3초 동안 움직이지 않으면 커서를 숨긴다.
 *
 * TV 에 PC 를 연결해 두면 커서가 화면 가운데에 남는다. 손대지 않는 화면이므로
 * 기본은 숨김에 가깝다. 움직이면 바로 돌아온다.
 */
export function useIdleCursor(ms = 3000): boolean {
  const [idle, setIdle] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };

    timer = setTimeout(() => setIdle(true), ms);
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, [ms]);

  return idle;
}
