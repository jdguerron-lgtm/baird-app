import { supabase } from './supabase'

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png'])
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg'])

/**
 * Sube una imagen a Supabase Storage con validaciones de seguridad
 */
export async function uploadImage(
    file: File,
    bucket: string,
    path: string
): Promise<string> {
    // Validar tamanho del archivo
    const maxSize = bucket === 'tecnicos-documentos' ? 5 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxSize) {
        throw new Error(`El archivo excede el tamanho maximo de ${maxSize / 1024 / 1024}MB`)
    }

    // Validar MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error('Solo se permiten imagenes JPG o PNG')
    }

    // Extraer y validar extension de forma segura
    const nameParts = file.name.split('.')
    const fileExt = (nameParts.length > 1 ? nameParts.pop() : '')?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
        throw new Error('Extension de archivo no permitida. Solo JPG o PNG.')
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
        throw new Error('Error al subir la imagen. Intenta de nuevo.')
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
