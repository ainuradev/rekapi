# Integrasi Midtrans untuk Subscription Billing

Panduan lengkap untuk mengintegrasikan Midtrans sebagai payment gateway untuk sistem langganan bulanan di Rekapin.

## 📋 Prerequisite

1. **Akun Midtrans**: Daftar di [https://dashboard.midtrans.com/](https://dashboard.midtrans.com/)
2. **Node.js**: Versi 18+ sudah terinstall
3. **Database Supabase**: Sudah setup dan migration berjalan

## 🔧 Setup Midtrans

### 1. Dapatkan Credential Midtrans

#### Untuk Testing (Sandbox):
1. Login ke [Midtrans Dashboard](https://dashboard.sandbox.midtrans.com/)
2. Pilih **Settings** → **Access Keys**
3. Copy:
   - **Server Key** (untuk backend)
   - **Client Key** (untuk frontend)

#### Untuk Production:
1. Lengkapi verifikasi bisnis di Midtrans
2. Aktifkan akun production
3. Ambil keys dari production dashboard

### 2. Setup Environment Variables

Edit file `.env.local` dan tambahkan:

```bash
# Midtrans Configuration
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false
NEXT_PUBLIC_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Catatan:**
- Untuk production, ganti `MIDTRANS_IS_PRODUCTION=true`
- Untuk production, ganti snap URL ke `https://app.midtrans.com/snap/snap.js`
- Ganti `NEXT_PUBLIC_SITE_URL` dengan domain production Anda

### 3. Setup Notification URL di Midtrans

1. Login ke Midtrans Dashboard
2. Pilih **Settings** → **Configuration**
3. Set **Payment Notification URL** ke: `https://your-domain.com/api/midtrans/notification`
4. Set **Finish Redirect URL** ke: `https://your-domain.com/dashboard/subscription/success`
5. Set **Error Redirect URL** ke: `https://your-domain.com/dashboard/subscription/error`
6. Set **Unfinish Redirect URL** ke: `https://your-domain.com/dashboard/subscription/pending`

Untuk development lokal, gunakan tools seperti **ngrok** untuk expose localhost:
```bash
ngrok http 3000
```
Kemudian gunakan URL ngrok untuk notification URL.

## 🗄️ Database Schema

Database sudah include table yang diperlukan:
- `subscription_plans`: Daftar paket langganan
- `subscriptions`: Record langganan per bisnis
- `payment_transactions`: Track semua transaksi pembayaran

Pastikan migration sudah dijalankan:
```bash
npx supabase db push
```

## 🚀 Testing Payment Flow

### 1. Jalankan Development Server
```bash
npm run dev
```

### 2. Login sebagai Owner
Hanya role **owner** yang bisa mengakses halaman subscription.

### 3. Akses Halaman Langganan
Navigate ke: `http://localhost:3000/dashboard/subscription`

### 4. Test Payment dengan Card Test Midtrans

Pilih paket dan gunakan test card berikut:

**Success Payment:**
- Card Number: `4811 1111 1111 1114`
- CVV: `123`
- Exp Date: `01/25`
- OTP/3DS: `112233`

**Failed Payment:**
- Card Number: `4911 1111 1111 1113`
- CVV: `123`
- Exp Date: `01/25`

**Pending Payment (Gopay/VA):**
Pilih metode e-wallet atau Virtual Account untuk test pending status.

Lihat semua test credentials di: [Midtrans Testing](https://docs.midtrans.com/docs/testing-payment-on-sandbox)

## 📁 File Structure

```
app/
├── api/
│   └── midtrans/
│       ├── create-transaction/
│       │   └── route.ts          # API untuk membuat payment token
│       └── notification/
│           └── route.ts          # Webhook handler untuk notifikasi pembayaran
└── dashboard/
    └── subscription/
        ├── page.tsx              # Server component - fetch data
        ├── subscription-client.tsx  # Client component - handle payment
        ├── success/
        │   └── page.tsx          # Callback page sukses
        ├── error/
        │   └── page.tsx          # Callback page error
        └── pending/
            └── page.tsx          # Callback page pending

lib/
└── midtrans/
    └── config.ts                 # Midtrans configuration & client
```

## 🔄 Payment Flow

1. **User memilih paket** → Client component menampilkan pilihan paket
2. **Click "Pilih Paket"** → Request ke `/api/midtrans/create-transaction`
3. **Backend create transaction** → Insert record di `subscriptions` dan `payment_transactions`
4. **Midtrans Snap popup** → User pilih metode pembayaran dan bayar
5. **User selesai bayar** → Redirect ke success/error/pending page
6. **Midtrans kirim notification** → Webhook ke `/api/midtrans/notification`
7. **Update status** → Backend update status di `payment_transactions`, `subscriptions`, dan `businesses`

## 🔐 Security Best Practices

1. **Signature Verification**: Webhook notification sudah include signature verification
2. **Server-side validation**: Semua create transaction di backend
3. **Environment variables**: Jangan commit `.env.local` ke git
4. **HTTPS only**: Di production, gunakan HTTPS untuk notification URL

## 🛠️ Troubleshooting

### Payment notification tidak diterima
- Pastikan notification URL accessible dari internet (gunakan ngrok untuk testing)
- Cek Midtrans dashboard → Notification History untuk error logs
- Verifikasi signature hash di code

### Snap popup tidak muncul
- Cek console browser untuk error
- Pastikan `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` sudah set
- Verifikasi snap.js script loaded dengan benar

### Status tidak update setelah pembayaran
- Cek webhook logs di server
- Verifikasi signature verification berjalan benar
- Check database apakah `midtrans_order_id` matching

## 📊 Monitoring & Logs

### Check Transaction Status via Midtrans API
```typescript
import { getMidtransCoreApi } from '@/lib/midtrans/config'

const coreApi = getMidtransCoreApi()
const status = await coreApi.transaction.status(orderId)
console.log(status)
```

### Check Logs di Midtrans Dashboard
1. Login ke dashboard
2. Transactions → cari berdasarkan order ID
3. Lihat detail status dan timeline

## 🎯 Next Steps

1. **Customize paket langganan**: Edit data di table `subscription_plans`
2. **Auto-renewal**: Implement recurring billing dengan Midtrans Subscription API
3. **Email notifications**: Kirim email konfirmasi setelah payment success
4. **Invoice generation**: Generate PDF invoice untuk setiap transaksi
5. **Proration**: Handle upgrade/downgrade di tengah periode

## 📚 Resources

- [Midtrans Documentation](https://docs.midtrans.com/)
- [Midtrans Node.js Library](https://github.com/Midtrans/midtrans-nodejs-client)
- [Snap Integration Guide](https://docs.midtrans.com/docs/snap-integration-guide)
- [Testing Payment](https://docs.midtrans.com/docs/testing-payment-on-sandbox)

## 💡 Tips

- Gunakan sandbox untuk development dan testing
- Test semua payment methods (card, e-wallet, VA, dll)
- Monitor notification webhook untuk debugging
- Simpan `raw_notification` di database untuk audit trail
- Set timeout yang cukup untuk webhook handler (Midtrans retry jika timeout)

---

**Butuh bantuan?** Hubungi support atau buka issue di repository.
