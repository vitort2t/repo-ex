// Lógica pura partilhada entre a Edge Function (Deno) e a aplicação (browser).
// Sem dependências externas — testada com Vitest em app/src/shared.test.ts.

export type ParsedItem = {
  raw_text: string;
  name: string;
  quantity: number | null;
  unit: string | null; // 'un' | 'kg' | 'l'
  unit_price: number | null;
  line_total: number | null;
  discount: number | null;
  is_return: boolean;
  category_hint: string | null;
  product_match_id: string | null;
  match_confidence: number | null;
};

export type ParsedReceipt = {
  store_name: string | null;
  store_tax_id: string | null;
  document_number: string | null;
  purchase_date: string | null; // YYYY-MM-DD
  total_paid: number | null;
  total_discount: number | null;
  payment_method: string | null;
  items: ParsedItem[];
  warnings: string[];
};

export type InventoryProduct = {
  id: string;
  name: string;
  brand?: string | null;
  aliases?: string[] | null;
};

export function normText(t: string | null | undefined): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Abreviaturas frequentes nas faturas portuguesas.
const ABBREVIATIONS: Record<string, string> = {
  "m/g": "meio gordo",
  "mg": "meio gordo",
  "m.g": "meio gordo",
  "mgordo": "meio gordo",
  "m/gordo": "meio gordo",
  "magro": "magro",
  "desn": "desnatado",
  "uht": "",
  "emb": "",
  "c/": "com",
  "s/": "sem",
  "detg": "detergente",
  "deterg": "detergente",
  "det": "detergente",
  "liq": "liquido",
  "pap": "papel",
  "hig": "higienico",
  "iog": "iogurte",
  "iogurt": "iogurte",
  "nat": "natural",
  "agul": "agulha",
  "carol": "carolino",
  "frgo": "frango",
  "peit": "peito",
  "azeit": "azeite",
  "vg": "virgem",
  "xtra": "extra",
  "choc": "chocolate",
  "bol": "bolacha",
  "bolac": "bolachas",
  "cereal": "cereais",
  "amac": "amaciador",
  "lixiv": "lixivia",
  "maq": "maquina",
  "loica": "loica",
  "louca": "loica",
};

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "un", "x"]);

export function tokens(t: string): string[] {
  const n = normText(t)
    .replace(/(\d+(?:[.,]\d+)?)\s?(kg|g|gr|l|lt|ml|cl|un|uni|unid)\b/g, " ") // remover tamanhos
    .replace(/[^a-z0-9/ .]/g, " ");
  const out: string[] = [];
  for (const raw of n.split(/\s+/)) {
    const w = raw.replace(/\.$/, "");
    if (!w) continue;
    const exp = ABBREVIATIONS[w];
    const words = exp !== undefined ? exp.split(" ") : [w];
    for (const x of words) {
      const y = x.replace(/[/.]/g, "");
      if (y.length >= 2 && !STOP.has(y) && !/^\d+$/.test(y)) out.push(y);
    }
  }
  return out;
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let hits = 0;
  for (const x of a) {
    if (b.some((y) => y === x || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y)))) hits++;
  }
  // Fração de palavras do produto do inventário encontradas na linha (e vice-versa)
  const recallB = b.filter((y) => a.some((x) => x === y || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y)))).length / b.length;
  const precisionA = hits / a.length;
  return 0.6 * recallB + 0.4 * precisionA;
}

export type Match = { product_id: string; confidence: number; via: "alias" | "name" | "ai" };

/** Encontra o produto do inventário que melhor corresponde a uma linha da fatura. */
export function matchProduct(rawText: string, name: string | null, inventory: InventoryProduct[]): Match | null {
  const nRaw = normText(rawText);
  for (const p of inventory) {
    if ((p.aliases ?? []).some((a) => normText(a) === nRaw) || normText(p.name) === nRaw) {
      return { product_id: p.id, confidence: 1, via: "alias" };
    }
  }
  const lineTokens = Array.from(new Set([...tokens(rawText), ...tokens(name ?? "")]));
  let best: Match | null = null;
  for (const p of inventory) {
    const candidates = [p.name, ...(p.aliases ?? [])];
    let s = 0;
    for (const c of candidates) s = Math.max(s, tokenSimilarity(lineTokens, tokens(c)));
    if (!best || s > best.confidence) best = { product_id: p.id, confidence: Math.round(s * 1000) / 1000, via: "name" };
  }
  return best && best.confidence >= 0.45 ? best : null;
}

