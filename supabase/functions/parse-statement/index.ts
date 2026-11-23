// Edge Function: parse-statement
// POST { path }  — lê um extrato bancário em PDF (Storage privado "finance-docs") e devolve
// os movimentos para revisão. NÃO grava movimentos: a confirmação é feita pelo utilizador
// (função SQL fin_import_movements), com deteção de duplicados.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "warnings"],
  properties: {
    warnings: { type: "array", items: { type: "string" } },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "amount"],
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
        },
      },
    },
  },
} as const;

const SYSTEM = `Extrais movimentos de extratos bancários portugueses (PDF) para JSON.
Regras:
- Uma entrada por movimento da conta, pela ordem do extrato. Ignora saldos, totais, cabeçalhos e publicidade.
- date no formato AAAA-MM-DD (data do movimento; se houver data-valor e data de movimento, usa a de movimento).
- description: o descritivo tal como aparece.
- amount: positivo para créditos (entradas), negativo para débitos (saídas). Nunca inventes valores; se uma linha estiver ilegível, omite-a e explica em warnings (em português).
- Não classifiques os movimentos (rendimento, despesa ou transferência): isso é decidido pela família.`;

function cors(origin: string | null) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());
  const allow = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });
  const auth = req.headers.get("Authorization");
  if (!auth) return reply(401, { error: "Sessão inválida. Entre novamente." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: uErr } = await db.auth.getUser();
  if (uErr || !u.user) return reply(401, { error: "Sessão inválida. Entre novamente." });

  let path = "";
  try { path = String((await req.json()).path ?? ""); } catch { /* */ }
  if (!/^[0-9a-f-]{36}\/extratos\/[0-9a-f-]{36}\.pdf$/i.test(path)) return reply(400, { error: "Pedido inválido." });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return reply(503, { error: "A leitura de PDF ainda não está configurada. Exporte o extrato em CSV no site do banco.", code: "AI_NOT_CONFIGURED" });

  // O download usa as permissões do utilizador: só membros da casa (1.º segmento do caminho) conseguem ler o ficheiro.
  const { data: file, error: fErr } = await db.storage.from("finance-docs").download(path);
  if (fErr || !file) return reply(404, { error: "Ficheiro não encontrado." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) return reply(400, { error: "O ficheiro é demasiado grande (máx. 15 MB)." });

  try {
    const client = new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 2 });
    const res = await client.beta.messages.create({
      model: Deno.env.get("RECEIPT_AI_MODEL") || "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } },
        { type: "text", text: "Extrai os movimentos deste extrato." },
      ] }],
    });
    if (res.stop_reason === "refusal") return reply(422, { error: "O serviço de leitura recusou este documento. Use o CSV do banco." });
    if (res.stop_reason === "max_tokens") return reply(422, { error: "O extrato é demasiado longo. Importe um período mais curto ou use o CSV." });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = JSON.parse(text) as { rows: { date: string; description: string; amount: number }[]; warnings: string[] };
    const rows = (parsed.rows ?? []).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amount) && r.amount !== 0)
      .map((r) => ({ date: r.date, description: String(r.description ?? "").slice(0, 160) || "Movimento", amount: Math.round(r.amount * 100) / 100 }));
    return reply(200, { rows, warnings: parsed.warnings ?? [] });
  } catch (e) {
    console.error("parse-statement failed", e instanceof Error ? e.message : e);
    return reply(502, { error: "Não foi possível ler o extrato. Tente novamente ou use o CSV do banco." });
  }
});
