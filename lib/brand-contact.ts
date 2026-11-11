export const BRAND_CONTACT = {
    brandName: 'Rekapi',
    tagline: 'Platform Kasir POS & Pembukuan Akuntansi UMKM Indonesia',
    address: 'Bogor, Jawa Barat, Indonesia',
    whatsappNumber: '6281234567890',
    whatsappDisplay: '+62 812-3456-7890',
    email: 'support@rekapi.id',
    instagram: '@rekapi.id',
    instagramUrl: 'https://instagram.com/rekapi.id',
    tiktok: '@rekapi.id',
    tiktokUrl: 'https://tiktok.com/@rekapi.id',
} as const

export function getWhatsAppUrl(customMessage?: string): string {
    const defaultMessage =
        'Halo Admin Rekapi, saya ingin bertanya seputar layanan Kasir POS & Pembukuan Rekapi.'
    const message = customMessage?.trim() ? customMessage.trim() : defaultMessage
    return `https://wa.me/${BRAND_CONTACT.whatsappNumber}?text=${encodeURIComponent(message)}`
}

