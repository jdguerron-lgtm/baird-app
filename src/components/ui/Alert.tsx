import { AlertProps } from '@/types/components'

export function Alert({ type, message, onClose }: AlertProps) {
  const styles = {
    success: 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border-green-200',
    error: 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border-red-200',
    warning: 'bg-gradient-to-r from-yellow-50 to-yellow-100 text-yellow-800 border-yellow-200',
    info: 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border-blue-200',
  }

  const icons = {
    success: '✓',
    error: '⚠',
    warning: '⚡',
    info: 'ℹ',
  }

  return (
    <div className={`p-4 mb-6 rounded-xl text-sm font-medium shadow-sm border ${styles[type]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-lg mr-2">{icons[type]}</span>
          {message}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-4 text-lg hover:opacity-70 transition-opacity"
            aria-label="Cerrar"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
