import { downloadBlob } from './files'

type Cell = string | number | boolean | null | undefined
export type Sheet = { name: string; rows: Record<string, Cell>[] }

function csvEscape(v: Cell): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com separador ";" e BOM UTF-8 (abre corretamente no Excel em português). */
export function toCsv(rows: Record<string, Cell>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.map(csvEscape).join(';'), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(';'))].join('\r\n')
}

export function exportCsv(filename: string, rows: Record<string, Cell>[]) {
  downloadBlob(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

export async function exportXlsx(filename: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '': 'Sem dados' }]), s.name.slice(0, 31))
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}
