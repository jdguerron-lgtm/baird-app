import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { TYC_VERSION, TARIFA_DIAGNOSTICO, ANTICIPO_PORCENTAJE } from '@/types/solicitud'
import { EMPRESA, TYC_FECHA } from '@/lib/constants/legal'

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Baird Service S.A.S',
  description: 'Términos y condiciones del servicio de Baird Service S.A.S, marketplace de reparación de electrodomésticos en Colombia.',
}

const cop = (n: number) => `COP $${n.toLocaleString('es-CO')}`

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="mb-3 text-xl font-semibold text-gray-800">{titulo}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

const lista = 'list-disc pl-6 space-y-1'
const enlace = 'text-blue-600 underline'

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Términos y Condiciones del Servicio</h1>
        <p className="mb-8 text-sm text-gray-500">
          Versión {TYC_VERSION} · Última actualización: {TYC_FECHA}
        </p>

        <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <strong>Aceptación:</strong> al marcar la casilla de aceptación al solicitar un servicio, o al confirmar el
            horario de tu servicio en la plataforma, declaras que has leído, entendido y aceptado en su totalidad los
            presentes Términos y Condiciones y la{' '}
            <Link href="/politica-privacidad" className="underline">Política de Privacidad y Tratamiento de Datos</Link>.
            Si eres técnico, tu relación con Baird Service se rige además por el{' '}
            <Link href="/contrato-tecnico" className="underline">Contrato de Prestación de Servicios para Técnicos</Link>.
          </p>
        </section>

        <nav aria-label="Contenido" className="mb-10 rounded-lg border border-gray-200 p-4 text-sm">
          <p className="mb-2 font-semibold text-gray-800">Documentos legales</p>
          <ul className="space-y-1">
            <li><Link href="/terminos" className={enlace}>Términos y Condiciones (esta página)</Link></li>
            <li><Link href="/politica-privacidad" className={enlace}>Política de Privacidad y Tratamiento de Datos</Link></li>
            <li><Link href="/contrato-tecnico" className={enlace}>Contrato de Prestación de Servicios para Técnicos</Link></li>
            <li><Link href="/eliminacion-datos" className={enlace}>Solicitud de eliminación de datos</Link></li>
          </ul>
        </nav>

        <Seccion id="identificacion" titulo="1. Identificación de la empresa">
          <p>
            La plataforma es operada por <strong>{EMPRESA.razonSocial}</strong>, sociedad comercial colombiana
            identificada con NIT <strong>{EMPRESA.nit}</strong>, con domicilio en {EMPRESA.domicilio}. Teléfono{' '}
            {EMPRESA.telefono} · WhatsApp {EMPRESA.whatsappSoporte} · Correo {EMPRESA.emailPqrs}. En adelante
            &quot;Baird Service&quot; o &quot;la plataforma&quot;.
          </p>
        </Seccion>

        <Seccion id="objeto" titulo="2. Objeto y descripción del servicio">
          <p>
            Baird Service opera como <strong>intermediario tecnológico (marketplace)</strong> que conecta a clientes
            que requieren diagnóstico y reparación de electrodomésticos de línea blanca con técnicos independientes
            verificados. Los servicios de reparación son ejecutados por técnicos independientes vinculados mediante
            contrato de prestación de servicios de naturaleza civil (artículos 1602 y siguientes del Código Civil),
            sin relación laboral con Baird Service. Baird Service coordina la solicitud, la asignación, la
            comunicación por WhatsApp, el cobro y la garantía del servicio en los términos aquí descritos.
          </p>
          <p>
            La plataforma atiende dos modalidades: <strong>servicios bajo garantía</strong> del fabricante o aliado
            comercial, y <strong>servicios particulares</strong> pagados por el cliente.
          </p>
        </Seccion>

        <Seccion id="usuario" titulo="3. Del usuario y aceptación de los términos">
          <p>
            Es usuario toda persona que accede a la plataforma, solicita un servicio (cliente) o se registra para
            prestarlos (técnico). El usuario debe ser mayor de edad y suministrar información veraz, completa y
            actualizada. Se entiende que el cliente acepta estos Términos cuando:
          </p>
          <ul className={lista}>
            <li>Marca la casilla de aceptación al enviar la solicitud de servicio.</li>
            <li>Confirma uno de los horarios propuestos vía WhatsApp o en la página de agendamiento.</li>
            <li>Aprueba la cotización en servicios particulares (no garantía).</li>
          </ul>
          <p>
            La versión aceptada y la fecha de aceptación quedan registradas en la plataforma como prueba de la
            aceptación.
          </p>
        </Seccion>

        <Seccion id="acceso" titulo="4. Acceso y navegación">
          <p>
            El acceso a la plataforma es gratuito. Algunas funciones se habilitan mediante enlaces únicos enviados
            por WhatsApp (por ejemplo, agendamiento, aprobación de cotización o confirmación del servicio). Estos
            enlaces son personales: el usuario es responsable de no compartirlos y de la actividad realizada con
            ellos. Baird Service puede actualizar, suspender temporalmente o modificar funcionalidades de la
            plataforma por razones técnicas, de seguridad o de mejora del servicio.
          </p>
        </Seccion>

        <Seccion id="pagos" titulo="5. Régimen de pagos — Cláusula esencial">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">
              ⚠️ NINGÚN pago se realiza directamente al técnico ni en efectivo en el sitio de la visita.
            </p>
          </div>
          <p>
            <strong>Servicios bajo garantía:</strong> el costo total del servicio (mano de obra y repuestos cubiertos)
            es asumido por el fabricante o el aliado comercial correspondiente. El cliente <strong>no paga ningún
            valor</strong> a Baird Service ni al técnico.
          </p>
          <p>
            <strong>Servicios particulares (no garantía):</strong> el cliente paga a Baird Service exclusivamente a
            través de los medios de pago habilitados en la plataforma. La <strong>tarifa de diagnóstico</strong> es de{' '}
            {cop(TARIFA_DIAGNOSTICO)} (IVA incluido), con un anticipo del {Math.round(ANTICIPO_PORCENTAJE * 100)}% (
            {cop(TARIFA_DIAGNOSTICO * ANTICIPO_PORCENTAJE)}) requerido para reservar la visita. Este valor se acredita
            al total del servicio si el cliente aprueba la cotización. Baird Service expide la factura electrónica
            correspondiente.
          </p>
          <p>
            Cualquier intento del técnico de cobrar al cliente directamente, en efectivo, por transferencia personal o
            por fuera de los canales oficiales constituye violación de estos Términos y debe reportarse a Baird
            Service.
          </p>
        </Seccion>

        <Seccion id="procedimiento" titulo="6. Procedimiento de servicio">
          <ol className="list-decimal pl-6 space-y-1">
            <li><strong>Solicitud:</strong> el cliente registra su solicitud con la descripción del problema.</li>
            <li><strong>Horario:</strong> el cliente confirma una franja horaria para la visita.</li>
            <li><strong>Asignación:</strong> el primer técnico verificado que acepte libremente la solicitud queda asignado.</li>
            <li><strong>Diagnóstico:</strong> el técnico realiza el diagnóstico en sitio y lo registra en la plataforma.</li>
            <li><strong>Aprobación:</strong> el cliente aprueba en la plataforma el siguiente paso (reparación, espera de repuesto o cierre sin reparación).</li>
            <li><strong>Ejecución:</strong> el técnico procede únicamente con la acción aprobada.</li>
            <li><strong>Cierre:</strong> el cliente confirma el servicio en la plataforma.</li>
          </ol>
        </Seccion>

        <Seccion id="verificacion" titulo="7. Verificación obligatoria post-diagnóstico">
          <p>
            Tras el diagnóstico, <strong>el cliente debe verificar y aceptar dentro de la plataforma</strong> la
            siguiente acción a ejecutar. Sin esta verificación el técnico no está autorizado a continuar. Si el
            técnico realiza el servicio sin la verificación del cliente: (i) incumple gravemente estos Términos y su
            contrato; (ii) su cuenta podrá ser bloqueada de forma permanente; (iii) el trabajo no tendrá cobertura de
            garantía por parte de Baird Service; y (iv) Baird Service podrá iniciar las acciones legales por
            incumplimiento contractual.
          </p>
        </Seccion>

        <Seccion id="garantia" titulo="8. Garantía">
          <p>
            <strong>Garantía legal.</strong> Conforme a los artículos 7 a 18 de la Ley 1480 de 2011 (Estatuto del
            Consumidor), Baird Service responde por la calidad, idoneidad y seguridad del servicio prestado a través
            de la plataforma. Todo servicio cuenta con garantía mínima de <strong>treinta (30) días calendario</strong>{' '}
            sobre la mano de obra, contados desde la fecha de finalización, y con la garantía del fabricante sobre los
            repuestos instalados, cuando aplique.
          </p>
          <p>
            La garantía comprende la revisión y reparación gratuita de la falla relacionada con el trabajo realizado
            o los repuestos suministrados, incluido el desplazamiento del técnico. Para hacerla efectiva basta con
            reportarla por los canales del numeral 16. <strong>No cubre</strong> fallas por mal uso, daños posteriores
            no relacionados, intervenciones de terceros ni servicios ejecutados fuera del flujo de la plataforma.
          </p>
          <p>
            <strong>Garantía suplementaria.</strong> Cuando el fabricante o Baird Service ofrezcan una cobertura
            superior a la legal (artículo 13 de la Ley 1480 de 2011), sus condiciones se informarán por escrito antes
            de su aceptación.
          </p>
        </Seccion>

        <Seccion id="retracto" titulo="9. Derecho de retracto y cancelación">
          <p>
            En las compras realizadas por medios electrónicos, el cliente puede ejercer el derecho de retracto dentro
            de los cinco (5) días hábiles siguientes a la celebración del contrato (artículo 47 de la Ley 1480 de
            2011). Baird Service reintegrará el dinero pagado, sin descuentos ni retenciones, en un plazo máximo de
            treinta (30) días calendario. Para ejercerlo, escribe a {EMPRESA.emailPqrs} o al WhatsApp de soporte.
          </p>
          <p>
            Conforme a la misma norma, el retracto <strong>no procede</strong> respecto de servicios cuya prestación
            haya comenzado con el acuerdo del cliente: una vez realizada la visita de diagnóstico, la tarifa de
            diagnóstico no es reembolsable; y una vez iniciada la reparación aprobada, el valor de esta tampoco lo es.
            Antes de la visita, el cliente puede cancelar o reagendar sin costo conforme al numeral 10.
          </p>
        </Seccion>

        <Seccion id="visita" titulo="10. Visita programada y compromiso de presencia">
          <p>
            <strong>10.1.</strong> Al confirmar un horario, el cliente se compromete a estar presente, o a tener un
            mayor de edad autorizado, en la dirección registrada durante toda la franja seleccionada.
          </p>
          <p>
            <strong>10.2.</strong> El cliente puede cancelar o reagendar sin costo hasta <strong>4 horas antes</strong>{' '}
            del inicio de la franja, a través del portal del servicio o respondiendo al WhatsApp de confirmación.
          </p>
          <p>
            <strong>10.3.</strong> Si el técnico llega dentro de la franja confirmada y no encuentra al cliente, y este
            no canceló con al menos 4 horas de anticipación, el servicio quedará cerrado y deberá solicitarse de nuevo.
            Ni el cliente, ni Baird Service, ni la marca cubren el desplazamiento del técnico en este caso.
          </p>
          <p>
            <strong>10.4.</strong> Con <strong>2 inasistencias</strong>, Baird Service podrá exigir confirmación
            adicional por llamada en futuras solicitudes; con <strong>3 o más</strong>, podrá suspender el acceso del
            cliente a la plataforma.
          </p>
          <p>
            <strong>10.5. Excepciones</strong> (caso fortuito o fuerza mayor comprobables): emergencia médica del
            cliente o un familiar, fuerza mayor declarada por autoridad, o error del técnico o de Baird Service
            (dirección errónea, llegada fuera de franja). Se evalúan en máximo 48 horas.
          </p>
        </Seccion>

        <Seccion id="obligaciones-cliente" titulo="11. Obligaciones y prohibiciones del usuario">
          <p>El cliente se obliga a:</p>
          <ul className={lista}>
            <li>Suministrar información veraz y mantenerla actualizada.</li>
            <li>Estar presente durante la visita o autorizar a un mayor de edad.</li>
            <li>Permitir al técnico trabajar en condiciones razonables de seguridad.</li>
            <li>No realizar pagos directos al técnico bajo ninguna circunstancia.</li>
            <li>Aprobar o rechazar el siguiente paso post-diagnóstico dentro de la plataforma.</li>
            <li>Reportar cualquier irregularidad por los canales oficiales.</li>
          </ul>
          <p>Está prohibido a todo usuario:</p>
          <ul className={lista}>
            <li>Usar la plataforma para fines ilícitos o contrarios a estos Términos.</li>
            <li>Usar robots, scripts o software que automatice la interacción con la plataforma o la descarga de su contenido.</li>
            <li>Acceder sin autorización, interferir con la infraestructura o transmitir código malicioso.</li>
            <li>Suplantar a otra persona o suministrar información falsa.</li>
            <li>Publicar o enviar material sobre el que no tenga derechos o licencia.</li>
            <li>Contactar a la contraparte para acordar servicios por fuera de la plataforma.</li>
          </ul>
        </Seccion>

        <Seccion id="tecnicos" titulo="12. Técnicos">
          <p>
            Los técnicos se vinculan como contratistas independientes. Sus derechos y obligaciones, los documentos
            que deben acreditar, el régimen de pagos y las causales de terminación están en el{' '}
            <Link href="/contrato-tecnico" className={enlace}>Contrato de Prestación de Servicios para Técnicos</Link>,
            que firman en físico como requisito para ser habilitados. Frente al cliente, el técnico debe identificarse al llegar, cumplir su
            declaración de capacitación y uso de elementos de protección personal, ejecutar únicamente las acciones
            aprobadas, documentar el trabajo con fotografías y no aceptar pagos directos.
          </p>
        </Seccion>

        <Seccion id="propiedad" titulo="13. Propiedad intelectual y licencia de uso">
          <p>
            Los contenidos, marcas, logotipos, textos, diseños, imágenes y software de la plataforma son de propiedad
            de Baird Service o de sus licenciantes y están protegidos por la legislación de derechos de autor y
            propiedad industrial. Baird Service otorga al usuario una licencia limitada, no exclusiva,
            intransferible, no susceptible de cesión y revocable para usar la plataforma y consultar o descargar
            temporalmente su contenido, únicamente para uso personal o dentro de su empresa, y nunca con fines
            comerciales.
          </p>
        </Seccion>

        <Seccion id="datos" titulo="14. Datos personales, comunicaciones y geolocalización">
          <p>
            Baird Service trata los datos personales conforme a la Ley 1581 de 2012 y sus decretos reglamentarios,
            según su <Link href="/politica-privacidad" className={enlace}>Política de Privacidad y Tratamiento de
            Datos</Link>, que hace parte integral de estos Términos y adopta las medidas a su alcance para evitar la
            alteración, pérdida o tratamiento no autorizado de los datos.
          </p>
          <p>
            Al aceptar estos Términos, el usuario autoriza recibir por WhatsApp los mensajes operativos de su servicio
            (agendamiento, asignación, cotización, pagos, confirmación y garantía). Como medida de seguridad y
            cumplimiento, la plataforma registra la ubicación GPS del dispositivo del técnico durante la llegada, el
            diagnóstico, la finalización y hasta treinta (30) minutos después de finalizado el servicio, con la
            autorización que el técnico otorga al registrarse.
          </p>
        </Seccion>

        <Seccion id="responsabilidad" titulo="15. Limitación de responsabilidad e indemnidad">
          <p>
            Baird Service responde por la calidad del trabajo dentro del alcance del servicio aprobado en la
            plataforma y de la garantía del numeral 8. En la máxima medida permitida por la ley, y sin perjuicio de
            los derechos irrenunciables del consumidor, Baird Service <strong>no responde</strong> por: (i) servicios
            ejecutados fuera del flujo de la plataforma; (ii) pagos hechos directamente al técnico; (iii) daños
            preexistentes en el equipo no relacionados con la intervención; (iv) modificaciones posteriores hechas por
            terceros; (v) fuerza mayor o caso fortuito; ni (vi) daños indirectos, lucro cesante o pérdida de datos
            derivados de la imposibilidad temporal de usar la plataforma.
          </p>
          <p>
            El usuario mantendrá indemne a Baird Service frente a reclamaciones, pérdidas o gastos (incluidos
            honorarios de abogados) que terceros presenten como consecuencia del uso de la plataforma en contravención
            de estos Términos o de la ley.
          </p>
        </Seccion>

        <Seccion id="pqrs" titulo="16. PQRS — Servicio al consumidor">
          <p>
            El cliente puede presentar peticiones, quejas, reclamos, sugerencias y solicitudes de garantía o retracto
            al correo <strong>{EMPRESA.emailPqrs}</strong> o al WhatsApp {EMPRESA.whatsappSoporte}. Baird Service
            responderá en un término máximo de quince (15) días hábiles. El cliente conserva el derecho de acudir a la
            Superintendencia de Industria y Comercio.
          </p>
        </Seccion>

        <Seccion id="modificaciones" titulo="17. Modificaciones">
          <p>
            Baird Service podrá modificar estos Términos. Las modificaciones se publicarán en esta página con su
            nueva versión y fecha. Los cambios materiales se notificarán por WhatsApp o en la plataforma antes de su
            entrada en vigor y solo aplicarán a servicios solicitados después de su publicación. Se recomienda revisar
            esta página periódicamente.
          </p>
        </Seccion>

        <Seccion id="ley" titulo="18. Ley aplicable y solución de controversias">
          <p>
            Estos Términos se rigen por las leyes de la República de Colombia. Las partes procurarán resolver sus
            diferencias de forma directa dentro de los quince (15) días hábiles siguientes a su notificación; de no
            lograrlo, podrán acudir a conciliación o a los jueces competentes de Bogotá D.C., sin perjuicio de las
            acciones de protección al consumidor ante la Superintendencia de Industria y Comercio.
          </p>
        </Seccion>

        <Seccion id="contacto" titulo="Contacto">
          <p>
            {EMPRESA.razonSocial} · NIT {EMPRESA.nit}<br />
            {EMPRESA.domicilio}<br />
            Email: <a href={`mailto:${EMPRESA.emailPqrs}`} className={enlace}>{EMPRESA.emailPqrs}</a><br />
            WhatsApp: {EMPRESA.whatsappSoporte}
          </p>
        </Seccion>

        <div className="mt-12 border-t border-gray-200 pt-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver al inicio</Link>
        </div>
      </div>
    </main>
  )
}
