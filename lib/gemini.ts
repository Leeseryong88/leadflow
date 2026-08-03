import "server-only";
import { FirebaseRestError } from "./firebase-server-rest";

export async function askGemini(prompt: string, schema?: Record<string, unknown>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new FirebaseRestError(503, "GEMINI_NOT_CONFIGURED", "Gemini API 환경 변수가 설정되지 않았습니다.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}) },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gemini API ${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

