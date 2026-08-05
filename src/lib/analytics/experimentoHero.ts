/**
 * Experimento A/B del hero móvil — "¿mostrar un técnico real?"
 *
 * QUÉ SE PRUEBA
 * En desktop el hero tiene el mockup de conversación de WhatsApp, que explica
 * el producto de un vistazo. Ese mockup es `hidden lg:flex`, así que en móvil
 * —de donde llega la mayoría del tráfico de Google Ads— el hero es solo texto
 * sobre la foto de fondo. La variante `b` llena ese hueco con la foto de un
 * técnico en la puerta de una casa.
 *
 * POR QUÉ ESA VARIANTE
 * La investigación de NN/g sobre fotos como contenido web es consistente en
 * que las imágenes decorativas se ignoran y las que cargan información —en
 * particular personas reales, no modelos de stock— sí se miran. Y en un
 * servicio a domicilio la pregunta que frena al cliente no es "¿lo arreglan
 * bien?" sino "¿quién entra a mi casa?". Los marketplaces del sector que se
 * pudieron inspeccionar (TaskRabbit, GetNinjas) ponen a la persona como
 * contenido del hero, no como fondo.
 *
 * CÓMO SE MIDE
 * La variante viaja como parámetro `hero_variante` en el evento GA4
 * `generate_lead` que dispara la pantalla de éxito de /solicitar. En GA4 se
 * compara la tasa de conversión de `a` vs `b` segmentando por móvil.
 *
 * DECISIONES DE IMPLEMENTACIÓN (importan para no sesgar el test)
 * - La asignación la hace un script inline en <head> ANTES del primer paint
 *   (ver `src/app/layout.tsx`), así que no hay parpadeo ni desajuste de
 *   hidratación: el HTML servido es idéntico para todos y solo cambia el
 *   atributo `data-hero` del <html>.
 * - La foto de la variante `b` se pinta con `background-image` desde una regla
 *   CSS que solo aplica bajo `[data-hero="b"]`. El navegador no descarga
 *   imágenes de reglas que no aplican, así que el grupo `a` NO paga esos 46 KB
 *   y su LCP queda limpio. Si se usara <Image> de Next, ambos grupos la
 *   descargarían y el test mediría peso, no diseño.
 * - La variante se persiste en localStorage para que el usuario vea siempre la
 *   misma y para que sobreviva al salto de la home a /solicitar, que es donde
 *   ocurre la conversión.
 */

export const HERO_STORAGE_KEY = 'baird_hero_variante'

export type HeroVariante = 'a' | 'b'

/**
 * Script que corre inline en <head>, antes de pintar. Se mantiene como string
 * a propósito: tiene que ejecutarse sincrónicamente, sin esperar al bundle de
 * React, o se vería el hero de la variante `a` durante un instante.
 *
 * Va envuelto en try/catch porque localStorage lanza en modo privado de
 * algunos navegadores y con cookies de terceros bloqueadas; si falla, cae a la
 * variante `a`, que es el hero actual.
 */
export const HERO_ASSIGN_SCRIPT = `
(function(){
  try {
    var k = '${HERO_STORAGE_KEY}';
    var v = localStorage.getItem(k);
    if (v !== 'a' && v !== 'b') {
      v = Math.random() < 0.5 ? 'a' : 'b';
      localStorage.setItem(k, v);
    }
    document.documentElement.setAttribute('data-hero', v);
  } catch (e) {
    document.documentElement.setAttribute('data-hero', 'a');
  }
})();
`.trim()

/**
 * Lee la variante asignada. Devuelve `null` en servidor o si el script inline
 * no alcanzó a correr, para que quien la reporte pueda omitir el parámetro en
 * vez de inventar un valor y ensuciar el análisis.
 */
export function getHeroVariante(): HeroVariante | null {
  if (typeof document === 'undefined') return null

  const v = document.documentElement.getAttribute('data-hero')
  return v === 'a' || v === 'b' ? v : null
}
