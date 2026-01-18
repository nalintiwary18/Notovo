"use client";
import React, { useState } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import {
    IconMessageCirclePlus,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import MainContent from "@/components/MainContent";
import { UIStateProvider } from "@/hooks/useUIState";
import { clearSession } from "@/lib/storage";


export function SidebarDemo() {
    const handleNewChat = () => {
        // Clear the current session
        clearSession();
        // Reload the page to start fresh
        window.location.reload();
    };

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
    const [open, setOpen] = useState(false);
    return (
        <div
            className={cn(
                "mx-auto flex flex-1 flex-col overflow-hidden rounded-md border border-neutral-200 bg-gray-100 md:flex-row dark:border-neutral-700 dark:bg-neutral-800",
                "h-screen", // for your use case, use `h-screen` instead of `h-[60vh]`
            )}
        >
            <Sidebar open={open} setOpenAction={setOpen}>
                <SidebarBody className="justify-between gap-10">
                    <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
                        <Image
                            src="/logo.svg"
                            width={50}
                            height={50}
                            alt="Logo"
                            onClick={() => setOpen(!open)}
                        />
                        <div className="mt-8 flex flex-col gap-2">
                            {links.map((link, idx) => (
                                <SidebarLink key={idx} link={link} />
                            ))}
                        </div>
                    </div>
                    <div>
                        <SidebarLink
                            link={{
                                label: "XYZ",
                                href: "#",
                                icon: (
                                    <Image
                                        src="/avatar.svg"
                                        className="h-7 w-7 shrink-0 rounded-full"
                                        width={50}
                                        height={50}
                                        alt="Avatar"
                                    />
                                ),
                            }}
                        />
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
