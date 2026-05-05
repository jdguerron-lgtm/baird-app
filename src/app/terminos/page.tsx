import type { Metadata } from 'next'
import Link from 'next/link'
import { TYC_VERSION } from '@/types/solicitud'

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Baird Service S.A.S',
  description: 'Términos y condiciones del servicio de Baird Service S.A.S, marketplace de reparación de electrodomésticos en Colombia.',
}

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Términos y Condiciones del Servicio</h1>
        <p className="mb-8 text-sm text-gray-500">
          Versión {TYC_VERSION} · Última actualización: 27 de abril de 2026
        </p>

        <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <strong>Aceptación tácita:</strong> al confirmar el horario de tu servicio en la plataforma, declaras
            que has leído, entendido y aceptado en su totalidad los presentes Términos y Condiciones, así como la
            <Link href="/politica-privacidad" className="underline ml-1">Política de Privacidad</Link>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">1. Naturaleza del servicio</h2>
          <p className="text-gray-700 leading-relaxed">
            <strong>Baird Service S.A.S</strong> (en adelante &quot;Baird Service&quot; o &quot;la plataforma&quot;) es una sociedad
            comercial colombiana que opera como <strong>intermediario tecnológico (marketplace)</strong> entre clientes
            que requieren reparación de electrodomésticos y técnicos independientes verificados. Baird Service
            <strong> NO presta directamente</strong> los servicios de reparación: estos son ejecutados por técnicos
            independientes contratados bajo modalidad de prestación de servicios, conforme al artículo 34 del Código
            Sustantivo del Trabajo y al Código de Comercio colombiano.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">2. Aceptación de los términos</h2>
          <p className="text-gray-700 leading-relaxed mb-2">
            La utilización de la plataforma supone aceptación expresa de estos términos. Específicamente, se considera
            que el cliente acepta los presentes Términos cuando:
          </p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Confirma uno de los horarios propuestos vía WhatsApp o en la página de agendamiento.</li>
            <li>Permite el ingreso del técnico al sitio donde se prestará el servicio.</li>
            <li>Aprueba la cotización en servicios particulares (no garantía).</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">3. Régimen de pagos — Cláusula esencial</h2>
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 mb-3">
            <p className="text-red-900 font-semibold">
              ⚠️ NINGÚN pago se realiza directamente al técnico ni en efectivo en el sitio de la visita.
            </p>
          </div>
          <p className="text-gray-700 leading-relaxed mb-2">
            <strong>Servicios bajo garantía:</strong> el costo total del servicio (mano de obra y repuestos) es asumido
            por el fabricante del electrodoméstico o el aliado comercial correspondiente. El cliente <strong>no paga
            ningún valor</strong> a Baird Service ni al técnico.
          </p>
          <p className="text-gray-700 leading-relaxed mb-2">
            <strong>Servicios particulares (no garantía):</strong> el cliente paga a Baird Service exclusivamente a
            través de los medios de pago habilitados en la plataforma. Cualquier intento del técnico de cobrar al
            cliente directamente, en efectivo, por transferencia personal, o por fuera de los canales oficiales,
            constituye violación a estos Términos.
          </p>
          <p className="text-gray-700 leading-relaxed">
            La <strong>tarifa de diagnóstico</strong> en servicios particulares es de COP $80.000 con anticipo del 50%
            (COP $40.000) requerido antes de la visita técnica. Este valor se acredita íntegramente al total del
            servicio si el cliente aprueba la cotización.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">4. Procedimiento de servicio</h2>
          <ol className="list-decimal pl-6 text-gray-700 space-y-2">
            <li><strong>Solicitud:</strong> el cliente registra su solicitud en la plataforma con descripción del problema.</li>
            <li><strong>Confirmación de horario:</strong> el cliente recibe vía WhatsApp dos opciones de horario y selecciona una.</li>
            <li><strong>Asignación:</strong> el primer técnico verificado en aceptar la solicitud queda asignado.</li>
            <li><strong>Diagnóstico:</strong> el técnico realiza diagnóstico in situ y registra resultado en la plataforma.</li>
            <li><strong>Aprobación del cliente:</strong> tras el diagnóstico, el cliente debe aprobar el siguiente paso (reparación, espera de repuesto, finalización sin reparación) en la plataforma.</li>
            <li><strong>Ejecución:</strong> el técnico procede únicamente con la acción aprobada.</li>
            <li><strong>Cierre:</strong> el cliente confirma satisfacción del servicio en la plataforma.</li>
          </ol>
        </section>

        <section className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="mb-3 text-xl font-semibold text-gray-900">5. Verificación obligatoria post-diagnóstico</h2>
          <p className="text-gray-800 leading-relaxed mb-3">
            Tras finalizar el diagnóstico, <strong>el cliente debe verificar y aceptar dentro de la plataforma</strong>
            la siguiente acción a ejecutar (vía botón en WhatsApp). Sin esta verificación, el técnico no está
            autorizado a continuar con la reparación.
          </p>
          <p className="text-gray-800 leading-relaxed mb-2">
            Si el técnico realiza el servicio <strong>sin la verificación del cliente en la plataforma</strong>:
          </p>
          <ul className="list-disc pl-6 text-gray-800 space-y-1">
            <li>Estará incumpliendo gravemente los presentes Términos y Condiciones.</li>
            <li>Será expulsado de la plataforma y su cuenta bloqueada de forma permanente.</li>
            <li>El trabajo realizado <strong>no tendrá cobertura de garantía</strong> por parte de Baird Service.</li>
            <li>Baird Service podrá iniciar acciones legales por incumplimiento contractual conforme a los artículos 1602 y siguientes del Código Civil.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">6. Garantías</h2>
          <p className="text-gray-700 leading-relaxed mb-2">
            En cumplimiento de los artículos 7 a 18 de la Ley 1480 de 2011 (Estatuto del Consumidor), todo servicio
            ejecutado dentro de la plataforma cuenta con garantía mínima de <strong>treinta (30) días calendario</strong>
            sobre la mano de obra desde la fecha de finalización, y la garantía del fabricante sobre los repuestos
            instalados (cuando aplique).
          </p>
          <p className="text-gray-700 leading-relaxed">
            La garantía cubre fallas relacionadas directamente con el trabajo realizado y los repuestos suministrados.
            <strong> No cubre</strong> fallas por mal uso del equipo, daños posteriores no relacionados, ni servicios
            ejecutados fuera del flujo de la plataforma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">7. Obligaciones del cliente</h2>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Suministrar información veraz al registrar la solicitud.</li>
            <li>Estar presente en el sitio durante la visita o autorizar a un mayor de edad.</li>
            <li>Permitir al técnico ejecutar su trabajo en condiciones razonables de seguridad.</li>
            <li>No realizar pagos directos al técnico bajo ninguna circunstancia.</li>
            <li>Confirmar o rechazar el siguiente paso post-diagnóstico dentro de la plataforma.</li>
            <li>Reportar cualquier irregularidad a través de los canales oficiales de Baird Service.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">8. Obligaciones del técnico</h2>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Cumplir con su declaración bajo juramento de capacitación, conocimiento de riesgos y posesión de elementos de protección personal (EPP) antes de iniciar cada diagnóstico.</li>
            <li>Identificarse con su documento al cliente al llegar al sitio.</li>
            <li>Ejecutar exclusivamente las acciones aprobadas por el cliente en la plataforma.</li>
            <li>No aceptar ni solicitar pagos directos del cliente.</li>
            <li>Mantener trazabilidad de su ubicación durante la visita y hasta 30 minutos después de marcar el servicio como completado.</li>
            <li>Documentar el trabajo con fotografías antes y después.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">9. Tratamiento de datos personales</h2>
          <p className="text-gray-700 leading-relaxed">
            Baird Service trata los datos personales conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 y normas
            concordantes. Los detalles del tratamiento se encuentran en nuestra
            <Link href="/politica-privacidad" className="underline mx-1">Política de Privacidad y Tratamiento de Datos</Link>,
            la cual hace parte integral de estos Términos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">10. Geolocalización del técnico</h2>
          <p className="text-gray-700 leading-relaxed">
            Como medida de seguridad y de cumplimiento contractual, Baird Service registra la ubicación GPS del
            dispositivo del técnico durante las fases de llegada, diagnóstico, completación del servicio y hasta
            <strong> treinta (30) minutos posteriores</strong> a la finalización del servicio. Esta información se
            utiliza exclusivamente para verificar el cumplimiento del flujo definido en estos Términos y prevenir
            servicios ejecutados fuera de la plataforma. El técnico autoriza expresamente este tratamiento al firmar
            su contrato de prestación de servicios con Baird Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">11. Limitación de responsabilidad</h2>
          <p className="text-gray-700 leading-relaxed">
            Baird Service, en su rol de marketplace, responde por la calidad del trabajo dentro del alcance del
            servicio aprobado en la plataforma y dentro de los términos de garantía indicados. Baird Service
            <strong> no se hace responsable</strong> por: (i) servicios ejecutados fuera del flujo de la plataforma;
            (ii) pagos realizados por el cliente directamente al técnico; (iii) daños preexistentes en el equipo no
            relacionados con la intervención; (iv) modificaciones posteriores al equipo realizadas por terceros;
            (v) fuerza mayor o caso fortuito.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">12. PQRS — Servicio al consumidor</h2>
          <p className="text-gray-700 leading-relaxed">
            Conforme al artículo 23 del Estatuto del Consumidor, el cliente puede presentar peticiones, quejas,
            reclamos y sugerencias a través del correo <strong>servicioalcliente@bairdservice.com</strong>. Baird
            Service responderá en un término máximo de quince (15) días hábiles desde la recepción.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">13. Modificaciones</h2>
          <p className="text-gray-700 leading-relaxed">
            Baird Service podrá modificar estos Términos en cualquier momento. Las modificaciones se publicarán en
            esta página con la nueva versión y fecha. El uso continuado del servicio tras la publicación constituye
            aceptación de los términos actualizados.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">14. Ley aplicable y jurisdicción</h2>
          <p className="text-gray-700 leading-relaxed">
            Estos Términos se rigen por las leyes de la República de Colombia. Cualquier controversia será sometida
            a los jueces competentes de la ciudad de Bogotá D.C., previo agotamiento de la etapa conciliatoria
            cuando sea legalmente exigible.
          </p>
        </section>

        <section className="mb-8 rounded-lg bg-gray-50 p-4">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">Contacto</h2>
          <p className="text-gray-700">
            Baird Service S.A.S<br />
            Bogotá D.C., Colombia<br />
            Email: <a href="mailto:servicioalcliente@bairdservice.com" className="text-blue-600 underline">servicioalcliente@bairdservice.com</a><br />
            WhatsApp: +57 313 495 1164
          </p>
        </section>

        <div className="mt-8 border-t border-gray-200 pt-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver al inicio</Link>
        </div>
      </div>
    </main>
  )
}
