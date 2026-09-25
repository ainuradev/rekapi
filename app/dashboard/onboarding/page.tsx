import { redirect } from 'next/navigation'

// Halaman onboarding sudah digabung ke halaman Profil.
// Redirect agar link lama tetap berfungsi.
export default function OnboardingPage() {
    redirect('/dashboard/profil')
}
