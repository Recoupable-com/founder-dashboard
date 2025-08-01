"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Image from "next/image"

const navItems = [
  { name: "Dashboard", href: "/" },
  // Sales Pipeline is now integrated into the Dashboard
  { name: "Conversations", href: "/conversations" },
  { name: "Agent Templates", href: "/agent-templates" },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/App Logo Color.png" width={40} height={40} alt="App Logo" />
              <h1 className="text-xl font-bold">Founder Admin</h1>
            </Link>
          </div>
          
          <div className="flex space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center px-3 py-2 text-sm font-medium rounded-md",
                  pathname === item.href
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
} 