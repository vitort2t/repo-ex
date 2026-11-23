// Edge Function: parse-receipt
// POST { receipt_id }  (com o token do utilizador no cabeçalho Authorization)
//
// 1. Verifica que o utilizador pertence à casa da fatura (RLS com o token do utilizador).
// 2. Lê o ficheiro do Storage privado.
// 3. Interpreta-o com o serviço de IA configurado (chave apenas no servidor).
// 4. Valida e associa os artigos ao inventário.
// 5. Guarda as linhas em receipt_items e marca a fatura como "parsed".
// O stock NÃO é alterado aqui: só a função confirm_purchase o faz, após revisão.

import { createClient } from "@supabase/supabase-js";
import { sanitizeParsed, type InventoryProduct } from "../_shared/receipt-logic.ts";
import { getParser, ParserError } from "./parser.ts";

const MAX_BYTES = 15 * 1024 * 1024;

function cors(origin: string | null) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());
  const allow = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply(401, { error: "Sessão inválida. Entre novamente." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente com as permissões do utilizador (RLS aplica-se).
  const userDb = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  // Cliente de serviço — usado apenas para escrever o resultado depois de verificada a permissão.
  const adminDb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await userDb.auth.getUser();
  if (userErr || !userData.user) return reply(401, { error: "Sessão inválida. Entre novamente." });

  let receiptId: string;
  try {
    const body = await req.json();
    receiptId = String(body.receipt_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(receiptId)) throw new Error();
  } catch {
    return reply(400, { error: "Pedido inválido." });
  }

  // RLS garante que só membros da casa conseguem ler esta fatura.
  const { data: receipt, error: rErr } = await userDb.from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (rErr || !receipt) return reply(404, { error: "Fatura não encontrada." });
  if (receipt.status === "confirmed") return reply(409, { error: "Esta fatura já foi confirmada." });
  if (receipt.status === "discarded") return reply(409, { error: "Esta fatura foi descartada." });
  if (receipt.status === "processing" && Date.now() - new Date(receipt.updated_at).getTime() < 90_000) {
    return reply(409, { error: "Esta fatura já está a ser lida. Aguarde um momento." });
  }
  if (!receipt.file_path) return reply(400, { error: "A fatura não tem ficheiro associado." });

  const parser = getParser((k) => Deno.env.get(k));
  if (!parser) {
    return reply(503, {
      error: "A leitura automática ainda não está configurada. Pode introduzir os dados manualmente.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  await adminDb.from("receipts").update({ status: "processing", error: null }).eq("id", receiptId);

  try {
    const { data: file, error: fErr } = await userDb.storage.from("receipts").download(receipt.file_path);
    if (fErr || !file) throw new ParserError(`download: ${fErr?.message}`, "Não foi possível abrir o ficheiro da fatura.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new ParserError("too big", "O ficheiro é demasiado grande (máx. 15 MB).");
    const mimeType = receipt.mime_type ?? file.type ?? "image/jpeg";
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new ParserError(`mime ${mimeType}`, "Formato não suportado. Use PDF, JPEG ou PNG.");
    }

    const { data: products } = await userDb
      .from("products")
      .select("id, name, brand, aliases")
      .eq("household_id", receipt.household_id)
      .eq("archived", false)
      .order("name")
      .limit(800);
    const inventory = (products ?? []) as InventoryProduct[];

    const raw = await parser.parse({ base64: toBase64(bytes), mimeType }, inventory);
    const parsed = sanitizeParsed(raw, inventory);

    await adminDb.from("receipt_items").delete().eq("receipt_id", receiptId);
    if (parsed.items.length) {
      const { error: iErr } = await adminDb.from("receipt_items").insert(
        parsed.items.map((it, i) => ({
          receipt_id: receiptId,
          household_id: receipt.household_id,
          line_no: i + 1,
          raw_text: it.raw_text,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          line_total: it.line_total,
          discount: it.discount,
          is_return: it.is_return,
          category_hint: it.category_hint,
          product_id: it.product_match_id,
          match_confidence: it.match_confidence,
        })),
      );
      if (iErr) throw new ParserError(`insert items: ${iErr.message}`, "Não foi possível guardar os artigos lidos.");
    }

    await adminDb
      .from("receipts")
      .update({
        status: "parsed",
        store_name: parsed.store_name,
        document_number: parsed.document_number,
        purchase_date: parsed.purchase_date,
        total_paid: parsed.total_paid,
        parsed,
        error: null,
      })
      .eq("id", receiptId);

    let duplicates: unknown[] = [];
    if (parsed.store_name && parsed.purchase_date && parsed.total_paid !== null) {
      const { data } = await userDb.rpc("find_duplicate_purchases", {
        p_household: receipt.household_id,
        p_store_name: parsed.store_name,
        p_purchased_at: parsed.purchase_date,
        p_total: parsed.total_paid,
        p_document_number: parsed.document_number,
      });
      duplicates = data ?? [];
    }

    return reply(200, { receipt_id: receiptId, parsed, duplicates });
  } catch (e) {
    const userMessage = e instanceof ParserError ? e.userMessage : "Ocorreu um erro ao ler a fatura. Tente novamente ou introduza os dados manualmente.";
    console.error("parse-receipt failed", receiptId, e instanceof Error ? e.message : e);
    await adminDb.from("receipts").update({ status: "failed", error: userMessage }).eq("id", receiptId);
    return reply(502, { error: userMessage });
  }
});
