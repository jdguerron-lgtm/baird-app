import { ButtonProps } from '@/types/components'

export function Button({
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  onClick,
  children,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const variants = {
    primary: loading
      ? 'bg-gradient-to-r from-green-400 to-blue-400 cursor-not-allowed'
      : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:shadow-xl transform hover:-translate-y-0.5',
    secondary: loading
      ? 'bg-gray-400 cursor-not-allowed'
      : 'bg-gray-600 hover:bg-gray-700 hover:shadow-xl transform hover:-translate-y-0.5',
    danger: loading
      ? 'bg-red-400 cursor-not-allowed'
      : 'bg-red-600 hover:bg-red-700 hover:shadow-xl transform hover:-translate-y-0.5',
  }

  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`group relative ${widthClass} flex justify-center items-center py-3.5 px-4
        border border-transparent rounded-xl shadow-lg text-sm font-bold text-white
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
        focus:ring-green-500 ${variants[variant]}`}
    >
      {loading ? (
        <span className="flex items-center">
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          {typeof children === 'string' ? `${children}...` : children}
        </span>
      ) : (
        <span className="flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </span>
      )}
    </button>
  )
}