export const AUTO_MATCH_THRESHOLD = 0.8;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Validação e saneamento do resultado da IA (nunca inventar valores). */
export function sanitizeParsed(input: ParsedReceipt, inventory: InventoryProduct[]): ParsedReceipt {
  const ids = new Set(inventory.map((p) => p.id));
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const warnings = [...(input.warnings ?? [])];

  const items: ParsedItem[] = (input.items ?? []).map((it) => {
    let quantity = num(it.quantity);
    let unit_price = num(it.unit_price);
    const line_total = num(it.line_total);
    if (quantity !== null && quantity <= 0) quantity = null;
    // Só aceitar o preço unitário se for coerente com a quantidade e o total da linha.
    if (unit_price !== null && quantity !== null && line_total !== null) {
      const discount = num(it.discount) ?? 0;
      const expected = quantity * unit_price;
      if (Math.abs(expected - (line_total + Math.abs(discount))) > 0.02 && Math.abs(expected - line_total) > 0.02) {
        warnings.push(`Verificar "${it.name || it.raw_text}": ${quantity} × ${unit_price.toFixed(2)} € não corresponde a ${line_total.toFixed(2)} €.`);
      }
    }
    if (unit_price === null && quantity !== null && line_total !== null && quantity > 0 && Number.isInteger(quantity)) {
      unit_price = Math.round((line_total / quantity) * 10000) / 10000;
    }

    // Associação: correspondência determinística (aliases aprendidos) tem prioridade.
    const det = matchProduct(it.raw_text ?? "", it.name, inventory);
    const aiId = it.product_match_id && ids.has(it.product_match_id) ? it.product_match_id : null; // ignora IDs inventados
    const aiConf = aiId ? Math.max(0, Math.min(1, num(it.match_confidence) ?? 0.5)) : 0;
    let product_match_id: string | null = null;
    let match_confidence: number | null = null;
    if (det?.via === "alias") {
      product_match_id = det.product_id;
      match_confidence = 1;
    } else if (aiId) {
      product_match_id = aiId;
      match_confidence = det && det.product_id === aiId ? Math.max(aiConf, det.confidence) : aiConf;
    } else if (det) {
      product_match_id = det.product_id;
      match_confidence = det.confidence;
    }

    return {
      raw_text: String(it.raw_text ?? "").slice(0, 200),
      name: String(it.name ?? it.raw_text ?? "").slice(0, 120),
      quantity,
      unit: it.unit && ["un", "kg", "l"].includes(it.unit) ? it.unit : null,
      unit_price,
      line_total: line_total === null ? null : round2(line_total),
      discount: num(it.discount) === null ? null : round2(Math.abs(num(it.discount)!)),
      is_return: !!it.is_return,
      category_hint: it.category_hint ?? null,
      product_match_id,
      match_confidence,
    };
  });

  const date = input.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(input.purchase_date) ? input.purchase_date : null;
  if (!date) warnings.push("Não foi possível identificar a data da compra.");
  if (num(input.total_paid) === null) warnings.push("Não foi possível identificar o total pago.");
  if (items.some((i) => i.quantity === null)) warnings.push("Há artigos sem quantidade identificada.");
  if (items.some((i) => i.line_total === null)) warnings.push("Há artigos sem valor identificado.");

  return {
    store_name: input.store_name?.trim() || null,
    store_tax_id: input.store_tax_id?.trim() || null,
    document_number: input.document_number?.trim() || null,
    purchase_date: date,
    total_paid: num(input.total_paid) === null ? null : round2(num(input.total_paid)!),
    total_discount: num(input.total_discount) === null ? null : round2(Math.abs(num(input.total_discount)!)),
    payment_method: input.payment_method?.trim() || null,
    items,
    warnings: Array.from(new Set(warnings)),
  };
}

export type Reconciliation = {
  itemsTotal: number;
  globalDiscount: number;
  expected: number;
  totalPaid: number | null;
  difference: number | null;
  ok: boolean;
};

/**
 * Concilia a soma das linhas com o total da fatura.
 * line_total já inclui descontos de linha; o desconto global (talões, cupões)
 * é subtraído à parte.
 */
export function reconcile(
  items: { line_total: number | null; included?: boolean }[],
  totalPaid: number | null,
  globalDiscount: number | null = 0,
): Reconciliation {
  const itemsTotal = round2(items.filter((i) => i.included !== false).reduce((s, i) => s + (i.line_total ?? 0), 0));
  const gd = round2(Math.abs(globalDiscount ?? 0));
  const expected = round2(itemsTotal - gd);
  const difference = totalPaid === null ? null : round2(totalPaid - expected);
  return { itemsTotal, globalDiscount: gd, expected, totalPaid, difference, ok: difference !== null && Math.abs(difference) <= 0.01 };
}
