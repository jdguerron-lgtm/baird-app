import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
