import React from 'react'
import { parsePhone } from '@/lib/utils/phone'

export { phoneToDigits } from '@/lib/utils/phone'

const COUNTRY_CODES = [
  { code: '57', label: 'CO +57', flag: '🇨🇴' },
  { code: '1', label: 'US +1', flag: '🇺🇸' },
  { code: '52', label: 'MX +52', flag: '🇲🇽' },
  { code: '34', label: 'ES +34', flag: '🇪🇸' },
  { code: '51', label: 'PE +51', flag: '🇵🇪' },
  { code: '593', label: 'EC +593', flag: '🇪🇨' },
  { code: '58', label: 'VE +58', flag: '🇻🇪' },
  { code: '56', label: 'CL +56', flag: '🇨🇱' },
  { code: '54', label: 'AR +54', flag: '🇦🇷' },
] as const

interface PhoneInputProps {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  error?: string
  icon?: React.ReactNode
  required?: boolean
}

export function PhoneInput({ label, name, value, onChange, error, icon, required }: PhoneInputProps) {
  const { countryCode, number } = parsePhone(value)

  const handleCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${e.target.value}|${number}`)
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, no spaces
    const clean = e.target.value.replace(/\D/g, '')
    onChange(`${countryCode}|${clean}`)
  }

  const borderColor = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-200 focus:ring-green-500 hover:border-green-300'

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {icon && <span className="flex items-center">{icon} {label}</span>}
        {!icon && label}
        {required && !icon && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="flex gap-2">
        <select
          value={countryCode}
          onChange={handleCodeChange}
          className={`border-2 rounded-xl shadow-sm py-3 px-2 text-gray-900 text-sm
            focus:outline-none focus:ring-2 focus:border-transparent transition-all
            ${borderColor} w-[110px] shrink-0`}
        >
          {COUNTRY_CODES.map(({ code, label: l, flag }) => (
            <option key={code} value={code}>{flag} {l}</option>
          ))}
        </select>
        <input
          type="tel"
          name={name}
          value={number}
          onChange={handleNumberChange}
          placeholder="3001234567"
          required={required}
          inputMode="numeric"
          className={`block w-full border-2 rounded-xl shadow-sm py-3 px-4 text-gray-900
            focus:outline-none focus:ring-2 focus:border-transparent
            transition-all sm:text-sm ${borderColor}`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
