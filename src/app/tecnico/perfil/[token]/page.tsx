import { redirect } from 'next/navigation'

/**
 * /tecnico/perfil/{token} → /tecnico/{token}/perfil
 *
 * Existe solo porque los botones URL de las plantillas de WhatsApp (Meta)
 * exigen que el parámetro dinámico vaya AL FINAL de la URL (error 2388052
 * si va en medio). La plantilla `tecnico_actualizar_perfil_v1` apunta aquí
 * y esta ruta redirige a la página real del perfil del técnico.
 *
 * El segmento estático `perfil` gana sobre el dinámico `[token]` del nivel
 * padre, así que no colisiona con /tecnico/{token}.
 */
export default async function RedirectPerfilTecnico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  redirect(`/tecnico/${encodeURIComponent(token)}/perfil`)
}
