/**
 * lib/usage.ts
 *
 * Central module for all token-based usage tracking, limit enforcement,
 * and feature gating in Notovo.
 *
 * Rules:
 * - Do NOT partially execute a pipeline if limit is exceeded.
 * - Return structured errors on block; never crash the pipeline.
 * - Preserve existing document state on any failure.
 */

import { supabase } from './supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_TOKEN_LIMIT   = 200_000   // tokens per week
const FREE_MAX_PAGES     = 10
const FREE_EDITS_PER_DAY = 5

const PRO_TOKEN_LIMIT   = 1_000_000  // future-ready
const PRO_MAX_PAGES     = 50
const PRO_EDITS_PER_DAY = 100

/**
 * Approx chars per token (GPT-style average).
 * Used for estimation since streaming doesn't expose usage metadata.
 */
const CHARS_PER_TOKEN = 4

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro'

export interface UserUsage {
    user_id:        string
    plan:           Plan
    token_usage:    number
    token_limit:    number
    reset_at:       string
    edits_today:    number
    edits_limit:    number
    edits_reset_at: string
}

export interface FeatureFlags {
    canUseAdvancedPlanning: boolean
    canGenerateDiagrams:    boolean
    maxPages:               number
    maxEditsPerDay:         number
}

export interface UsageCheckResult {
    allowed: boolean
    code?:   'TOKEN_LIMIT_EXCEEDED' | 'EDIT_LIMIT_EXCEEDED' | 'PAGE_LIMIT_EXCEEDED' | 'USAGE_FETCH_FAILED'
    message?: string
    /** Current usage state, included in all results for visibility */
    usage?: {
        used:      number
        limit:     number
        remaining: number
        /** Human-friendly "credits" (tokens / 10000, rounded) */
        credits:   number
    }
}

// ─── Plan feature flags ───────────────────────────────────────────────────────

