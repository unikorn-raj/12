import { GoogleGenAI } from "@google/genai";

export interface Env {
  GEMINI_API_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

export function getGeminiClient(env: Env) {
  const apiKey = env?.GEMINI_API_KEY || (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please configure GEMINI_API_KEY in Cloudflare Pages Settings -> Environment Variables.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export function sanitizePromptInput(text: string): string {
  if (!text) return "";
  let clean = String(text);
  const dangerousPatterns = [
    /ignore (all )?(previous|above|system) instructions/gi,
    /disregard (all )?(previous|system) instructions/gi,
    /you are now a/gi,
    /system prompt/gi,
    /override security/gi,
    /reveal (api|key|secret|password|prompt|database)/gi,
    /jailbreak/gi,
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  ];
  for (const rx of dangerousPatterns) {
    clean = clean.replace(rx, "[SECURITY_FILTERED]");
  }
  return clean.replace(/```/g, "'''").trim();
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 3,
  maxTotalTimeMs = 80000
) {
  const startTime = Date.now();
  let delay = 1000;
  const requestedModel = options.model || "gemini-3.6-flash";
  const modelsToTry = Array.from(new Set([requestedModel, "gemini-3.6-flash"]));

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxTotalTimeMs) {
        const timeoutErr = new Error("GEMINI_TIMEOUT");
        (timeoutErr as any).isTimeout = true;
        throw timeoutErr;
      }

      const remainingTime = maxTotalTimeMs - elapsed;

      try {
        let timeoutHandle: any;
        const timerPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            const err = new Error("GEMINI_TIMEOUT");
            (err as any).isTimeout = true;
            reject(err);
          }, remainingTime);
        });

        const callPromise = ai.models.generateContent({
          ...options,
          model: modelName,
        });

        const res: any = await Promise.race([callPromise, timerPromise]);
        clearTimeout(timeoutHandle);
        return res;
      } catch (err: any) {
        if (err?.message === "GEMINI_TIMEOUT" || err?.isTimeout) {
          throw err;
        }

        const errStr = String(err?.message || err);
        const elapsedAfter = Date.now() - startTime;
        if (elapsedAfter >= maxTotalTimeMs) {
          const timeoutErr = new Error("GEMINI_TIMEOUT");
          (timeoutErr as any).isTimeout = true;
          throw timeoutErr;
        }

        const isTransient =
          err?.status === 503 ||
          err?.code === 503 ||
          err?.status === 500 ||
          err?.code === 500 ||
          err?.status === 429 ||
          err?.code === 429 ||
          errStr.includes("503") ||
          errStr.includes("500") ||
          errStr.includes("internal error") ||
          errStr.includes("UNAVAILABLE") ||
          errStr.includes("high demand") ||
          errStr.includes("429") ||
          errStr.includes("RESOURCE_EXHAUSTED");

        if (isTransient && attempt < maxRetries - 1) {
          if (elapsedAfter + delay >= maxTotalTimeMs) {
            console.warn(`Gemini API transient retry skipped due to deadline (${elapsedAfter}ms elapsed).`);
            const timeoutErr = new Error("GEMINI_TIMEOUT");
            (timeoutErr as any).isTimeout = true;
            throw timeoutErr;
          }
          console.warn(`Gemini API transient capacity notice (${errStr}). Retrying attempt ${attempt + 1}/${maxRetries} in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          delay *= 1.5;
        } else {
          console.warn(`Gemini model ${modelName} failed (attempt ${attempt + 1}/${maxRetries}): ${errStr}`);
          break;
        }
      }
    }
  }

  throw new Error("Gemini AI service unavailable. Please check GEMINI_API_KEY or try again shortly.");
}

export function cleanAndParseJson(text: string): any {
  if (!text) return {};

  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    try {
      const sanitized = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
      return JSON.parse(sanitized);
    } catch (secondErr) {
      console.error("cleanAndParseJson failed to parse:", secondErr);
      throw secondErr;
    }
  }
}
