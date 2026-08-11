export async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 3
) {
  let delay = 1000;
  let lastError = "Unknown Gemini API error";

  const requestedModel = options.model || "gemini-2.5-flash";

  const modelsToTry = Array.from(
    new Set([
      requestedModel,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ])
  );

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await ai.models.generateContent({
          ...options,
          model: modelName,
        });

        return res;

      } catch (err: any) {
        const errStr = String(err?.message || err);

        lastError = errStr;

        console.error(
          `Gemini model ${modelName} failed:`,
          err
        );

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
          await new Promise((r) => setTimeout(r, delay));
          delay *= 1.5;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(`Gemini API error: ${lastError}`);
}
