// Tipos para componentes UI reutilizables

import React from 'react'

export interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  onClose?: () => void
}

export interface InputFieldProps {
  label: string
  name: string
  type?: 'text' | 'tel' | 'email' | 'number'
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
  error?: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SelectFieldProps {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: readonly string[] | string[]
  required?: boolean
  error?: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface TextAreaFieldProps {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  required?: boolean
  error?: string
  rows?: number
  icon?: React.ReactNode
  hint?: string
  disabled?: boolean
}

export interface ButtonProps {
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  fullWidth?: boolean
}
