// Tipos das linhas da base de dados (espelham supabase/migrations).

export type Role = 'owner' | 'member'

export interface Profile { id: string; display_name: string; email: string | null }
export interface Household {
  id: string; name: string; currency: string
  budget_alert_thresholds: number[]; expiry_alert_days: number; created_at: string
}
export interface Member { household_id: string; user_id: string; role: Role; joined_at: string }
export interface Invite {
  id: string; household_id: string; email: string; token: string; created_at: string
  expires_at: string; accepted_at: string | null; revoked_at: string | null
}
export interface Category { id: string; household_id: string; grp: string; name: string; sort: number }
export interface Location { id: string; household_id: string; name: string; sort: number }

export interface Product {
  id: string; household_id: string; name: string; brand: string | null
  category_id: string | null; location_id: string | null; unit: string
  quantity: number; min_quantity: number; ideal_quantity: number; auto_restock: boolean
  package_size: number | null; package_unit: 'kg' | 'l' | 'un' | null
  last_price: number | null; avg_price: number | null
  last_in_at: string | null; last_out_at: string | null
  photo_path: string | null; notes: string | null; aliases: string[]; archived: boolean
  created_at: string; updated_at: string
}

export interface Lot { id: string; household_id: string; product_id: string; quantity: number; expires_on: string; created_at: string }

export type MovementReason = 'purchase' | 'gift' | 'correction' | 'initial' | 'consumption' | 'waste' | 'expired' | 'void'
export interface Movement {
  id: string; household_id: string; product_id: string; direction: 'in' | 'out'; quantity: number
  reason: MovementReason; note: string | null; occurred_at: string; purchase_id: string | null
  balance_after: number; user_id: string | null; created_at: string
}

export type ReceiptStatus = 'uploaded' | 'processing' | 'parsed' | 'failed' | 'confirmed' | 'discarded' | 'voided'
export interface Receipt {
  id: string; household_id: string; file_path: string | null; file_sha256: string | null; mime_type: string | null
  status: ReceiptStatus; store_name: string | null; document_number: string | null; purchase_date: string | null
  total_paid: number | null; parsed: unknown; error: string | null; uploaded_by: string | null
  created_at: string; updated_at: string
}
export interface ReceiptItem {
  id: string; receipt_id: string; line_no: number; raw_text: string | null; name: string | null
  quantity: number | null; unit: string | null; unit_price: number | null; line_total: number | null
  discount: number | null; is_return: boolean; category_hint: string | null
  product_id: string | null; match_confidence: number | null
}

export type StoreChain = 'mercadona' | 'auchan' | 'continente' | 'pingo_doce' | 'lidl' | 'aldi' | 'intermarche' | 'outros'
export interface Purchase {
  id: string; client_id: string; household_id: string; receipt_id: string | null
  store_name: string; store_chain: StoreChain; document_number: string | null; purchased_at: string
  total_paid: number; items_total: number | null; discount_total: number; payment_method: string | null
  status: 'confirmed' | 'voided'; void_reason: string | null; voided_at: string | null
  created_by: string | null; created_at: string
}
export interface PurchaseItem {
  id: string; purchase_id: string; product_id: string | null; category_id: string | null; name: string
  raw_text: string | null; quantity: number; unit_price: number | null; line_total: number; discount: number
  package_size: number | null; package_unit: string | null; add_to_stock: boolean
}

export interface ShoppingItem {
  id: string; list_id: string; household_id: string; product_id: string | null; custom_name: string | null
  quantity: number | null; source: 'auto' | 'manual'; status: 'open' | 'dismissed' | 'done'
  checked: boolean; checked_by: string | null; checked_at: string | null; note: string | null
  created_by: string | null; created_at: string
}

export interface Budget { id: string; household_id: string; month: string; amount: number }

export interface AppNotification {
  id: string; household_id: string; user_id: string | null; kind: string; title: string
  body: string | null; link: string | null; created_at: string
}

export interface PriceRow {
  id: string; product_id: string | null; name: string; purchased_at: string; store_name: string
  store_chain: StoreChain; quantity: number; unit_price: number; package_size: number | null
  package_unit: string | null; normalized_price: number | null
}

export interface AuditRow { id: number; user_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> | null; created_at: string }
