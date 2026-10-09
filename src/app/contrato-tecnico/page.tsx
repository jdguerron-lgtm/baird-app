import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { EMPRESA, CONTRATO_TECNICO_VERSION, CONTRATO_TECNICO_FECHA } from '@/lib/constants/legal'
import { PAGO_TECNICO_DIAGNOSTICO } from '@/lib/constants/tarifas/particular'
import BotonImprimir from './BotonImprimir'

export const metadata: Metadata = {
  title: 'Contrato de Prestación de Servicios para Técnicos | Baird Service S.A.S',
  description: 'Contrato de prestación de servicios entre Baird Service S.A.S y los técnicos independientes de su red.',
}

function Clausula({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="mb-3 text-xl font-semibold text-gray-800">{titulo}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

const lista = 'list-disc pl-6 space-y-1'
const enlace = 'text-blue-600 underline'
const cop = (n: number) => `COP $${n.toLocaleString('es-CO')}`

export default function ContratoTecnicoPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Contrato de Prestación de Servicios para Técnicos
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Versión {CONTRATO_TECNICO_VERSION} · Última actualización: {CONTRATO_TECNICO_FECHA}
        </p>

        <section className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4 print:border-0 print:bg-white print:p-0">
          <p className="text-sm text-blue-900 print:text-gray-800">
            <strong>Firma en físico:</strong> este contrato se perfecciona con la firma del Técnico y de Baird Service en
            el documento impreso. Baird Service solo habilita al Técnico para recibir órdenes después de recibir el
            original firmado junto con los documentos de la cláusula Tercera. Hacen parte de este contrato los{' '}
            <Link href="/terminos" className="underline">Términos y Condiciones</Link> y la{' '}
            <Link href="/politica-privacidad" className="underline">Política de Privacidad y Tratamiento de Datos</Link>{' '}
            ({EMPRESA.sitio}).
          </p>
          <div className="mt-3">
            <BotonImprimir />
          </div>
        </section>

        <Clausula id="partes" titulo="Partes">
          <p>
            <strong>EL CONTRATANTE:</strong> {EMPRESA.razonSocial}, NIT {EMPRESA.nit}, con domicilio en{' '}
            {EMPRESA.domicilio}, actuando a través de su representante legal (en adelante &quot;Baird Service&quot;).
          </p>
          <p>
            <strong>EL CONTRATISTA:</strong> la persona natural que firma al final de este documento, identificada
            con el nombre y número de documento allí indicados (en adelante &quot;el Técnico&quot;).
          </p>
        </Clausula>

        <Clausula id="objeto" titulo="Primera. Objeto">
          <p>
            El Técnico prestará, con autonomía técnica y bajo su propia responsabilidad, servicios de diagnóstico,
            reparación, mantenimiento e instalación de electrodomésticos de línea blanca, en las especialidades que
            declare y Baird Service verifique, respecto de las órdenes de servicio que el Técnico decida aceptar
            libremente a través de la plataforma.
          </p>
        </Clausula>

        <Clausula id="independencia" titulo="Segunda. Independencia y naturaleza civil del contrato">
          <p>
            Este es un contrato de prestación de servicios de naturaleza civil (artículos 1602 y siguientes del
            Código Civil). <strong>No genera relación laboral</strong>, subordinación ni dependencia, ni da lugar a
            salario, prestaciones sociales, vacaciones ni indemnizaciones laborales. En consecuencia:
          </p>
          <ul className={lista}>
            <li>El Técnico <strong>es libre de aceptar o rechazar</strong> cualquier orden, sin sanción por rechazarla. No tiene horario, turnos, metas de cantidad de servicios ni obligación de disponibilidad.</li>
            <li>El Técnico decide los métodos, herramientas y forma de ejecución, con sus propios medios, herramientas, transporte y elementos de protección personal.</li>
            <li>El Técnico <strong>no tiene exclusividad</strong> y puede prestar servicios a otras personas o empresas.</li>
            <li>Baird Service no impone reglamento interno de trabajo ni órdenes en cuanto a modo, tiempo o cantidad de trabajo. Los estándares de calidad de la cláusula Novena se refieren al resultado del servicio entregado al cliente.</li>
          </ul>
        </Clausula>

        <Clausula id="requisitos" titulo="Tercera. Requisitos y documentos para la vinculación">
          <p>Para activar su cuenta, el Técnico debe acreditar:</p>
          <ul className={lista}>
            <li>Ser mayor de edad y fotocopia legible de su cédula de ciudadanía o documento válido.</li>
            <li>Carta de presentación u oferta de servicios, que corresponde a la información de especialidades y zona de cobertura registrada en la plataforma.</li>
            <li>Certificaciones académicas o de experiencia, y certificado de competencia laboral cuando la especialidad lo exija (por ejemplo, gasodomésticos).</li>
            <li>Registro Único Tributario (RUT) expedido por la DIAN, y Registro de Información Tributaria (RIT) cuando esté obligado.</li>
            <li>Certificación de cuenta bancaria a su nombre.</li>
            <li>Afiliación vigente a salud (EPS), pensión y riesgos laborales (ARL).</li>
            <li>Certificado de antecedentes disciplinarios de la Procuraduría General de la Nación, que Baird Service podrá consultar directamente.</li>
          </ul>
          <p>
            Baird Service verificará la información y podrá negar o suspender la vinculación si no se acreditan estos
            requisitos o si la información es falsa.
          </p>
        </Clausula>

        <Clausula id="valor" titulo="Cuarta. Valor del contrato y forma de pago">
          <p>
            El contrato es de <strong>valor indeterminado pero determinable</strong>: su valor será la suma de los
            honorarios de las órdenes de servicio efectivamente ejecutadas y cerradas en la plataforma. Antes de
            aceptar cada orden, el Técnico conoce el honorario que recibirá:
          </p>
          <ul className={lista}>
            <li><strong>Servicios bajo garantía:</strong> la tarifa por tipo o código de servicio publicada por Baird Service para la marca correspondiente.</li>
            <li><strong>Servicios particulares:</strong> {cop(PAGO_TECNICO_DIAGNOSTICO)} por la visita de diagnóstico y, si el cliente aprueba la reparación, el valor neto que el propio Técnico cotizó en la plataforma.</li>
          </ul>
          <p>
            El cliente paga exclusivamente a Baird Service. <strong>El Técnico no puede recibir pagos del cliente</strong>{' '}
            en efectivo, por transferencia ni por ningún otro medio. Baird Service liquidará los servicios cerrados
            cada quince (15) días, emitirá el documento soporte o recibirá la factura del Técnico según su régimen
            tributario, practicará las retenciones de ley y consignará en la cuenta bancaria registrada.
          </p>
          <p>
            Si el Técnico no presta el servicio aceptado, no surge el derecho al pago de esa orden. Los ajustes a las
            tarifas se informarán con al menos treinta (30) días de anticipación y no afectarán órdenes ya aceptadas.
          </p>
        </Clausula>

        <Clausula id="seguridad-social" titulo="Quinta. Seguridad social y riesgos laborales">
          <p>
            El Técnico cotizará como independiente a salud y pensión sobre el cuarenta por ciento (40%) de sus
            honorarios mensuales, con un ingreso base no inferior a un salario mínimo, y aportará al Fondo de
            Solidaridad Pensional cuando sus honorarios superen cuatro salarios mínimos (Ley 100 de 1993, Ley 789 de
            2002, Ley 797 de 2003 y Ley 1955 de 2019).
          </p>
          <p>
            Conforme a la Ley 1562 de 2012, el Técnico estará afiliado a una ARL. La clase de riesgo se asigna según
            la actividad declarada; como referencia, la reparación de electrodomésticos corresponde normalmente a
            riesgo II y la instalación de aires acondicionados o redes de gas a riesgo III. En riesgo I a III la
            cotización está a cargo del Técnico; en riesgo IV y V, a cargo de Baird Service.
          </p>
          <p>
            <strong>Antes de cada pago</strong>, el Técnico debe enviar a Baird Service, por la plataforma o por
            WhatsApp, la planilla PILA del período o el comprobante de pago de sus aportes. Baird Service no realizará pagos sin esta verificación (artículo 50
            de la Ley 789 de 2002 y Ley 828 de 2003).
          </p>
        </Clausula>

        <Clausula id="obligaciones-tecnico" titulo="Sexta. Obligaciones del Técnico">
          <ul className={lista}>
            <li>Ejecutar personalmente, con calidad profesional y dentro del plazo acordado con el cliente, las órdenes que acepte.</li>
            <li>Ejecutar únicamente las acciones aprobadas por el cliente en la plataforma.</li>
            <li>Identificarse ante el cliente y cumplir la declaración de capacitación, conocimiento de riesgos y uso de elementos de protección personal que suscribe antes de cada diagnóstico.</li>
            <li>Documentar el servicio con fotografías, lista de chequeo y firma, y permitir el registro de ubicación GPS durante la visita y hasta 30 minutos después de finalizado el servicio.</li>
            <li>Usar repuestos originales o de calidad equivalente informados al cliente.</li>
            <li>Atender sin costo adicional las garantías sobre su propio trabajo.</li>
            <li>Mantener vigentes su RUT, afiliaciones a seguridad social y la información registrada.</li>
            <li>No acordar con el cliente servicios ni cobros por fuera de la plataforma.</li>
          </ul>
        </Clausula>

        <Clausula id="obligaciones-baird" titulo="Séptima. Obligaciones de Baird Service">
          <ul className={lista}>
            <li>Informar antes de su aceptación la descripción, ubicación, franja horaria y honorario de cada orden.</li>
            <li>Pagar oportunamente los honorarios de las órdenes cerradas, en los términos de la cláusula Cuarta.</li>
            <li>Proveer el acceso a la plataforma y la información necesaria para ejecutar el servicio.</li>
            <li>Tratar los datos del Técnico conforme a la Política de Privacidad.</li>
          </ul>
        </Clausula>

        <Clausula id="plazo" titulo="Octava. Plazo">
          <p>
            El contrato tiene duración indefinida desde su firma y se ejecuta orden por orden. Cada orden tiene
            el plazo de ejecución pactado con el cliente en la plataforma.
          </p>
        </Clausula>

        <Clausula id="supervision" titulo="Novena. Supervisión del resultado y estándares de calidad">
          <p>
            Baird Service verificará el <strong>resultado</strong> de cada servicio mediante la evidencia cargada, la
            confirmación y calificación del cliente y la tasa de reclamos de garantía. Esta verificación no implica
            subordinación. Se espera del Técnico: puntualidad en la franja que él mismo aceptó, comunicación
            respetuosa, higiene y seguridad en el domicilio, honestidad en el diagnóstico y los costos, y evidencia
            completa del servicio.
          </p>
          <p>
            El incumplimiento reiterado de estos estándares dará lugar a: (i) aviso escrito; (ii) suspensión temporal
            de la recepción de nuevas órdenes; y (iii) terminación del contrato. Rechazar o no responder una orden no
            constituye incumplimiento.
          </p>
        </Clausula>

        <Clausula id="responsabilidad" titulo="Décima. Responsabilidad frente a clientes e indemnidad">
          <p>
            El Técnico responde por los daños que por su acción u omisión cause a los clientes, a sus bienes o a
            terceros durante la prestación del servicio. El Técnico mantendrá indemne a Baird Service frente a toda
            reclamación, multa, condena o gasto, incluidos honorarios de abogados, derivados de su negligencia, de la
            violación de la ley o del incumplimiento de este contrato, y Baird Service podrá compensar dichas sumas
            contra los honorarios pendientes de pago, previo aviso al Técnico.
          </p>
          <p>
            Baird Service puede exigir, para ciertas especialidades, póliza de responsabilidad civil o póliza de
            cumplimiento, informándolo antes de habilitar la especialidad.
          </p>
        </Clausula>

        <Clausula id="datos" titulo="Décima primera. Confidencialidad y protección de datos">
          <p>
            El Técnico mantendrá confidencial toda información de los clientes (nombre, teléfono, dirección, equipo) y
            de Baird Service, y la usará exclusivamente para el servicio asignado. Esta obligación subsiste después de
            terminado el contrato.
          </p>
          <p>
            El Técnico autoriza a Baird Service a tratar sus datos personales, incluidos los sensibles (fotografía del
            rostro y del documento, ubicación GPS e información de seguridad social), para las finalidades de la{' '}
            <Link href="/politica-privacidad" className={enlace}>Política de Privacidad</Link>.
          </p>
        </Clausula>

        <Clausula id="no-desvio" titulo="Décima segunda. No desvío de clientes">
          <p>
            El Técnico no podrá ofrecer ni prestar directamente, por fuera de la plataforma, servicios a los clientes
            que conoció a través de Baird Service, durante la vigencia del contrato y los seis (6) meses siguientes a
            su terminación. Esta restricción se limita a dichos clientes y no impide al Técnico atender a sus propios
            clientes ni trabajar con otras empresas.
          </p>
        </Clausula>

        <Clausula id="penal" titulo="Décima tercera. Cláusula penal">
          <p>
            El incumplimiento de las cláusulas Cuarta (cobro directo al cliente), Décima primera o Décima segunda
            dará lugar al pago, a título de pena, de una suma equivalente a tres (3) veces el valor del servicio
            involucrado, sin perjuicio de la indemnización de los perjuicios adicionales que se prueben (artículo 1592
            y siguientes del Código Civil).
          </p>
        </Clausula>

        <Clausula id="terminacion" titulo="Décima cuarta. Terminación">
          <p>El contrato termina:</p>
          <ul className={lista}>
            <li>Por mutuo acuerdo.</li>
            <li>Por decisión de cualquiera de las partes, en cualquier momento, con aviso escrito de quince (15) días, sin indemnización, cumpliendo las órdenes ya aceptadas.</li>
            <li>De inmediato, por incumplimiento grave: cobro directo al cliente, fraude, información falsa, ejecución de trabajos sin aprobación del cliente, conducta inapropiada o violación de la confidencialidad.</li>
            <li>Por pérdida de los requisitos de la cláusula Tercera.</li>
          </ul>
          <p>A la terminación, Baird Service liquidará y pagará los servicios cerrados pendientes.</p>
        </Clausula>

        <Clausula id="cesion" titulo="Décima quinta. Cesión">
          <p>
            El Técnico no podrá ceder este contrato ni subcontratar las órdenes aceptadas sin autorización escrita de
            Baird Service. Baird Service podrá ceder el contrato a una sociedad vinculada, informando al Técnico.
          </p>
        </Clausula>

        <Clausula id="controversias" titulo="Décima sexta. Solución de controversias">
          <p>
            Las diferencias se resolverán primero por arreglo directo dentro de los quince (15) días hábiles siguientes
            a su notificación escrita; en su defecto, mediante conciliación ante un centro de conciliación de Bogotá
            D.C. Si la conciliación fracasa, la controversia se someterá a la decisión de un árbitro único del Centro
            de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá, que fallará en derecho conforme a la Ley
            1563 de 2012; para controversias de mínima cuantía, las partes podrán acudir directamente a la justicia
            ordinaria.
          </p>
        </Clausula>

        <Clausula id="merito" titulo="Décima séptima. Mérito ejecutivo">
          <p>
            Este contrato, junto con los registros de la plataforma y las liquidaciones aceptadas, presta mérito
            ejecutivo para el cobro de las obligaciones claras, expresas y exigibles que de él se deriven, sin
            necesidad de requerimiento previo.
          </p>
        </Clausula>

        <Clausula id="domicilio" titulo="Décima octava. Domicilio contractual y notificaciones">
          <p>
            El domicilio contractual es Bogotá D.C. Las notificaciones se harán al WhatsApp y dirección registrados
            por el Técnico y, para Baird Service, a {EMPRESA.domicilio}, correo {EMPRESA.emailDatos} o WhatsApp{' '}
            {EMPRESA.whatsappSoporte}.
          </p>
        </Clausula>

        <Clausula id="modificaciones" titulo="Décima novena. Modificaciones">
          <p>
            Las modificaciones a este contrato se publicarán en esta página con nueva versión y se notificarán al
            Técnico por WhatsApp con al menos treinta (30) días de anticipación. Si el Técnico no está de acuerdo,
            podrá terminar el contrato sin penalidad antes de su entrada en vigor.
          </p>
        </Clausula>

        <section id="firmas" className="mb-8 break-inside-avoid">
          <p className="mb-8 text-gray-700">
            Para constancia se firma en Bogotá D.C., el día ______ del mes de __________________ de ________, en dos
            ejemplares del mismo tenor (versión {CONTRATO_TECNICO_VERSION}).
          </p>
          <div className="grid gap-10 sm:grid-cols-2 print:grid-cols-2">
            <div className="text-sm text-gray-800">
              <p className="mb-14 font-semibold">EL CONTRATANTE</p>
              <div className="border-t border-gray-800 pt-2">
                <p>Representante legal</p>
                <p>{EMPRESA.razonSocial}</p>
                <p>NIT {EMPRESA.nit}</p>
              </div>
            </div>
            <div className="text-sm text-gray-800">
              <p className="mb-14 font-semibold">EL CONTRATISTA</p>
              <div className="border-t border-gray-800 pt-2 space-y-2">
                <p>Nombre: ____________________________________</p>
                <p>C.C. No.: __________________ de ____________</p>
                <p>WhatsApp: __________________________________</p>
                <p>Huella:</p>
                <div className="h-16 w-14 border border-gray-400" />
              </div>
            </div>
          </div>
        </section>

        <div className="mt-12 border-t border-gray-200 pt-6 flex flex-wrap gap-4 text-sm print:hidden">
          <Link href="/registro" className="text-blue-600 hover:underline">Registrarme como técnico</Link>
          <Link href="/terminos" className="text-blue-600 hover:underline">Términos y Condiciones</Link>
          <Link href="/" className="text-blue-600 hover:underline">← Volver al inicio</Link>
        </div>
      </div>
    </main>
  )
}
