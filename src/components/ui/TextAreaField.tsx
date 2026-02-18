import { TextAreaFieldProps } from '@/types/components'

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  error,
  rows = 4,
  icon,
  hint,
  disabled = false,
}: TextAreaFieldProps) {
  const borderColor = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-200 focus:ring-orange-500 hover:border-orange-300'

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {icon && <span className="flex items-center">{icon} {label}</span>}
        {!icon && label}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        className={`block w-full border-2 rounded-xl shadow-sm py-3 px-4 text-gray-900
          focus:outline-none focus:ring-2 focus:border-transparent
          transition-all sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed
          ${borderColor}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
