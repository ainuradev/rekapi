import { cookies } from 'next/headers'

export const ACTIVE_BRANCH_COOKIE_NAME = 'rekapi_active_branch_id'

export async function getActiveBranchId(): Promise<string | null> {
    try {
        const cookieStore = await cookies()
        const val = cookieStore.get(ACTIVE_BRANCH_COOKIE_NAME)?.value
        return val || null
    } catch {
        return null
    }
}
