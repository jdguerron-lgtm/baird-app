import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { EMPRESA, PRIVACIDAD_VERSION, PRIVACIDAD_FECHA } from '@/lib/constants/legal'

export const metadata: Metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos | Baird Service S.A.S',
  description: 'Política de privacidad y tratamiento de datos personales de Baird Service S.A.S (Ley 1581 de 2012).',
}

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

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Política de Privacidad y Tratamiento de Datos Personales
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Versión {PRIVACIDAD_VERSION} · Última actualización: {PRIVACIDAD_FECHA}
        </p>

        <Seccion id="responsable" titulo="1. Responsable del tratamiento">
          <p>
            <strong>{EMPRESA.razonSocial}</strong>, NIT {EMPRESA.nit}, con domicilio en {EMPRESA.domicilio},
            teléfono {EMPRESA.telefono}, correo <a href={`mailto:${EMPRESA.emailDatos}`} className={enlace}>{EMPRESA.emailDatos}</a>,
            es responsable del tratamiento de los datos personales recolectados a través de esta plataforma y de sus
            canales de WhatsApp Business. Esta política se adopta en cumplimiento de la Ley 1581 de 2012, el Decreto
            1377 de 2013 (compilado en el Decreto 1074 de 2015) y demás normas concordantes.
          </p>
        </Seccion>

        <Seccion id="datos" titulo="2. Datos que recolectamos">
          <ul className={lista}>
            <li><strong>Clientes:</strong> nombre, número de documento, teléfono/WhatsApp, dirección y ciudad, datos del equipo y descripción de la falla, historial de servicios, pagos (Baird Service no almacena datos de tarjetas: los procesa la pasarela de pagos).</li>
            <li><strong>Técnicos:</strong> nombre, tipo y número de documento, foto del documento de identidad, foto de perfil, teléfono/WhatsApp, ciudad de operación, especialidades, certificaciones, afiliación a seguridad social (salud, pensión y ARL), RUT, certificación bancaria y antecedentes requeridos para la vinculación.</li>
            <li><strong>Datos del servicio:</strong> fotografías de evidencia, listas de chequeo, firmas digitales, calificaciones, y la ubicación GPS del dispositivo del técnico durante la llegada, el diagnóstico, la finalización y hasta 30 minutos después de finalizado el servicio.</li>
            <li><strong>Comunicaciones:</strong> mensajes enviados y recibidos por WhatsApp Business y, cuando aplique, grabaciones o transcripciones de llamadas de coordinación, previo aviso.</li>
            <li><strong>Datos técnicos de navegación:</strong> dirección IP, tipo de dispositivo y registros de uso necesarios para la seguridad y el funcionamiento de la plataforma.</li>
          </ul>
        </Seccion>

        <Seccion id="sensibles" titulo="3. Datos sensibles y menores de edad">
          <p>
            La fotografía del rostro y del documento de identidad del técnico, su ubicación GPS y la información de
            afiliación a seguridad social pueden tener la calidad de datos sensibles. Su suministro es
            <strong> facultativo</strong>: el titular no está obligado a autorizarlo. Sin embargo, son necesarios para
            verificar la identidad del técnico, proteger al cliente que lo recibe en su hogar y cumplir las
            obligaciones legales de Baird Service como contratante, por lo que sin ellos no es posible la vinculación
            a la red. Estos datos se tratan con acceso restringido y solo para las finalidades indicadas.
          </p>
          <p>La plataforma no está dirigida a menores de 18 años y no recolecta intencionalmente sus datos.</p>
        </Seccion>

        <Seccion id="finalidades" titulo="4. Finalidades del tratamiento">
          <ul className={lista}>
            <li>Recibir, coordinar, asignar, ejecutar, cobrar y dar garantía a las solicitudes de servicio.</li>
            <li>Enviar por WhatsApp notificaciones operativas: agendamiento, asignación, cotización, pagos, confirmación, garantía y encuestas de satisfacción.</li>
            <li>Verificar la identidad, idoneidad, certificaciones y antecedentes de los técnicos, y evaluar su desempeño.</li>
            <li>Verificar los aportes a seguridad social de los técnicos antes de cada pago, liquidarles sus servicios, emitir documentos soporte y cumplir obligaciones tributarias y contables.</li>
            <li>Verificar el cumplimiento del flujo del servicio, prevenir fraudes y servicios por fuera de la plataforma, y atender disputas.</li>
            <li>Reportar a los fabricantes y aliados comerciales la información necesaria de los servicios bajo garantía.</li>
            <li>Atender PQRS, cumplir requerimientos de autoridades y mejorar la calidad del servicio.</li>
          </ul>
          <p>
            Baird Service no vende datos personales ni envía publicidad no solicitada. Cualquier uso comercial
            adicional requerirá una autorización independiente.
          </p>
        </Seccion>

        <Seccion id="autorizacion" titulo="5. Autorización">
          <p>
            El titular otorga su autorización previa, expresa e informada al marcar la casilla correspondiente al
            solicitar un servicio o al registrarse como técnico, y el técnico la ratifica al firmar su contrato.
            Baird Service conserva prueba de la autorización (fecha y versión de esta política aceptada).
          </p>
        </Seccion>

        <Seccion id="encargados" titulo="6. Encargados, transmisión y transferencia de datos">
          <p>
            Para operar la plataforma, Baird Service comparte datos, bajo contrato y solo para las finalidades
            descritas, con los siguientes encargados, algunos de los cuales almacenan la información en servidores
            fuera de Colombia (transmisión internacional):
          </p>
          <ul className={lista}>
            <li><strong>Supabase</strong> (base de datos y almacenamiento de archivos).</li>
            <li><strong>Vercel</strong> (alojamiento de la aplicación).</li>
            <li><strong>Meta Platforms</strong> (WhatsApp Business API).</li>
            <li><strong>Wompi / Bancolombia</strong> (procesamiento de pagos).</li>
            <li>Proveedores de software contable y de facturación electrónica.</li>
            <li>Proveedores de inteligencia artificial y de llamadas automatizadas, cuando estas funciones estén activas.</li>
          </ul>
          <p>
            También se comparten con el técnico asignado los datos del cliente necesarios para la visita, con el
            cliente los datos de identificación del técnico asignado, y con el fabricante o aliado comercial los datos
            de los servicios bajo garantía. El técnico se obliga contractualmente a no usar los datos del cliente para
            fines distintos al servicio.
          </p>
        </Seccion>

        <Seccion id="derechos" titulo="7. Derechos del titular">
          <p>Conforme al artículo 8 de la Ley 1581 de 2012, el titular tiene derecho a:</p>
          <ul className={lista}>
            <li>Conocer, actualizar y rectificar sus datos personales.</li>
            <li>Solicitar prueba de la autorización otorgada.</li>
            <li>Ser informado sobre el uso dado a sus datos.</li>
            <li>Revocar la autorización y/o solicitar la supresión de sus datos cuando no exista un deber legal o contractual de conservarlos.</li>
            <li>Acceder gratuitamente a sus datos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio, previo trámite de consulta o reclamo ante Baird Service.</li>
          </ul>
        </Seccion>

        <Seccion id="procedimiento" titulo="8. Procedimiento para consultas y reclamos">
          <p>
            El área responsable de la atención es Servicio al Cliente, a través del correo{' '}
            <a href={`mailto:${EMPRESA.emailDatos}`} className={enlace}>{EMPRESA.emailDatos}</a> o el WhatsApp{' '}
            {EMPRESA.whatsappSoporte}. La solicitud debe incluir nombre, número de documento, teléfono registrado,
            descripción de lo solicitado y datos de contacto.
          </p>
          <ul className={lista}>
            <li><strong>Consultas:</strong> se responden en máximo diez (10) días hábiles, prorrogables por cinco (5) días hábiles más informando el motivo (artículo 14, Ley 1581 de 2012).</li>
            <li><strong>Reclamos</strong> (corrección, actualización, supresión o revocatoria): se responden en máximo quince (15) días hábiles, prorrogables por ocho (8) días hábiles más informando el motivo (artículo 15, Ley 1581 de 2012).</li>
          </ul>
          <p>
            Para solicitar la eliminación de datos, consulta también la página de{' '}
            <Link href="/eliminacion-datos" className={enlace}>eliminación de datos</Link>.
          </p>
        </Seccion>

        <Seccion id="conservacion" titulo="9. Conservación y seguridad">
          <p>
            Los datos se conservan durante la relación con el titular y, después, por el tiempo necesario para
            atender garantías, reclamaciones y obligaciones legales: los soportes contables y tributarios se conservan
            por el término que exige la ley (diez años, artículo 28 de la Ley 962 de 2005). Los registros GPS del
            técnico se conservan solo mientras sean necesarios para resolver disputas del servicio.
          </p>
          <p>
            Los datos se almacenan con cifrado en tránsito (HTTPS) y en reposo, con controles de acceso por rol. Ningún
            sistema es infalible; ante un incidente de seguridad, Baird Service lo informará a la Superintendencia de
            Industria y Comercio y a los titulares afectados conforme a la ley.
          </p>
        </Seccion>

        <Seccion id="cookies" titulo="10. Cookies">
          <p>
            La plataforma usa únicamente cookies y almacenamiento local técnicos, necesarios para su funcionamiento y
            seguridad. No usa cookies publicitarias de terceros.
          </p>
        </Seccion>

        <Seccion id="vigencia" titulo="11. Vigencia y modificaciones">
          <p>
            Esta política rige desde su publicación. Los cambios sustanciales se comunicarán por los canales de
            contacto registrados antes de su aplicación y, cuando cambien las finalidades, se pedirá una nueva
            autorización. Las bases de datos permanecerán vigentes mientras subsistan las finalidades del tratamiento.
          </p>
        </Seccion>

        <div className="mt-12 border-t border-gray-200 pt-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Volver al inicio</Link>
        </div>
      </div>
    </main>
  )
}
