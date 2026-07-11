import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { error } = await supabase
      .from('tecnicos')
      .select('id', { count: 'exact', head: true })

    return NextResponse.json({
      status: error ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
    })
  }
}