export function getFeatureFlags(plan: Plan): FeatureFlags {
    if (plan === 'pro') {
        return {
            canUseAdvancedPlanning: true,
            canGenerateDiagrams:    true,
            maxPages:               PRO_MAX_PAGES,
            maxEditsPerDay:         PRO_EDITS_PER_DAY,
        }
    }
    return {
        canUseAdvancedPlanning: false,
        canGenerateDiagrams:    false,
        maxPages:               FREE_MAX_PAGES,
        maxEditsPerDay:         FREE_EDITS_PER_DAY,
    }
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Estimate token count from a plain string (fast approximation).
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// ─── Core: get / upsert usage row ─────────────────────────────────────────────

/**
 * Fetch the user's current usage row, creating a default one if none exists.
 * Also handles weekly token reset and daily edit reset transparently.
 */
export async function getUserUsage(userId: string): Promise<UserUsage | null> {
    const { data, error } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', userId)
        .single()

    if (error && error.code !== 'PGRST116') {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error('Error fetching user_usage:', error.code, error.message, error.details)
        return null
    }

    const now = new Date()

    if (!data) {
        // New user — create default free plan row
        const newRow = {
            user_id:        userId,
            plan:           'free' as Plan,
            token_usage:    0,
            token_limit:    FREE_TOKEN_LIMIT,
            reset_at:       new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            edits_today:    0,
            edits_limit:    FREE_EDITS_PER_DAY,
            edits_reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        }
        const { data: inserted, error: insertError } = await supabase
            .from('user_usage')
            .insert(newRow)
            .select()
            .single()

        if (insertError) {
            // Supabase errors have non-enumerable properties — log fields explicitly
            console.error('Error creating user_usage row:', insertError.code, insertError.message, insertError.details)
            return null
        }
        return inserted as UserUsage
    }

    // Check & apply weekly token reset
    let needsUpdate = false
    const updates: Partial<UserUsage> = {}

    if (new Date(data.reset_at) <= now) {
        updates.token_usage = 0
        updates.reset_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        needsUpdate = true
    }

    // Check & apply daily edit reset
    if (new Date(data.edits_reset_at) <= now) {
        updates.edits_today = 0
        updates.edits_reset_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
        needsUpdate = true
    }

    if (needsUpdate) {
        const { data: updated, error: updateError } = await supabase
            .from('user_usage')
            .update(updates)
            .eq('user_id', userId)
            .select()
            .single()

        if (updateError) {
            console.error('Error resetting user_usage:', updateError)
            // Return stale data rather than null — better to be slightly wrong than to crash
            return data as UserUsage
        }
        return updated as UserUsage
    }

    return data as UserUsage
}

// ─── Limit checks (call BEFORE any LLM call) ─────────────────────────────────

/**
 * Check if the user has enough token budget to proceed.
 * Returns `allowed: true` with usage info, or a structured error.
 */
export async function checkTokenLimit(userId: string): Promise<UsageCheckResult> {
    const usage = await getUserUsage(userId)

    if (!usage) {
        // Can't verify — fail open to avoid blocking users on DB errors
        return { allowed: true }
    }

    const usageInfo = {
        used:      usage.token_usage,
        limit:     usage.token_limit,
        remaining: Math.max(0, usage.token_limit - usage.token_usage),
        // 1 credit = 1,000 tokens → 20k limit = 20 credits max
        credits:   Math.max(0, Math.floor((usage.token_limit - usage.token_usage) / 1_000)),
    }

    if (usage.token_usage >= usage.token_limit) {
        return {
            allowed: false,
            code:    'TOKEN_LIMIT_EXCEEDED',
            message: "You've reached your weekly usage limit. Upgrade to Pro to continue.",
            usage:   usageInfo,
        }
    }

    return { allowed: true, usage: usageInfo }
}

/**
 * Check if the document's page count is within the user's plan limit.
 * Call this BEFORE extracting file content (pass estimated pages from file size).
 *
 * @param estimatedPages  number of pages inferred from file metadata
 */
export async function checkPageLimit(
    userId: string,
    estimatedPages: number
): Promise<UsageCheckResult> {
    const usage = await getUserUsage(userId)
    if (!usage) return { allowed: true }

    const flags = getFeatureFlags(usage.plan as Plan)

    if (estimatedPages > flags.maxPages) {
        return {
            allowed: false,
            code:    'PAGE_LIMIT_EXCEEDED',
            message: `Free plan supports up to ${flags.maxPages} pages. Upgrade to Pro to process larger documents.`,
        }
    }
    return { allowed: true }
}

/**
 * Check if the user has remaining AI edits for today.
 * Does NOT increment — call `incrementEditCount` after a successful edit.
 */
export async function checkEditLimit(userId: string): Promise<UsageCheckResult> {
    const usage = await getUserUsage(userId)
    if (!usage) return { allowed: true }

    if (usage.edits_today >= usage.edits_limit) {
        return {
            allowed: false,
            code:    'EDIT_LIMIT_EXCEEDED',
            message: `You've used all ${usage.edits_limit} AI edits for today. Upgrade to Pro for more.`,
        }
    }
    return { allowed: true }
}

// ─── Increment helpers (call AFTER a successful LLM call) ────────────────────

/**
 * Increment token usage by the given amount.
 * Fire-and-forget: does not throw on failure.
 */
export async function incrementTokenUsage(userId: string, tokens: number): Promise<void> {
    if (!userId || tokens <= 0) return

    const { error } = await supabase.rpc('increment_token_usage', {
        p_user_id: userId,
        p_tokens:  tokens,
    })

    if (error) {
        // Fallback: direct update (less atomic, but works without the RPC)
        const usage = await getUserUsage(userId)
        if (usage) {
            await supabase
                .from('user_usage')
                .update({ token_usage: usage.token_usage + tokens })
                .eq('user_id', userId)
        }
    }
}

/**
 * Increment the daily edit counter by 1.
 * Uses a SECURITY DEFINER RPC so it works from server-side API routes
 * where auth.uid() is null and RLS would block a plain UPDATE.
 * Fire-and-forget.
 */
export async function incrementEditCount(userId: string): Promise<void> {
    if (!userId) return

    const { error } = await supabase.rpc('increment_edit_count', {
        p_user_id: userId,
    })

    if (error) {
        // Fallback: plain update (works if called client-side with user session)
        console.error('RPC increment_edit_count failed:', error.code, error.message)
        const usage = await getUserUsage(userId)
        if (usage) {
            await supabase
                .from('user_usage')
                .update({ edits_today: usage.edits_today + 1 })
                .eq('user_id', userId)
        }
    }
}

// ─── Usage summary (for UI display) ──────────────────────────────────────────

/**
 * Returns a lightweight summary suitable for the UserMenu credit display.
 */
export async function getUsageSummary(userId: string): Promise<{
    credits:        number
    maxCredits:     number
    plan:           Plan
    editsRemaining: number
    editsLimit:     number
} | null> {
    const usage = await getUserUsage(userId)
    if (!usage) return null

    const tokensRemaining = Math.max(0, usage.token_limit - usage.token_usage)
    // 1 credit = 1,000 tokens → 20k limit = 20 credits max
    return {
        credits:        Math.floor(tokensRemaining / 1_000),
        maxCredits:     Math.ceil(usage.token_limit / 1_000),
        plan:           usage.plan as Plan,
        editsRemaining: Math.max(0, usage.edits_limit - usage.edits_today),
        editsLimit:     usage.edits_limit,
    }
}
