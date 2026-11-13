import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Brand Contact & Floating WhatsApp CS Widget Verification', async (t) => {
    const rootDir = process.cwd()

    await t.test('1. lib/brand-contact.ts defines official Rekapi identity and getWhatsAppUrl helper', () => {
        const contactPath = path.join(rootDir, 'lib/brand-contact.ts')
        assert.ok(fs.existsSync(contactPath), 'lib/brand-contact.ts must exist')

        const src = fs.readFileSync(contactPath, 'utf8')
        assert.ok(src.includes("brandName: 'Rekapi'"), 'Must define brandName')
        assert.ok(src.includes("tagline: 'Platform Kasir POS & Pembukuan Akuntansi UMKM Indonesia'"), 'Must define tagline')
        assert.ok(src.includes("address: 'Bogor, Jawa Barat, Indonesia'"), 'Must define address')
        assert.match(src, /whatsappNumber:\s*'628\d+'/, 'Must define whatsappNumber')
        assert.match(src, /whatsappDisplay:\s*'\+62\s*8\d+/, 'Must define whatsappDisplay')
        assert.ok(src.includes("email: 'support@rekapi.id'"), 'Must define email')
        assert.ok(src.includes("instagram: '@rekapi.id'"), 'Must define instagram handle')
        assert.ok(src.includes("tiktok: '@rekapi.id'"), 'Must define tiktok handle')
        assert.ok(src.includes('export function getWhatsAppUrl'), 'Must export getWhatsAppUrl helper')
    })

    await t.test('2. components/whatsapp-cs-widget.tsx implements Floating Button and Quick Chat Templates', () => {
        const widgetPath = path.join(rootDir, 'components/whatsapp-cs-widget.tsx')
        assert.ok(fs.existsSync(widgetPath), 'components/whatsapp-cs-widget.tsx must exist')

        const src = fs.readFileSync(widgetPath, 'utf8')
        assert.ok(src.includes('fixed bottom-5 right-5 z-50'), 'Must position widget at fixed bottom-5 right-5 z-50')
        assert.ok(src.includes('Chat CS Rekapi'), 'Must display Chat CS Rekapi label on desktop button')
        assert.ok(src.includes('Customer Service'), 'Must display Customer Service header')
        assert.ok(src.includes('Biasanya membalas dalam beberapa menit'), 'Must display response time subtitle')
        assert.ok(src.includes('Tanya Fitur & Demo Aplikasi'), 'Must include Quick Topic 1')
        assert.ok(src.includes('Konsultasi Paket Langganan UMKM'), 'Must include Quick Topic 2')
        assert.ok(src.includes('Konfirmasi Pembayaran Manual'), 'Must include Quick Topic 3')
        assert.ok(src.includes('Hubungi via WhatsApp Sekarang'), 'Must include main CTA button in footer')
    })

    await t.test('3. Landing Page, Subscription, and Expired pages integrate BRAND_CONTACT and WhatsAppCSWidget', () => {
        const landingSrc = fs.readFileSync(path.join(rootDir, 'app/page.tsx'), 'utf8')
        assert.ok(landingSrc.includes('BRAND_CONTACT'), 'Landing page must use BRAND_CONTACT')
        assert.ok(landingSrc.includes('<WhatsAppCSWidget />'), 'Landing page must mount <WhatsAppCSWidget />')
        assert.ok(landingSrc.includes('Alamat Operasional'), 'Landing page footer must display Alamat Operasional')
        assert.ok(landingSrc.includes('Media Sosial Resmi'), 'Landing page footer must display Media Sosial Resmi')

        const subSrc = fs.readFileSync(path.join(rootDir, 'app/dashboard/subscription/subscription-client.tsx'), 'utf8')
        assert.ok(subSrc.includes('BRAND_CONTACT'), 'SubscriptionClient must use BRAND_CONTACT')
        assert.ok(subSrc.includes('getWhatsAppUrl'), 'SubscriptionClient must use getWhatsAppUrl')

        const expSrc = fs.readFileSync(path.join(rootDir, 'app/dashboard/expired/page.tsx'), 'utf8')
        assert.ok(expSrc.includes('BRAND_CONTACT'), 'ExpiredPage must use BRAND_CONTACT')
        assert.ok(expSrc.includes('getWhatsAppUrl'), 'ExpiredPage must use getWhatsAppUrl')
    })
})

