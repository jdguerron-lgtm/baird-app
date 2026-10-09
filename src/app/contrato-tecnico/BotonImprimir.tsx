'use client'

export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
    >
      🖨️ Imprimir contrato para firma
    </button>
  )
}
