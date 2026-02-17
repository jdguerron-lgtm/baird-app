import { supabase } from './supabase'

/**
 * Sube una imagen a Supabase Storage
 * @param file - Archivo a subir
 * @param bucket - Nombre del bucket ('tecnicos-fotos' o 'tecnicos-documentos')
 * @param path - Ruta dentro del bucket
 * @returns URL pública del archivo subido
 */
export async function uploadImage(
    file: File,
    bucket: string,
    path: string
): Promise<string> {
    // Validar tamaño del archivo
    const maxSize = bucket === 'tecnicos-documentos' ? 5 * 1024 * 1024 : 2 * 1024 * 1024 // 5MB docs, 2MB fotos
    if (file.size > maxSize) {
        throw new Error(`El archivo excede el tamaño máximo de ${maxSize / 1024 / 1024}MB`)
    }

    // Validar formato
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Solo se permiten imágenes JPG o PNG')
    }

    // Generar nombre único
    const fileExt = file.name.split('.').pop()
    const fileName = `${path}_${Date.now()}.${fileExt}`

    // Subir archivo
    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        })

    if (uploadError) {
        console.error('Error al subir archivo:', uploadError)
        throw new Error('Error al subir la imagen: ' + uploadError.message)
    }

    // Obtener URL pública
    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)

    return data.publicUrl
}

/**
 * Sube la foto de perfil de un técnico
 */
export async function uploadFotoPerfil(file: File, tecnicoId: string): Promise<string> {
    return uploadImage(file, 'tecnicos-fotos', `${tecnicoId}/perfil`)
}

/**
 * Sube la foto del documento de identidad de un técnico
 */
export async function uploadFotoDocumento(file: File, tecnicoId: string): Promise<string> {
    return uploadImage(file, 'tecnicos-documentos', `${tecnicoId}/documento`)
}

/**
 * Elimina una imagen de Supabase Storage
 */
export async function deleteImage(bucket: string, path: string): Promise<void> {
    const { error } = await supabase.storage
        .from(bucket)
        .remove([path])

    if (error) {
        console.error('Error al eliminar imagen:', error)
        throw new Error('Error al eliminar la imagen')
    }
}
