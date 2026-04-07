import { InputFieldProps } from '@/types/components'

export function InputField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  icon,
  disabled = false,
  min,
  max,
  hint,
}: InputFieldProps) {
  const borderColor = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-200 focus:ring-green-500 hover:border-green-300'

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {icon && <span className="flex items-center">{icon} {label}</span>}
        {!icon && label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className={`block w-full border-2 rounded-xl shadow-sm py-3 px-4 text-gray-900
          focus:outline-none focus:ring-2 focus:border-transparent
          transition-all sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed
          ${borderColor}`}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
