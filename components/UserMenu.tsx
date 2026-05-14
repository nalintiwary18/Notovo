'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, User, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/AuthContext'
import { useUsage } from '@/hooks/useUsage'
import { useRouter } from 'next/navigation'
import { getAvatarGradient } from "@/components/ui/avatar";
import Image from 'next/image'

interface UserMenuProps {
    collapsed?: boolean
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const { user, logout, isAuthenticated, loading } = useAuth()
    const { summary: usageSummary } = useUsage()
    const router = useRouter()

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleLogout = async () => {
        await logout()
        setIsOpen(false)
        router.push('/')
    }

    const handleLogin = () => {
        router.push('/login')
    }

    // Get user display info
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
    const displayEmail = user?.email || ''
    const avatarUrl = user?.user_metadata?.avatar_url || null
    const initials = displayName.charAt(0).toUpperCase()
    const avatarSeed = user?.id || user?.email || displayName
    const gradient = getAvatarGradient(avatarSeed)


    if (loading) {
        return (
            <div className="flex items-center gap-2 py-2">
                <div className="h-8 w-8 rounded-full bg-neutral-700 animate-pulse" />
                {!collapsed && <div className="h-4 w-20 rounded bg-neutral-700 animate-pulse" />}
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <button
                onClick={handleLogin}
                className="flex items-center gap-2 py-2 hover:bg-neutral-700/50 rounded-lg transition-colors w-full"
            >
                <div className="p-4 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-semibold">
                    <User className="h-4 w-4 absolute" />
                </div>
                {!collapsed && (
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-neutral-200 text-sm"
                    >
                        Login
                    </motion.span>
                )}
            </button>
        )
    }

    return (
        <div ref={menuRef} className="relative">
            {/* Trigger Button */}
            <button
                onMouseEnter={() => setIsOpen(true)}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 py-2 hover:bg-neutral-700/50 rounded-lg transition-colors w-full"
            >
                <div
                    className={`p-4 rounded-full bg-gradient-to-br ${gradient}flex items-center justify-center text-white text-sm font-semibold`}
                />
                {!collapsed && (
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-neutral-200 text-sm truncate max-w-[120px]"
                    >
                        {displayName}
                    </motion.span>
                )}
            </button>

            {/* Popup Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        onMouseLeave={() => setIsOpen(false)}
                        className="absolute bottom-full left-0 mb-2 w-64 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50"
                    >
                        {/* User Info Header */}
                        <div className="p-4 border-b border-neutral-700/50 bg-neutral-800/80">
                            <div className="flex items-center gap-3">
                                {avatarUrl ? (
                                    <Image
                                        src={avatarUrl}
                                        alt="Avatar"
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 rounded-full object-cover border-2 border-purple-500/50"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-medium">
                                        {initials}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium text-sm truncate">{displayName}</p>
                                    <p className="text-gray-400 text-xs truncate">{displayEmail}</p>
                                </div>
                            </div>
                        </div>

                        {/* ── Credits / Usage Display ── */}
                        {usageSummary !== null && (
                            <div className="px-4 py-3 border-b border-neutral-700/50">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                                        <Zap className="h-3 w-3 text-yellow-400" />
                                        <span>Credits remaining</span>
                                    </div>
                                    <span className="text-xs font-semibold text-white">
                                        {usageSummary.credits} / {usageSummary.maxCredits}
                                    </span>
                                </div>
                                {/* Progress bar: fraction of total credits remaining */}
                                <div className="h-1.5 w-full bg-neutral-700 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: `${usageSummary.maxCredits > 0
                                                ? Math.min(100, (usageSummary.credits / usageSummary.maxCredits) * 100)
                                                : 0}%`
                                        }}
                                        transition={{ duration: 0.6, ease: 'easeOut' }}
                                        className={`h-full rounded-full ${
                                            usageSummary.credits > usageSummary.maxCredits * 0.2
                                                ? 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                                : 'bg-gradient-to-r from-orange-500 to-red-500'
                                        }`}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-xs text-neutral-500 capitalize">
                                        {usageSummary.plan} plan
                                    </span>
                                    <span className="text-xs text-neutral-500">
                                        {usageSummary.editsRemaining} / {usageSummary.editsLimit} AI edits today
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Menu Items */}
                        <div className="p-2">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors group"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="flex-1 text-left text-sm">Sign out</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
