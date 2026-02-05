'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Settings, User, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/AuthContext'
import { useRouter } from 'next/navigation'
import {getAvatarGradient} from "@/components/ui/avatar";
import Image from 'next/image'

interface UserMenuProps {
    collapsed?: boolean
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const { user, logout, isAuthenticated, loading } = useAuth()
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
                className="flex items-center gap-2 p-2.5  rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 text-white text-sm font-medium"
            >
                <User className="h-4 w-4" />
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

                        {/* Menu Items */}
                        <div className="p-2">
                            <button
                                onClick={() => {
                                    setIsOpen(false)
                                    // Profile placeholder - no action yet
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:text-white hover:bg-neutral-700/50 rounded-lg transition-colors group"
                            >
                                <User className="h-4 w-4 text-gray-400 group-hover:text-purple-400" />
                                <span className="flex-1 text-left text-sm">Profile</span>
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                            </button>

                            <button
                                onClick={() => {
                                    setIsOpen(false)
                                    // Settings placeholder - no action yet
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:text-white hover:bg-neutral-700/50 rounded-lg transition-colors group"
                            >
                                <Settings className="h-4 w-4 text-gray-400 group-hover:text-purple-400" />
                                <span className="flex-1 text-left text-sm">Settings</span>
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                            </button>

                            <div className="my-2 border-t border-neutral-700/50" />

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
