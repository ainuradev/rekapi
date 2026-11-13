export type ImageUploadMode = 'product' | 'qris'

export interface ImageCompressionPreset {
    maxWidth: number
    maxHeight: number
    quality: number
    mimeType: 'image/webp'
    folder: string
}

export const IMAGE_COMPRESSION_PRESETS: Record<ImageUploadMode, ImageCompressionPreset> = {
    product: {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.78,
        mimeType: 'image/webp',
        folder: 'rekapi/products',
    },
    qris: {
        maxWidth: 800,
        maxHeight: 1000,
        quality: 0.92,
        mimeType: 'image/webp',
        folder: 'rekapi/qris',
    },
}

export interface UploadedImageResult {
    url: string
    width: number
    height: number
    mode: ImageUploadMode
    provider: 'cloudinary' | 'inline-webp'
}

/**
 * Menghitung dimensi proporsional tanpa memotong (tanpa crop kotak)
 * agar rasio asli gambar produk maupun matriks barcode QRIS tetap utuh.
 */
export function calculateProportionalDimensions(
    originalWidth: number,
    originalHeight: number,
    mode: ImageUploadMode
): { width: number; height: number } {
    const preset = IMAGE_COMPRESSION_PRESETS[mode]
    const safeOrigW = Math.max(1, originalWidth)
    const safeOrigH = Math.max(1, originalHeight)

    const scale = Math.min(1, preset.maxWidth / safeOrigW, preset.maxHeight / safeOrigH)
    return {
        width: Math.max(1, Math.round(safeOrigW * scale)),
        height: Math.max(1, Math.round(safeOrigH * scale)),
    }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
            const src = event.target?.result
            if (typeof src !== 'string') {
                reject(new Error('Gagal membaca file gambar.'))
                return
            }
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'))
            img.src = src
        }
        reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'))
        reader.readAsDataURL(file)
    })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        if (typeof canvas.toBlob !== 'function') {
            resolve(null)
            return
        }
        canvas.toBlob((blob) => resolve(blob), mimeType, quality)
    })
}

/**
 * Mengompresi gambar di sisi browser menjadi WebP sesuai mode ('product' atau 'qris'),
 * lalu mengunggah ke Cloudinary jika NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME dan
 * NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET tersedia.
 *
 * Fallback Pintar: Jika env Cloudinary belum dipasang atau request gagal,
 * otomatis mengembalikan Data URL WebP hasil kompresi agar fitur tetap berjalan 100% tanpa error.
 */
export async function uploadImageWithCompression(
    file: File,
    mode: ImageUploadMode = 'product'
): Promise<UploadedImageResult> {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Format file harus berupa gambar JPG, PNG, atau WebP.')
    }

    // Batas file mentah sebelum kompresi (10 MB)
    if (file.size > 10 * 1024 * 1024) {
        throw new Error('Ukuran file asli terlalu besar (maksimal 10 MB).')
    }

    const preset = IMAGE_COMPRESSION_PRESETS[mode]
    const img = await loadImageFromFile(file)
    const { width, height } = calculateProportionalDimensions(img.width, img.height, mode)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Browser tidak mendukung pemrosesan gambar Canvas.')
    }

    // Latar putih bersih agar gambar PNG transparan (khususnya barcode QRIS) tetap kontras saat dipindai
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    let dataUrl = canvas.toDataURL(preset.mimeType, preset.quality)
    if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', preset.quality)
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim()
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim()

    if (cloudName && uploadPreset) {
        try {
            const blob = await canvasToBlob(canvas, preset.mimeType, preset.quality)
            const formData = new FormData()
            if (blob) {
                formData.append('file', blob, `${mode}-${Date.now()}.webp`)
            } else {
                formData.append('file', dataUrl)
            }
            formData.append('upload_preset', uploadPreset)
            formData.append('folder', preset.folder)

            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData,
            })

            if (response.ok) {
                const payload = (await response.json()) as { secure_url?: string }
                if (payload.secure_url) {
                    return {
                        url: payload.secure_url,
                        width,
                        height,
                        mode,
                        provider: 'cloudinary',
                    }
                }
            }
        } catch {
            // Fallback otomatis ke inline WebP Data URL jika jaringan ke Cloudinary gagal
        }
    }

    return {
        url: dataUrl,
        width,
        height,
        mode,
        provider: 'inline-webp',
    }
}

