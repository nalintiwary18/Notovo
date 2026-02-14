'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Shield, Zap, X } from 'lucide-react';

const INFO_SEEN_KEY = 'notova_info_seen_session';

interface InfoCard {
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    description: string;
}

const infoCards: InfoCard[] = [
    {
        icon: <Sparkles size={16} />,
        iconColor: 'text-emerald-400',
        title: 'AI-Powered Notes',
        description:
            'Generate beautiful, structured documents from any topic. Just describe what you need and Notova creates it instantly.',
    },
    {
        icon: <Shield size={16} />,
        iconColor: 'text-violet-400',
        title: 'Version History',
        description:
            'Every edit is saved as a version. Browse, compare, and restore any previous version of your document at any time.',
    },
    {
        icon: <Zap size={16} />,
        iconColor: 'text-amber-400',
        title: 'Smart Editing',
        description:
            'Select any text in your document and ask AI to rewrite, expand, or refine it — your notes evolve with you.',
    },
];

export default function InfoCarousel() {
    const [visible, setVisible] = useState(() => {
        if (typeof window === 'undefined') return false;
        return !sessionStorage.getItem(INFO_SEEN_KEY);
    });

    const dismiss = () => {
        sessionStorage.setItem(INFO_SEEN_KEY, 'true');
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <AnimatePresence>
            {visible && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        onClick={dismiss}
                    />

                    {/* Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.96 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div
                            className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close button */}
                            <button
                                onClick={dismiss}
                                className="absolute top-3 right-3 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors z-10"
                            >
                                <X size={16} />
                            </button>

                            {/* Header */}
                            <div className="px-6 pt-6 pb-2">
                                <div className="flex items-center gap-2.5">
                                    <h2 className="text-lg font-semibold text-neutral-100">
                                        Notovo
                                    </h2>
                                    <span className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-neutral-800 border border-neutral-700/50 text-neutral-500">
                                        v0.5.1 beta
                                    </span>
                                </div>
                                <p className="text-sm text-neutral-500 mt-0.5">
                                    Tips for getting started
                                </p>
                            </div>

                            {/* Cards row */}
                            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {infoCards.map((card, i) => (
                                    <motion.div
                                        key={card.title}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                            duration: 0.35,
                                            delay: 0.12 + i * 0.08,
                                        }}
                                        className="flex flex-col gap-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={card.iconColor}>
                                                {card.icon}
                                            </span>
                                            <span className="text-sm font-medium text-neutral-200">
                                                {card.title}
                                            </span>
                                        </div>
                                        <p className="text-xs leading-relaxed text-neutral-400">
                                            {card.description}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="px-6 pb-5 pt-2 flex justify-end">
                                <button
                                    onClick={dismiss}
                                    className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 border border-neutral-600/50 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500 transition-all duration-200"
                                >
                                    Okay, let&apos;s go
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
