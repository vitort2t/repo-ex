// Tradução dos erros técnicos para mensagens claras.
const MESSAGES: Record<string, string> = {
  NEGATIVE_STOCK: 'Não há unidades suficientes em stock.',
  FORBIDDEN: 'Não tem acesso a estes dados.',
  NOT_AUTHENTICATED: 'A sessão terminou. Entre novamente.',
  INVALID_QUANTITY: 'Indique uma quantidade maior que zero.',
  PRODUCT_NOT_FOUND: 'Produto não encontrado.',
  DUPLICATE_DOCUMENT: 'Esta fatura já foi registada (mesmo número de documento).',
  POSSIBLE_DUPLICATE: 'Já existe uma compra nesta loja, com a mesma data e o mesmo total.',
  RECEIPT_ALREADY_CONFIRMED: 'Esta fatura já foi confirmada.',
  RECEIPT_DISCARDED: 'Esta fatura foi descartada.',
  MISSING_STORE: 'Indique o supermercado.',
  MISSING_DATE: 'Indique a data da compra.',
  FUTURE_DATE: 'A data da compra não pode ser no futuro.',
  INVALID_TOTAL: 'Indique o total pago.',
  INVALID_ITEM_QUANTITY: 'Há artigos sem quantidade válida.',
  MISSING_ITEM_TOTAL: 'Há artigos sem valor.',
  INVITE_EMAIL_MISMATCH: 'Este convite foi enviado para outro e-mail. Entre com a conta desse e-mail.',
  INVITE_EXPIRED: 'Este convite expirou. Peça um novo convite.',
  INVITE_ALREADY_USED: 'Este convite já foi utilizado.',
  INVITE_NOT_FOUND: 'Convite não encontrado.',
  ONLY_OWNER_CAN_INVITE: 'Apenas quem criou a casa pode convidar membros.',
  INVALID_EMAIL: 'E-mail inválido.',
  PURCHASE_VOIDED: 'Esta compra foi anulada.',
  'Invalid login credentials': 'E-mail ou palavra-passe incorretos.',
  'Email not confirmed': 'Confirme o seu e-mail (verifique a caixa de entrada) antes de entrar.',
  'User already registered': 'Já existe uma conta com este e-mail.',
  'Failed to fetch': 'Sem ligação à internet.',
}

export function errorCode(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return msg
}

export function friendlyError(e: unknown): string {
  const msg = errorCode(e)
  for (const [k, v] of Object.entries(MESSAGES)) if (msg.includes(k)) return v
  if (/password/i.test(msg) && /6|characters|least/i.test(msg)) return 'A palavra-passe deve ter pelo menos 8 caracteres.'
  if (/network|fetch|offline/i.test(msg)) return 'Sem ligação à internet. Tente novamente.'
  return 'Algo correu mal. Tente novamente.'
}

export const isNetworkError = (e: unknown) => /Failed to fetch|NetworkError|network|Load failed|offline/i.test(errorCode(e))
