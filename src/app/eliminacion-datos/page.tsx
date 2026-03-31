import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Eliminacion de Datos | Baird Service S.A.S',
  description: 'Solicita la eliminacion de tus datos personales de Baird Service S.A.S',
};

export default function EliminacionDatosPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">
          Solicitud de Eliminacion de Datos
        </h1>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Como solicitar la eliminacion de tus datos</h2>
          <p className="mb-4 text-gray-700 leading-relaxed">
            En Baird Service S.A.S respetamos tu derecho a la eliminacion de datos personales conforme
            a la Ley 1581 de 2012 de Colombia. Si deseas que eliminemos tus datos personales de nuestra
            plataforma, puedes hacerlo de las siguientes maneras:
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Opcion 1: Por correo electronico</h2>
          <p className="text-gray-700 leading-relaxed">
            Envia un correo a <a href="mailto:soporte@bairdservice.com" className="text-blue-600 hover:underline">soporte@bairdservice.com</a> con
            el asunto &quot;Solicitud de eliminacion de datos&quot; e incluye tu nombre completo y numero de
            telefono registrado.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Opcion 2: Por WhatsApp</h2>
          <p className="text-gray-700 leading-relaxed">
            Escribenos a nuestro numero de WhatsApp de soporte solicitando la eliminacion de tus datos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Datos que se eliminaran</h2>
          <p className="mb-2 text-gray-700">Al procesar tu solicitud, eliminaremos:</p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Tu informacion personal (nombre, telefono, direccion).</li>
            <li>Historial de solicitudes de servicio.</li>
            <li>Fotografias y evidencias asociadas a tus servicios.</li>
            <li>Registros de comunicaciones por WhatsApp.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Plazo de procesamiento</h2>
          <p className="text-gray-700 leading-relaxed">
            Tu solicitud sera procesada en un plazo maximo de 15 dias habiles a partir de la recepcion
            de la solicitud. Recibirás una confirmación una vez que tus datos hayan sido eliminados.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Excepciones</h2>
          <p className="text-gray-700 leading-relaxed">
            Algunos datos podran ser retenidos cuando exista una obligacion legal o contractual que lo
            requiera, como registros contables o fiscales exigidos por la legislacion colombiana.
          </p>
        </section>
      </div>
    </main>
  );
}
