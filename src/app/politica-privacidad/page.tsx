import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politica de Privacidad | Baird Service S.A.S',
  description: 'Politica de privacidad y tratamiento de datos personales de Baird Service S.A.S',
};

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">
          Politica de Privacidad y Tratamiento de Datos Personales
        </h1>
        <p className="mb-4 text-sm text-gray-500">
          Ultima actualizacion: 30 de marzo de 2026
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">1. Responsable del tratamiento</h2>
          <p className="text-gray-700 leading-relaxed">
            <strong>Baird Service S.A.S</strong>, identificada con NIT en tramite, con domicilio en Bogota, Colombia,
            es responsable del tratamiento de los datos personales recopilados a traves de esta plataforma y del
            servicio de mensajeria WhatsApp Business.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">2. Datos que recopilamos</h2>
          <p className="mb-2 text-gray-700">Recopilamos los siguientes tipos de datos personales:</p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li><strong>Datos de clientes:</strong> nombre completo, numero de telefono, direccion, ciudad, descripcion del servicio solicitado.</li>
            <li><strong>Datos de tecnicos:</strong> nombre completo, numero de telefono, cedula, especialidades, ciudad de operacion.</li>
            <li><strong>Datos de comunicacion:</strong> mensajes enviados y recibidos a traves de WhatsApp Business API para la coordinacion de servicios.</li>
            <li><strong>Datos de servicio:</strong> fotografias de evidencia del trabajo realizado, firmas digitales, ubicacion GPS al completar un servicio.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">3. Finalidad del tratamiento</h2>
          <p className="mb-2 text-gray-700">Los datos personales seran utilizados para:</p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Gestionar y coordinar solicitudes de servicio de reparacion de electrodomesticos.</li>
            <li>Notificar a tecnicos sobre nuevas solicitudes de servicio via WhatsApp.</li>
            <li>Confirmar la asignacion y finalizacion de servicios con los clientes.</li>
            <li>Registrar evidencia fotografica y de satisfaccion del servicio prestado.</li>
            <li>Mejorar la calidad del servicio y la experiencia del usuario.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">4. Uso de WhatsApp Business API</h2>
          <p className="text-gray-700 leading-relaxed">
            Utilizamos la API de WhatsApp Business de Meta para enviar notificaciones de servicio,
            confirmaciones de asignacion y enlaces de seguimiento a clientes y tecnicos. Los mensajes
            son enviados unicamente con fines operativos relacionados con los servicios de reparacion
            contratados. No enviamos mensajes de marketing no solicitados.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">5. Almacenamiento y seguridad</h2>
          <p className="text-gray-700 leading-relaxed">
            Los datos se almacenan en servidores seguros proporcionados por Supabase (PostgreSQL) con
            cifrado en transito y en reposo. Las fotografias de evidencia se almacenan en Supabase Storage.
            La aplicacion se despliega en Vercel con conexiones HTTPS.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">6. Derechos del titular</h2>
          <p className="mb-2 text-gray-700">
            De acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia, usted tiene derecho a:
          </p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Conocer, actualizar y rectificar sus datos personales.</li>
            <li>Solicitar prueba de la autorizacion otorgada para el tratamiento.</li>
            <li>Ser informado sobre el uso que se ha dado a sus datos.</li>
            <li>Revocar la autorizacion y/o solicitar la supresion de sus datos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">7. Eliminacion de datos</h2>
          <p className="text-gray-700 leading-relaxed">
            Puede solicitar la eliminacion de sus datos personales en cualquier momento enviando un
            correo electronico a <a href="mailto:soporte@bairdservice.com" className="text-blue-600 hover:underline">soporte@bairdservice.com</a> o
            comunicandose al WhatsApp de soporte. Procesaremos su solicitud en un plazo maximo de
            15 dias habiles conforme a la normativa colombiana.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">8. Compartir datos con terceros</h2>
          <p className="text-gray-700 leading-relaxed">
            No vendemos ni compartimos sus datos personales con terceros para fines comerciales.
            Los datos pueden ser compartidos unicamente con: Meta (WhatsApp Business API) para el
            envio de mensajes, Supabase para el almacenamiento seguro de datos, y Vercel para el
            alojamiento de la aplicacion. Todos estos proveedores cumplen con estandares
            internacionales de proteccion de datos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">9. Contacto</h2>
          <p className="text-gray-700 leading-relaxed">
            Para ejercer sus derechos o realizar consultas sobre esta politica, comuniquese con nosotros:
          </p>
          <ul className="mt-2 list-none text-gray-700 space-y-1">
            <li><strong>Correo:</strong> soporte@bairdservice.com</li>
            <li><strong>Web:</strong> https://baird-app.vercel.app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">10. Modificaciones</h2>
          <p className="text-gray-700 leading-relaxed">
            Nos reservamos el derecho de modificar esta politica en cualquier momento. Los cambios
            seran publicados en esta misma pagina con la fecha de actualizacion correspondiente.
          </p>
        </section>
      </div>
    </main>
  );
}
