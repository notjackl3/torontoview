"use client";

import { useState, useCallback, useRef } from "react";

export type SpeechStatus = "idle" | "listening" | "done" | "error";

interface SpeechToTextResult {
  status: SpeechStatus;
  transcript: string;
  error: string;
  startListening: () => void;
  reset: () => void;
}

export function useSpeechToText(): SpeechToTextResult {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const reset = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
    setStatus("idle");
    setTranscript("");
    setError("");
  }, []);

  const startListening = useCallback(() => {
    setError("");
    setTranscript("");

    const SpeechRecognitionAPI =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) {
      setStatus("error");
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setStatus("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      if (result && result.isFinal) {
        const text = result[0].transcript.trim();
        if (!text || /^(um|uh|hmm|ah|er|like)$/i.test(text)) {
          setStatus("error");
          setError("I did not catch that. Try again.");
        } else {
          setTranscript(text);
          setStatus("done");
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setStatus("error");
      switch (event.error) {
        case "not-allowed":
          setError(
            "Microphone access was denied. Please allow microphone permissions.",
          );
          break;
        case "no-speech":
          setError("I did not catch that. Try again.");
          break;
        case "network":
          setError("Network error during speech recognition.");
          break;
        case "aborted":
          // User cancelled, no error to show
          setStatus("idle");
          break;
        default:
          setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // Only set idle if still in listening state (no result/error happened)
      setStatus((current) => (current === "listening" ? "error" : current));
      if (status === "listening") {
        setError("I did not catch that. Try again.");
      }
    };

    try {
      recognition.start();
    } catch (startError) {
      setStatus("error");
      setError("Failed to start speech recognition.");
    }
  }, []);

  return { status, transcript, error, startListening, reset };
}
