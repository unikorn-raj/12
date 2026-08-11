import { GoogleGenAI } from "@google/genai";

export interface Env {
  GEMINI_API_KEY: string;
}

export function jsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function getGeminiClient(env: Env): GoogleGenAI {
  const apiKey = env?.GEMINI_API_KEY;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error(
      "GEMINI_API_KEY is missing from the Cloudflare Pages Function environment."
    );
  }

  return new GoogleGenAI({
    apiKey: apiKey.trim(),
  });
}

export function sanitizePromptInput(input: string): string {
  return String(input || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function cleanAndParseJson(text: string): any {
  if (!text || typeof text !== "string") {
    throw new Error("Gemini returned an empty response.");
  }

  let cleaned = text.trim();

  // Remove Markdown code fences if Gemini returns them.
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the outermost JSON object.
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);

      try {
        return JSON.parse(possibleJson);
      } catch {
        // Continue to the useful error below.
      }
    }

    throw new Error(
      `Gemini returned invalid JSON. Response begins with: ${cleaned.slice(0, 500)}`
    );
  }
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 3
) {
  let lastError = "Unknown Gemini API error";

  const requestedModel = options.model || "gemini-2.5-flash";

  const modelsToTry = Array.from(
    new Set([
      requestedModel,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ])
  );

  for (const modelName of modelsToTry) {
    let delay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(
          `Calling Gemini model ${modelName}, attempt ${attempt + 1}/${maxRetries}`
        );

        const response = await ai.models.generateContent({
          ...options,
          model: modelName,
        });

        return response;
      } catch (err: any) {
        const errStr = String(
          err?.message ||
          err?.error?.message ||
          err
        );

        lastError = errStr;

        console.error(
          `Gemini model ${modelName} failed:`,
          err
        );

        const status = Number(
          err?.status ||
          err?.code ||
          err?.error?.code ||
          0
        );

        const isTransient =
          status === 429 ||
          status === 500 ||
          status === 503 ||
          errStr.includes("429") ||
          errStr.includes("500") ||
          errStr.includes("503") ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.includes("UNAVAILABLE") ||
          errStr.includes("high demand") ||
          errStr.includes("Internal error");

        if (isTransient && attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 1.5;
          continue;
        }

        break;
      }
    }
  }

  // IMPORTANT:
  // Do not hide the real Gemini error.
  // This allows the Cloudflare Function response/logs to tell us
  // whether the problem is the key, permissions, quota, model, etc.
  throw new Error(`Gemini API error: ${lastError}`);
}
