/**
 * 사진에서 글자 뽑기 — **브라우저 안에서만 처리한다.**
 *
 * 사진은 어디로도 전송되지 않는다. AI 공급자도, 우리 서버도 거치지 않는다.
 * 그래서 AI 키가 없어도 동작하고, 학생이 나온 사진에도 안전하다.
 *
 * **동적 import 인 이유**: tesseract.js 는 번들에 넣기에 크다. 이 버튼을 처음
 * 누를 때만 받아 오고, 안 쓰는 교사는 한 바이트도 받지 않는다.
 *
 * 다만 **첫 호출에 시간이 걸린다** — 워커와 wasm, 그리고 한국어 학습 데이터를
 * CDN 에서 내려받는다. 사진이 전송되는 것은 아니지만 네트워크 요청은 생기므로
 * 화면에 "처음 한 번은 준비에 시간이 걸려요" 를 띄운다.
 */

/** `Tesseract.createWorker` 가 돌려주는 것. 타입만 빌려 쓴다. */
type Worker = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<Worker> | null = null;

/**
 * 워커를 한 번만 만들고 재사용한다. 두 번째 사진부터는 준비 시간이 없다.
 * 실패하면 다음 시도에서 다시 만들 수 있도록 약속을 비운다.
 */
function getWorker(onProgress?: (ratio: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      // kor+eng — 한국어 안내문에 영어 낱말이 섞이는 일이 흔하다.
      return (await createWorker(["kor", "eng"], undefined, {
        logger: (m: { status?: string; progress?: number }) => {
          if (typeof m.progress === "number") onProgress?.(m.progress);
        },
      })) as unknown as Worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export type OcrResult = { ok: true; text: string } | { ok: false; message: string };

/**
 * 이미지 주소에서 글자를 뽑는다.
 *
 * 주소는 우리 Storage 든 외부든 상관없다 — 브라우저가 직접 읽는다.
 * 다만 CORS 가 막히면 읽을 수 없어서 그때는 안내를 돌려준다.
 */
export async function extractText(
  imageUrl: string,
  onProgress?: (ratio: number) => void
): Promise<OcrResult> {
  try {
    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(imageUrl);
    const text = data.text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return { ok: false, message: "사진에서 글자를 찾지 못했어요." };
    return { ok: true, text };
  } catch (err) {
    // 원인을 그대로 보여주면 교사가 알 수 없는 말이 뜬다.
    console.error("[ocr] 실패:", err);
    return {
      ok: false,
      message: "글자를 읽지 못했어요. 사진이 또렷한지 확인하고 다시 눌러 주세요.",
    };
  }
}

/** 화면을 떠날 때 정리. 워커는 브라우저 탭 하나에 하나면 충분하다. */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    (await pending).terminate();
  } catch {
    // 이미 끝났으면 무시한다.
  }
}
