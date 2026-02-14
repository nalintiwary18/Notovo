'use client'

import { SidebarDemo } from "@/components/SideBar";
import InfoCarousel from "@/components/InfoCarousel";


export default function Home() {
  return (
    <section className="dark bg-gray-950">
      <InfoCarousel />
      <SidebarDemo />
    </section>
  );
}
