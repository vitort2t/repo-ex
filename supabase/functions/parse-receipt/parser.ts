// Interpretação de faturas com IA, através de um fornecedor configurável no servidor.
// A chave da API vive APENAS nos segredos da Edge Function (nunca no frontend).
//
// Variáveis de ambiente:
//   RECEIPT_AI_PROVIDER  = "anthropic" (por omissão)
//   ANTHROPIC_API_KEY    = chave da API da Anthropic (console.anthropic.com)
//   RECEIPT_AI_MODEL     = modelo (por omissão "claude-opus-5-5")
//
// Para usar outro fornecedor, implemente a interface ReceiptParser e
// registe-o em getParser().

import Anthropic from "@anthropic-ai/sdk";
import type { InventoryProduct, ParsedReceipt } from "../_shared/receipt-logic.ts";

export interface ReceiptParser {
  parse(file: { base64: string; mimeType: string }, inventory: InventoryProduct[]): Promise<ParsedReceipt>;
}

export class ParserError extends Error {
  constructor(message: string, public userMessage: string) {
    super(message);
  }
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

export const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["store_name", "store_tax_id", "document_number", "purchase_date", "total_paid", "total_discount",
             "payment_method", "items", "warnings"],
  properties: {
    store_name: nullable({ type: "string" }),
    store_tax_id: nullable({ type: "string" }),
    document_number: nullable({ type: "string" }),
    purchase_date: nullable({ type: "string" }),
    total_paid: nullable({ type: "number" }),
    total_discount: nullable({ type: "number" }),
    payment_method: nullable({ type: "string" }),
    warnings: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw_text", "name", "quantity", "unit", "unit_price", "line_total", "discount", "is_return",
                   "category_hint", "product_match_id", "match_confidence"],
        properties: {
          raw_text: { type: "string" },
          name: { type: "string" },
          quantity: nullable({ type: "number" }),
          unit: nullable({ type: "string", enum: ["un", "kg", "l"] }),
          unit_price: nullable({ type: "number" }),
          line_total: nullable({ type: "number" }),
          discount: nullable({ type: "number" }),
          is_return: { type: "boolean" },
          category_hint: nullable({ type: "string" }),
          product_match_id: nullable({ type: "string" }),
          match_confidence: nullable({ type: "number" }),
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `És um extrator de dados de faturas e talões de supermercados portugueses (Mercadona, Auchan, Continente, Pingo Doce, Lidl, Aldi, Intermarché e outros). Recebes a imagem ou o PDF de um talão e devolves os dados em JSON segundo o esquema.

Os dados vão atualizar o stock e as contas de uma família, por isso a exatidão é mais importante do que a completude: um valor em falta pode ser corrigido pela família, um valor inventado passa despercebido.

Regras:
- Transcreve apenas o que está impresso. Se um valor não estiver legível ou não existir, usa null e explica em "warnings". Nunca estimes quantidades ou preços.
- store_name: nome comercial da loja (ex.: "Mercadona", "Continente Bom Dia Matosinhos"). store_tax_id: NIF do vendedor, se visível.
- document_number: o código ATCUD se existir (ex.: "ATCUD:JJ4K3M-12345"); caso contrário o número da fatura/fatura simplificada.
- purchase_date no formato AAAA-MM-DD.
- total_paid: o total final da fatura ("TOTAL", "TOTAL A PAGAR"), depois de todos os descontos.
- items: uma entrada por artigo comprado, pela ordem do talão.
  - raw_text: o texto exatamente como aparece (ex.: "LEITE M/G 1L").
  - name: nome legível em português (ex.: "Leite meio-gordo 1L").
  - quantity: número de unidades; para artigos pesados, o peso em kg com unit "kg". Se a linha não mostrar quantidade e for um único artigo, usa 1.
  - unit_price: preço por unidade (ou por kg) apenas se estiver impresso ou se a linha mostrar explicitamente "quantidade x preço". Não dividas o total da linha por conta própria.
  - line_total: o valor final dessa linha, já com o desconto da própria linha. Devoluções e anulações têm line_total negativo e is_return true.
  - discount: valor (positivo) de desconto/promoção associado a essa linha, se existir. Linhas de desconto que se referem claramente ao artigo anterior não são artigos: junta-as a esse artigo (discount e line_total reduzido).
- total_discount: descontos globais que não pertencem a uma linha (talões, cupões, vales). Saldos acumulados em cartão que não reduzem o valor pago (ex.: "acumulou no cartão") não são descontos: menciona-os em warnings.
- Ignora linhas de IVA, subtotais, troco, meios de pagamento e publicidade como artigos. payment_method: "cartão", "dinheiro", "MB Way", etc., se visível.
- category_hint: uma categoria curta em português (ex.: "Leite e derivados", "Detergente da roupa").
- product_match_id: se o artigo for claramente o mesmo produto de uma entrada do inventário fornecido, indica o seu id; caso contrário null. match_confidence entre 0 e 1 (1 = certeza). Na dúvida usa um valor baixo — a família confirma.
- Verifica no fim se a soma de line_total menos total_discount coincide com total_paid; se não coincidir, explica a diferença em warnings em português.`;

class AnthropicReceiptParser implements ReceiptParser {
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  }

  async parse(file: { base64: string; mimeType: string }, inventory: InventoryProduct[]): Promise<ParsedReceipt> {
    const inventoryText = inventory.length
      ? inventory
          .map((p) => `${p.id} | ${p.name}${p.brand ? ` (${p.brand})` : ""}${p.aliases?.length ? ` | também: ${p.aliases.slice(0, 5).join("; ")}` : ""}`)
          .join("\n")
      : "(inventário vazio)";

    const fileBlock: Anthropic.Beta.BetaContentBlockParam =
      file.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } }
        : {
            type: "image",
            source: { type: "base64", media_type: file.mimeType as "image/jpeg" | "image/png" | "image/webp", data: file.base64 },
          };

    // Fallback no servidor em caso de recusa do modelo (beta server-side-fallback).
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RECEIPT_SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            { type: "text", text: `Inventário atual da casa (id | nome):\n${inventoryText}\n\nExtrai os dados deste talão.` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new ParserError("model refusal", "O serviço de leitura recusou este documento. Introduza os dados manualmente.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ParserError("max_tokens", "A fatura é demasiado longa para leitura automática. Introduza os dados manualmente.");
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      return JSON.parse(text) as ParsedReceipt;
    } catch {
      throw new ParserError("invalid json", "Não foi possível interpretar a resposta do serviço de leitura.");
    }
  }
}

export function getParser(env: (k: string) => string | undefined): ReceiptParser | null {
  const provider = (env("RECEIPT_AI_PROVIDER") ?? "anthropic").toLowerCase();
  if (provider === "anthropic") {
    const key = env("ANTHROPIC_API_KEY");
    if (!key) return null;
    return new AnthropicReceiptParser(key, env("RECEIPT_AI_MODEL") || "claude-opus-5-5");
  }
  return null;
}
