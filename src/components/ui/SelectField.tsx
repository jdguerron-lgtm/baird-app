import { SelectFieldProps } from '@/types/components'

export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  required = false,
  error,
  icon,
  disabled = false,
}: SelectFieldProps) {
  const borderColor = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-200 focus:ring-blue-500 hover:border-blue-300'

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {icon && <span className="flex items-center">{icon} {label}</span>}
        {!icon && label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={`block w-full bg-white border-2 rounded-xl shadow-sm py-3 px-4 text-gray-900
          focus:outline-none focus:ring-2 focus:border-transparent
          transition-all sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed
          ${borderColor}`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
