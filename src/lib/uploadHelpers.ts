import { supabase } from './supabase'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg'])

/**
 * Sube una imagen a Supabase Storage con validaciones de seguridad.
 *
 * Las fotos de /registro pasan antes por `prepararFoto()` (utils/foto-registro.ts),
 * que las comprime a JPEG en el navegador; por eso aquí ya no se exige la
 * extensión del nombre (la cámara a veces no pone ninguna) y el tope de 5 MB
 * es solo una red de seguridad — el contenido real se valida por magic bytes
 * y la extensión final se deriva de ellos, nunca del nombre del archivo.
 */
export async function uploadImage(
    file: File,
    bucket: string,
    path: string
): Promise<string> {
    // Validar tamanho del archivo
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
        throw new Error(`El archivo excede el tamanho maximo de ${maxSize / 1024 / 1024}MB`)
    }

    // Validar MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error('Solo se permiten imagenes JPG o PNG')
    }

    // Validar magic bytes del archivo
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const isJPEG = header[0] === 0xFF && header[1] === 0xD8
    const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47
    if (!isJPEG && !isPNG) {
        throw new Error('El contenido del archivo no corresponde a una imagen valida')
    }

    // Generar nombre seguro (solo caracteres alfanumericos, no user-controlled extension)
    const safeExt = isPNG ? 'png' : 'jpg'
    const sanitizedPath = path.replace(/[^a-zA-Z0-9_\-/]/g, '_')
    const fileName = `${sanitizedPath}_${Date.now()}.${safeExt}`

    // Subir archivo
    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        })

    if (uploadError) {
        // Incluimos el detalle de Supabase (policy, bucket, tamaño) para poder
        // diagnosticar desde el mensaje que ve el técnico / el admin.
        throw new Error('Error al subir la imagen. Intenta de nuevo. (' + uploadError.message + ')')
    }

    // Obtener URL publica
    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)

    return data.publicUrl
}

export async function uploadFotoPerfil(file: File, tecnicoId: string): Promise<string> {
    return uploadImage(file, 'tecnicos-fotos', `${tecnicoId}/perfil`)
}

export async function uploadFotoDocumento(file: File, tecnicoId: string): Promise<string> {
    return uploadImage(file, 'tecnicos-documentos', `${tecnicoId}/documento`)
}

export async function deleteImage(bucket: string, path: string): Promise<void> {
    const { error } = await supabase.storage
        .from(bucket)
        .remove([path])

    if (error) {
        throw new Error('Error al eliminar la imagen')
    }
}

// ──────────────────────────────────────────────────────────
// Contrato de prestación de servicios firmado en físico (escaneado).
// Bucket PRIVADO `tecnicos-contratos`: solo el admin autenticado sube y lee
// (policies en 20261009_tecnicos_contrato_archivo.sql). Se guarda la RUTA en
// tecnicos.contrato_archivo_path y se lee con signed URL de corta duración.
// ──────────────────────────────────────────────────────────
import {
    CONTRATO_ARCHIVO_BUCKET,
    rutaArchivoContrato,
    validarArchivoContrato,
} from './utils/contrato-archivo'

export async function uploadContratoFirmado(file: File, tecnicoId: string, version: string): Promise<string> {
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const v = validarArchivoContrato(file.size, header)
    if (!v.ok) throw new Error(v.error)

    const path = rutaArchivoContrato(tecnicoId, version, v.tipo)
    const contentType = v.tipo === 'pdf' ? 'application/pdf' : v.tipo === 'png' ? 'image/png' : 'image/jpeg'
    const { error } = await supabase.storage
        .from(CONTRATO_ARCHIVO_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType })
    if (error) {
        throw new Error('Error al subir el contrato: ' + error.message)
    }
    return path
}

/** URL temporal (1 h) para ver/descargar el contrato escaneado. */
export async function urlContratoFirmado(path: string): Promise<string> {
    const { data, error } = await supabase.storage
        .from(CONTRATO_ARCHIVO_BUCKET)
        .createSignedUrl(path, 60 * 60)
    if (error || !data?.signedUrl) {
        throw new Error('No se pudo generar el enlace del contrato' + (error ? ': ' + error.message : ''))
    }
    return data.signedUrl
}
