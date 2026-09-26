import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Wajib dipanggil — ini yang men-refresh token & sinkronkan cookie session.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard')

    // Allow access to auth pages, expired page, and subscription page
    const allowedPaths = [
        '/dashboard/expired',
        '/dashboard/subscription',
        '/dashboard/subscription/success',
        '/dashboard/subscription/pending',
        '/dashboard/subscription/error',
    ]
    const isAllowedPath = allowedPaths.some(path => request.nextUrl.pathname.startsWith(path))

    // Guard sederhana: redirect ke /login kalau belum login dan akses halaman dashboard.
    if (isDashboardRoute && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Check subscription status for dashboard access
    if (user && isDashboardRoute && !isAllowedPath) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('business_id, businesses(subscription_status, trial_ends_at, subscription_expires_at)')
            .eq('id', user.id)
            .single()

        if (profile) {
            const businessData = (profile as any)?.businesses
            const subscriptionStatus = businessData?.subscription_status || 'expired'
            const trialEndsAt = businessData?.trial_ends_at
            const subscriptionExpiresAt = businessData?.subscription_expires_at

            const now = new Date()
            let hasAccess = false

            // Check trial access
            if (subscriptionStatus === 'trial' && trialEndsAt) {
                const trialEnd = new Date(trialEndsAt)
                hasAccess = now <= trialEnd
            }

            // Check paid subscription access
            if (subscriptionStatus === 'active' && subscriptionExpiresAt) {
                const subscriptionEnd = new Date(subscriptionExpiresAt)
                hasAccess = now <= subscriptionEnd
            }

            // Redirect to expired page if no access
            if (!hasAccess) {
                const url = request.nextUrl.clone()
                url.pathname = '/dashboard/expired'
                return NextResponse.redirect(url)
            }
        }
    }

    // Redirect away from expired page if they have access
    if (user && request.nextUrl.pathname === '/dashboard/expired') {
        const { data: profile } = await supabase
            .from('profiles')
            .select('business_id, businesses(subscription_status, trial_ends_at, subscription_expires_at)')
            .eq('id', user.id)
            .single()

        if (profile) {
            const businessData = (profile as any)?.businesses
            const subscriptionStatus = businessData?.subscription_status || 'expired'
            const trialEndsAt = businessData?.trial_ends_at
            const subscriptionExpiresAt = businessData?.subscription_expires_at

            const now = new Date()
            let hasAccess = false

            if (subscriptionStatus === 'trial' && trialEndsAt) {
                const trialEnd = new Date(trialEndsAt)
                hasAccess = now <= trialEnd
            }

            if (subscriptionStatus === 'active' && subscriptionExpiresAt) {
                const subscriptionEnd = new Date(subscriptionExpiresAt)
                hasAccess = now <= subscriptionEnd
            }

            if (hasAccess) {
                const url = request.nextUrl.clone()
                url.pathname = '/dashboard'
                return NextResponse.redirect(url)
            }
        }
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}