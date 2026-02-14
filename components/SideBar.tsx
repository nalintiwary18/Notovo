"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import {
    IconMessageCirclePlus,
    IconMessage,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import MainContent from "@/components/MainContent";
import { UIStateProvider } from "@/hooks/useUIState";
import { clearSession, getUserChatSessions, getOrCreateSessionId } from "@/lib/storage";
import { useAuth } from "@/hooks/AuthContext";
import UserMenu from "@/components/UserMenu";
import { ChatSession } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

// Inactivity timeout for anonymous sessions (10 minutes)
const ANONYMOUS_SESSION_TIMEOUT = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'notovo_last_activity';

export function SidebarDemo() {
    const [open, setOpen] = useState(false);
    const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

    // Load current session ID
    const [currentSessionId] = useState(() => getOrCreateSessionId());
    const { user, isAuthenticated } = useAuth();

    // Track activity for anonymous session timeout
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateActivity = () => {
            localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
        };

        // Check for inactivity timeout on mount (for anonymous users)
        if (!isAuthenticated) {
            const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
            if (lastActivity) {
                const elapsed = Date.now() - parseInt(lastActivity);
                if (elapsed > ANONYMOUS_SESSION_TIMEOUT) {
                    // Session expired, clear it
                    clearSession();
                    localStorage.removeItem(LAST_ACTIVITY_KEY);
                }
            }
        }

        // Update activity on user interactions
        updateActivity();
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, updateActivity));

        return () => {
            events.forEach(event => window.removeEventListener(event, updateActivity));
        };
    }, [isAuthenticated]);



    // Load user's chat sessions when authenticated
    useEffect(() => {
        const loadSessions = async () => {
            if (isAuthenticated && user?.id) {
                const sessions = await getUserChatSessions(user.id);
                setChatSessions(sessions);
            } else {
                setChatSessions([]);
            }
        };

        loadSessions();
    }, [isAuthenticated, user?.id]);

    const handleNewChat = useCallback(() => {
        // Clear the current session
        clearSession();
        // Clear activity timestamp for anonymous users
        if (!isAuthenticated) {
            localStorage.removeItem(LAST_ACTIVITY_KEY);
        }
        // Reload the page to start fresh
        window.location.reload();
    }, [isAuthenticated]);

    const handleSelectSession = useCallback((sessionId: string) => {
        if (sessionId === currentSessionId) return;
        // Set the session ID in localStorage and reload
        if (typeof window !== 'undefined') {
            localStorage.setItem('notova_session_id', sessionId);
            window.location.reload();
        }
    }, [currentSessionId]);

    const links = [
        {
            label: "New Chat",
            href: "#",
            icon: (
                <IconMessageCirclePlus className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
            ),
            onClick: handleNewChat,
        }
    ];

    return (
        <div
            className={cn(
                "mx-auto flex flex-1 flex-col overflow-hidden border border-neutral-200 bg-gray-100 md:flex-row dark:border-neutral-700 dark:bg-neutral-800",
                "h-screen",
            )}
        >
            <Sidebar open={open} setOpenAction={setOpen}>
                <SidebarBody className="justify-between gap-4">
                    <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-clip">
                        {/* Logo */}
                        <div className=" h-24">
                            <Image
                                src="/logo.svg"
                                width="50"
                                height={50}
                                alt="Logo"
                                onClick={() => setOpen(!open)}
                                className="cursor-pointer "
                            />
                        </div>


                        {/* New Chat Button */}
                        <div className="flex flex-col gap-2 ml-1">
                            {links.map((link, idx) => (
                                <SidebarLink key={idx} link={link} />
                            ))}
                        </div>

                        {/* Past Chats Section - Only for authenticated users */}
                        <AnimatePresence>
                            {isAuthenticated && chatSessions.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-6"
                                >
                                    {open && (
                                        <div>
                                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2">
                                                Chats
                                            </p>
                                            <div
                                                className="overflow-y-auto overflow-x-hidden max-h-[60vh]"
                                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                            >

                                                <div className="flex flex-col gap-1">
                                                    {chatSessions.map((session) => (
                                                        <button
                                                            key={session.id}
                                                            onClick={() => handleSelectSession(session.id)}
                                                            className={cn(
                                                                "flex items-center gap-2 py-2 px-2 rounded-lg transition-colors text-left w-full",
                                                                session.id === currentSessionId
                                                                    ? "bg-purple-500/20 text-purple-300"
                                                                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                                                            )}
                                                        >
                                                            <IconMessage className="h-4 w-4 shrink-0" />
                                                            {open && (
                                                                <motion.span
                                                                    initial={{ opacity: 0 }}
                                                                    animate={{ opacity: 1 }}
                                                                    className="text-sm truncate"
                                                                >
                                                                    {session.title || 'Untitled Chat'}
                                                                </motion.span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>


                                    )}


                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* User Menu at bottom */}
                    <div className="pt-4 border-t border-neutral-700/50">
                        <UserMenu collapsed={!open} />
                        <p className="text-[10px] text-neutral-600 text-center mt-2 select-none">
                            {open ? 'v0.5.1 beta' : 'β'}
                        </p>
                    </div>
                </SidebarBody>
            </Sidebar>
            <UIStateProvider>
                <MainContent />
            </UIStateProvider>
        </div>
    );
}


export const Dashboard = () => {
    return (
        <div className="flex flex-1">
            <div className="flex h-full w-full flex-1 flex-col gap-2 rounded-tl-2xl border border-neutral-200 bg-white p-2 md:p-10 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex gap-2">
                    {[...new Array(4)].map((i, idx) => (
                        <div
                            key={"first-array-demo-1" + idx}
                            className="h-20 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-neutral-800"
                        ></div>
                    ))}
                </div>
                <div className="flex flex-1 gap-2">
                    {[...new Array(2)].map((i, idx) => (
                        <div
                            key={"second-array-demo-1" + idx}
                            className="h-full w-full animate-pulse rounded-lg bg-gray-100 dark:bg-neutral-800"
                        ></div>
                    ))}
                </div>
            </div>
        </div>
    );
};
