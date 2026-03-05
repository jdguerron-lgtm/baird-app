// Set required environment variables before any module loads.
// These are dummy values — real API calls are mocked at the function level.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.WHATSAPP_PHONE_ID = 'test-phone-id'
process.env.WHATSAPP_API_TOKEN = 'test-api-token'
process.env.WHATSAPP_WEBHOOK_SECRET = 'test-webhook-secret'
process.env.NEXT_PUBLIC_APP_URL = 'https://test.baird.app'
