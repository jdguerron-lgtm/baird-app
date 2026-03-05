import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail'; detail?: string }> = {}

  // 1. Supabase connection
  try {
    const { count, error } = await supabase
      .from('tecnicos')
      .select('id', { count: 'exact', head: true })

    checks.supabase = error
      ? { status: 'fail', detail: error.message }
      : { status: 'ok', detail: `${count ?? 0} tecnicos in DB` }
  } catch (e) {
    checks.supabase = {
      status: 'fail',
      detail: e instanceof Error ? e.message : 'Connection failed',
    }
  }

  // 2. WhatsApp env vars
  const waPhoneId = !!process.env.WHATSAPP_PHONE_ID
  const waToken = !!process.env.WHATSAPP_API_TOKEN

  checks.whatsapp = {
    status: waPhoneId && waToken ? 'ok' : 'fail',
    detail: [
      !waPhoneId && 'WHATSAPP_PHONE_ID missing',
      !waToken && 'WHATSAPP_API_TOKEN missing',
    ].filter(Boolean).join(', ') || undefined,
  }

  // 3. Gemini API key
  checks.gemini = {
    status: !!process.env.GEMINI_API_KEY ? 'ok' : 'fail',
    detail: !process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY not set' : undefined,
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok')

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  })
}
