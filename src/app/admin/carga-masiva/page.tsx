'use client'

import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseExcelData, type ParsedRow } from '@/lib/utils/excel-mapping'
// formatCOP available if needed for price display
// import { formatCOP } from '@/lib/utils/format'

interface UploadResult {
  totalFilas: number
  validas: number
  invalidas: number
  insertadas: number
  erroresInsert: number
  notificados: number
  notifDiagnostico?: string[]
  detalles: { fila: number; success: boolean; id?: string; error?: string }[]
  filasInvalidas: { fila: number; nombre: string; errors: string[]; warnings: string[] }[]
}

interface DeleteResult {
  success: boolean
  eliminadas?: number
  mensaje?: string
  error?: string
}

export default function CargaMasivaPage() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<UploadResult | null>(null)
  const [notificar, setNotificar] = useState(false)
  const [defaultPago, setDefaultPago] = useState(80000)
  const [defaultHorario1, setDefaultHorario1] = useState('8:00 AM - 12:00 PM')
  const [defaultHorario2, setDefaultHorario2] = useState('2:00 PM - 5:00 PM')
  const [dragging, setDragging] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setArchivo(file)
    setResultado(null)
    setParseError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        const { parsed, totalRawRows } = parseExcelData(rows, {
          defaultPago,
          defaultHorario1,
          defaultHorario2,
        })

        if (totalRawRows === 0) {
          setParseError('No se encontraron datos válidos. Verifica que el archivo tenga formato BITÁCORA SERVICIOS PROGRAMADOS.')
          setPreview([])
          return
        }

        setPreview(parsed)
        setTotalRows(totalRawRows)
      } catch {
        setParseError('Error al leer el archivo Excel. Verifica que sea un .xlsx válido.')
        setPreview([])
      }
    }
    reader.readAsArrayBuffer(file)
  }, [defaultPago, defaultHorario1, defaultHorario2])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleSubmit = async () => {
    if (!archivo) return
    setEnviando(true)
    setResultado(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setParseError('Sesión expirada. Inicia sesión de nuevo.')
        setEnviando(false)
        return
      }

      const formData = new FormData()
      formData.append('file', archivo)
      formData.append('defaultPago', String(defaultPago))
      formData.append('defaultHorario1', defaultHorario1)
      formData.append('defaultHorario2', defaultHorario2)
      formData.append('notificar', String(notificar))

      const res = await fetch('/api/carga-masiva', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setParseError(data.error || 'Error al procesar el archivo')
      } else {
        setResultado(data as UploadResult)
      }
    } catch {
      setParseError('Error de conexión al servidor')
    }

    setEnviando(false)
  }

  const handleDeleteBatch = async () => {
    if (!resultado) return
    const ids = resultado.detalles.filter(d => d.success && d.id).map(d => d.id!)
    if (ids.length === 0) return

    setEliminando(true)
    setDeleteResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setDeleteResult({ success: false, error: 'Sesión expirada. Inicia sesión de nuevo.' })
        setEliminando(false)
        return
      }

      const res = await fetch('/api/carga-masiva', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ids }),
      })

      const data = await res.json()
      setDeleteResult(data as DeleteResult)
      if (data.success) {
        setResultado(null)
        setConfirmDelete(false)
      }
    } catch {
      setDeleteResult({ success: false, error: 'Error de conexión al servidor' })
    }

    setEliminando(false)
  }

  const validCount = preview.filter(r => r.mapped !== null).length
  const invalidCount = preview.filter(r => r.mapped === null).length

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Carga Masiva</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube archivos Excel con solicitudes de servicio en formato BITÁCORA
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <div className="text-4xl mb-3">📁</div>
        {archivo ? (
          <div>
            <p className="text-sm font-semibold text-slate-900">{archivo.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {(archivo.size / 1024).toFixed(1)} KB — Click o arrastra para cambiar
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Arrastra tu archivo Excel aquí
            </p>
            <p className="text-xs text-gray-400 mt-1">
              o haz click para seleccionar — Formato .xlsx o .xls
            </p>
          </div>
        )}
      </div>

      {/* Configuration */}
      {preview.length > 0 && !resultado && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Configuración de carga</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Valor del servicio (COP)
              </label>
              <input
                type="number"
                value={defaultPago}
                onChange={(e) => setDefaultPago(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificar}
                  onChange={(e) => setNotificar(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-slate-700">
                  Notificar técnicos por WhatsApp al cargar
                </span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Horario opción 1
              </label>
              <input
                type="text"
                value={defaultHorario1}
                onChange={(e) => setDefaultHorario1(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Horario opción 2
              </label>
              <input
                type="text"
                value={defaultHorario2}
                onChange={(e) => setDefaultHorario2(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{parseError}</p>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && !resultado && (
        <>
          {/* Summary bar */}
          <div className="mt-6 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-gray-700">
                <strong>{validCount}</strong> válidas
              </span>
            </div>
            {invalidCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-700">
                  <strong>{invalidCount}</strong> con errores
                </span>
              </div>
            )}
            <span className="text-xs text-gray-400">
              {totalRows} filas detectadas en el archivo
            </span>
          </div>

          {/* Preview table */}
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">#</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Estado</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Orden</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Cliente</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Teléfono</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Equipo</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Ciudad</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Zona</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Problema</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.mapped ? 'hover:bg-gray-50/50' : 'bg-red-50/50'}
                    >
                      <td className="px-4 py-3 text-xs text-gray-400">{row.fila}</td>
                      <td className="px-4 py-3">
                        {row.mapped ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                            OK
                          </span>
                        ) : (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 cursor-help"
                            title={row.errors.join(', ')}
                          >
                            Error
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono">{row.raw.orden}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">{row.raw.cliente_nombre}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.raw.telefono}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700">{row.raw.familia}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{row.raw.modelo}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {row.mapped?.ciudad_pueblo ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {row.mapped?.zona_servicio ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 truncate max-w-[250px]">
                          {row.raw.sintoma}
                        </p>
                        {row.errors.length > 0 && (
                          <p className="text-xs text-red-600 mt-1">{row.errors.join(' | ')}</p>
                        )}
                        {row.warnings.length > 0 && (
                          <p className="text-xs text-amber-600 mt-1">{row.warnings.join(' | ')}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit button */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={enviando || validCount === 0}
              className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {enviando ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Procesando...
                </span>
              ) : (
                `Cargar ${validCount} solicitud${validCount !== 1 ? 'es' : ''}`
              )}
            </button>
            {notificar && (
              <span className="text-xs text-amber-600 font-medium">
                Se notificarán técnicos por WhatsApp
              </span>
            )}
          </div>
        </>
      )}

      {/* Results */}
      {resultado && (
        <div className="mt-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-700">{resultado.totalFilas}</p>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total filas</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-green-700">{resultado.insertadas}</p>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Insertadas</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-red-700">
                {resultado.invalidas + resultado.erroresInsert}
              </p>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Errores</p>
            </div>
            {notificar && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="text-2xl font-bold text-purple-700">{resultado.notificados}</p>
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Notificados</p>
              </div>
            )}
          </div>

          {/* Notification diagnostic */}
          {notificar && resultado.notificados === 0 && resultado.notifDiagnostico && resultado.notifDiagnostico.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">No se notificaron técnicos</p>
              {resultado.notifDiagnostico.map((d, i) => (
                <p key={i} className="text-xs text-amber-700 mt-1">{d}</p>
              ))}
            </div>
          )}

          {/* Detail table */}
          {resultado.detalles.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-slate-900">Detalle de inserción</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Fila</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Estado</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">ID / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {resultado.detalles.map((d, i) => (
                      <tr key={i} className={d.success ? '' : 'bg-red-50/50'}>
                        <td className="px-4 py-2 text-xs text-gray-500">{d.fila}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            d.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {d.success ? 'Insertada' : 'Error'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 font-mono">
                          {d.success ? d.id : d.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid rows */}
          {resultado.filasInvalidas.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-800">Filas no procesadas</h3>
              </div>
              <div className="divide-y divide-red-50">
                {resultado.filasInvalidas.map((r, i) => (
                  <div key={i} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900">
                      Fila {r.fila}: {r.nombre || 'Sin nombre'}
                    </p>
                    {r.errors.map((e, j) => (
                      <p key={j} className="text-xs text-red-600 mt-0.5">{e}</p>
                    ))}
                    {r.warnings.map((w, j) => (
                      <p key={j} className="text-xs text-amber-600 mt-0.5">{w}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setArchivo(null)
                setPreview([])
                setResultado(null)
                setParseError(null)
                setDeleteResult(null)
                setConfirmDelete(false)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cargar otro archivo
            </button>

            {resultado.insertadas > 0 && !deleteResult?.success && (
              <>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-5 py-2 bg-red-50 text-red-700 text-sm font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    Deshacer carga ({resultado.insertadas})
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-medium">
                      Esto eliminara {resultado.insertadas} solicitud(es) y sus notificaciones
                    </span>
                    <button
                      onClick={handleDeleteBatch}
                      disabled={eliminando}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {eliminando ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          Eliminando...
                        </span>
                      ) : (
                        'Confirmar eliminacion'
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={eliminando}
                      className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Delete result */}
          {deleteResult && (
            <div className={`rounded-xl border p-4 ${
              deleteResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-sm font-medium ${
                deleteResult.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {deleteResult.success
                  ? deleteResult.mensaje
                  : deleteResult.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
