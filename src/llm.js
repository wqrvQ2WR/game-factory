// omniroute (로컬 OpenAI 호환 게이트웨이) 클라이언트.
// 기본: http://127.0.0.1:20128/v1  — 켜져 있지 않으면 조용히 절차적 폴백으로 넘어간다.

const BASE = (process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128/v1').replace(/\/$/, '');
const KEY = process.env.OMNIROUTE_API_KEY || '';

export const DEFAULT_MODEL = process.env.OMNIROUTE_MODEL || 'auto/fast';

export async function isUp(timeout = 2500) {
  try {
    const r = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(timeout), headers: hdr() });
    return r.ok;
  } catch {
    return false;
  }
}

function hdr() {
  const h = { 'Content-Type': 'application/json' };
  if (KEY) h.Authorization = `Bearer ${KEY}`;
  return h;
}

// omniroute는 stream 미지정 시 SSE로 흘려보내므로 둘 다 받아낸다.
export async function chat(messages, { model = DEFAULT_MODEL, maxTokens = 1400, temperature = 1, timeout = 120000 } = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: hdr(),
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens, temperature }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`omniroute ${res.status}: ${text.slice(0, 200)}`);

  if (text.startsWith('data:')) return { content: parseSse(text), model };
  const j = JSON.parse(text);
  return { content: j.choices?.[0]?.message?.content ?? '', model: j.model || model };
}

function parseSse(text) {
  let out = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      out += JSON.parse(payload).choices?.[0]?.delta?.content ?? '';
    } catch {}
  }
  return out;
}

// 모델이 코드펜스나 잡담을 붙여도 첫 JSON 객체를 뽑아낸다.
export function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}
