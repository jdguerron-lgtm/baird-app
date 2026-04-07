'use client'

import { useState, useMemo } from 'react'

interface DateTimeSlotPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}

const SLOTS = [
  { label: 'Mañana', range: '8:00 AM - 12:00 PM' },
  { label: 'Tarde', range: '12:00 PM - 4:00 PM' },
  { label: 'Noche', range: '4:00 PM - 7:00 PM' },
] as const

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]
const SHORT_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatOutput(date: Date, slotRange: string) {
  const dayName = SHORT_DAYS[date.getDay()]
  const day = date.getDate()
  const month = SHORT_MONTHS[date.getMonth()]
  return `${dayName} ${day} ${month}, ${slotRange}`
}

export function DateTimeSlotPicker({ label, value, onChange, error, required }: DateTimeSlotPickerProps) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

  // Min date = tomorrow, max date = today + 30 days
  const minDate = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return d
  }, [today])

  const maxDate = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 30)
    return d
  }, [today])

  // Build calendar grid for current month (Monday-first)
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    // First day of month
    const firstDay = new Date(year, month, 1)
    // Day of week (0=Sun). Convert to Monday-first: Mon=0 ... Sun=6
    const startDow = (firstDay.getDay() + 6) % 7

    // Days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days: (Date | null)[] = []
    // Leading blanks
    for (let i = 0; i < startDow; i++) days.push(null)
    // Actual days
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))

    return days
  }, [currentMonth])

  const canGoPrev = useMemo(() => {
    const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    const lastDayPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)
    return lastDayPrev >= minDate
  }, [currentMonth, minDate])

  const canGoNext = useMemo(() => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    return nextMonth <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)
  }, [currentMonth, maxDate])

  function isDateEnabled(d: Date) {
    return d >= minDate && d <= maxDate
  }

  function handleDateClick(d: Date) {
    if (!isDateEnabled(d)) return
    setSelectedDate(d)
    setSelectedSlot(null)
  }

  function handleSlotClick(slotRange: string) {
    if (!selectedDate) return
    setSelectedSlot(slotRange)
    onChange(formatOutput(selectedDate, slotRange))
  }

  function handleClear() {
    setSelectedDate(null)
    setSelectedSlot(null)
    onChange('')
  }

  function goToPrevMonth() {
    if (!canGoPrev) return
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  function goToNextMonth() {
    if (!canGoNext) return
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      <div className={`border rounded-xl p-3 ${error ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={goToPrevMonth}
            disabled={!canGoPrev}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Mes anterior"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-800">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            disabled={!canGoNext}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Mes siguiente"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day names header */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />

            const enabled = isDateEnabled(day)
            const isSelected = selectedDate && toDateKey(day) === toDateKey(selectedDate)

            return (
              <button
                key={toDateKey(day)}
                type="button"
                disabled={!enabled}
                onClick={() => handleDateClick(day)}
                aria-label={`${day.getDate()} de ${MONTH_NAMES[day.getMonth()]} de ${day.getFullYear()}`}
                aria-pressed={isSelected || undefined}
                className={`
                  h-8 text-xs rounded-lg transition-all font-medium
                  ${!enabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : isSelected
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-green-50 hover:text-green-700 cursor-pointer'
                  }
                `}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>

        {/* Time slots */}
        {selectedDate && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              Franja horaria para el {selectedDate.getDate()} de {MONTH_NAMES[selectedDate.getMonth()]}:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SLOTS.map((slot) => (
                <button
                  key={slot.label}
                  type="button"
                  onClick={() => handleSlotClick(slot.range)}
                  className={`
                    py-2 px-1 rounded-lg text-xs font-medium border transition-all
                    ${selectedSlot === slot.range
                      ? 'bg-green-600 text-white border-green-600 shadow-sm'
                      : 'border-gray-200 text-gray-700 hover:border-green-300 hover:bg-green-50'
                    }
                  `}
                >
                  <div className="font-semibold">{slot.label}</div>
                  <div className={`text-[10px] mt-0.5 ${selectedSlot === slot.range ? 'text-green-100' : 'text-gray-400'}`}>
                    {slot.range}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected value display */}
        {value && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-green-700 font-medium">{value}</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
