// Web Speech API (SpeechRecognition) wrapper — ko-KR continuous mode.
// Chrome / Edge / Safari (webkit prefix) 지원. Firefox 미지원 → isSupported=false.
//
// 사용:
//   const { isSupported, listening, transcript, start, stop, reset } =
//     useVoiceRecognition({ lang: "ko-KR", onFinal: (t) => ... });
//
//   start()  — 음성 인식 시작 (마이크 권한 prompt)
//   stop()   — 명시적 중단
//   reset()  — transcript 초기화

import { useCallback, useEffect, useRef, useState } from "react";

// 표준 SpeechRecognition 또는 webkit 프리픽스
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
    length: number;
  }>;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceRecognitionOptions {
  lang?: string;
  // 최종 인식 결과 — 사용자가 잠시 멈춰서 한 utterance 가 완성된 시점에 호출.
  // 같은 세션 안에서 여러 번 호출될 수 있다 (continuous=true).
  onFinal?: (transcript: string) => void;
  // 중간 인식 결과 — 매 음성 frame 마다 갱신. UI live preview 용.
  onInterim?: (transcript: string) => void;
}

export interface UseVoiceRecognitionResult {
  isSupported: boolean;
  listening: boolean;
  // 마지막 final transcript (start 후 누적). reset() 으로 초기화.
  transcript: string;
  // 현재 interim (말 하는 도중) transcript.
  interim: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

export function useVoiceRecognition(
  options: UseVoiceRecognitionOptions = {},
): UseVoiceRecognitionResult {
  const { lang = "ko-KR", onFinal, onInterim } = options;
  const [isSupported, setIsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);

  useEffect(() => {
    onFinalRef.current = onFinal;
    onInterimRef.current = onInterim;
  }, [onFinal, onInterim]);

  useEffect(() => {
    const Ctor = getSpeechRecognition();
    setIsSupported(Ctor !== null);
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) {
      // 이미 활성. 무시.
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }
    setError(null);
    setInterim("");
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result || result.length === 0) continue;
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) {
        setTranscript((prev) => (prev ? prev + " " + finalText : finalText));
        onFinalRef.current?.(finalText);
      }
      if (interimText !== interim) {
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }
    };
    rec.onerror = (event) => {
      setError(event.error || "음성 인식 오류");
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      setInterim("");
    };
    rec.onstart = () => {
      setListening(true);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : "음성 인식 시작 실패");
      recognitionRef.current = null;
    }
  }, [lang, interim]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  // 컴포넌트 언마운트 시 인식 정지.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* noop */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isSupported,
    listening,
    transcript,
    interim,
    start,
    stop,
    reset,
    error,
  };
}
