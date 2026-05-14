'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getUsageSummary, Plan } from '@/lib/usage'
import { useAuth } from '@/hooks/AuthContext'

interface UsageSummary {
    credits:        number
    maxCredits:     number
    plan:           Plan
    editsRemaining: number
    editsLimit:     number
}

const POLL_INTERVAL_MS = 30_000 // refetch every 30 seconds

/**
 * Client-side hook to fetch and expose the current user's usage summary.
 * - Fetches immediately when user changes
 * - Polls every 30s so credit display stays current after LLM calls
 * - Refetches on window focus (tab switch back)
 */
export function useUsage() {
    const { user, isAuthenticated } = useAuth()
    const [summary, setSummary] = useState<UsageSummary | null>(null)
    const [loading, setLoading] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchSummary = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setSummary(null)
            return
        }
        setLoading(true)
        try {
            const data = await getUsageSummary(user.id)
            setSummary(data)
        } catch (err) {
            console.error('useUsage fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [user?.id, isAuthenticated])

    // Initial fetch + polling
    useEffect(() => {
        fetchSummary()

        // Clear any existing interval
        if (pollRef.current) clearInterval(pollRef.current)

        if (isAuthenticated && user?.id) {
            pollRef.current = setInterval(fetchSummary, POLL_INTERVAL_MS)
        }

        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [fetchSummary, isAuthenticated, user?.id])

    // Refetch when user focuses the tab (picks up changes from background LLM increments)
    useEffect(() => {
        const onFocus = () => {
            if (isAuthenticated && user?.id) fetchSummary()
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [fetchSummary, isAuthenticated, user?.id])

    return { summary, loading, refetch: fetchSummary }
}
