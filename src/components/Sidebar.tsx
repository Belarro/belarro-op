'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  DashboardIcon,
  LeafIcon,
  UsersIcon,
  ShoppingCartIcon,
  BoxIcon,
  ClipboardListIcon,
  PhoneIcon,
  SparklesIcon,
} from './Icons';

const sections = [
  {
    title: null,
    items: [{ label: 'Dashboard', href: '/admin', icon: DashboardIcon }],
  },
  {
    title: 'Farm',
    items: [
      { label: 'Crops', href: '/admin/crops', icon: LeafIcon },
      { label: 'Production', href: '/admin/production', icon: SparklesIcon },
      { label: 'Inventory', href: '/admin/inventory', icon: BoxIcon },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Customers', href: '/admin/customers', icon: UsersIcon },
      { label: 'Orders', href: '/admin/orders', icon: ShoppingCartIcon },
      { label: 'Follow-ups', href: '/admin/follow-ups', icon: PhoneIcon },
      { label: 'Import Leads', href: '/admin/import', icon: ClipboardListIcon },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Invoices', href: '/admin/invoices', icon: ClipboardListIcon },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { label: 'Submissions', href: '/admin/submissions', icon: ClipboardListIcon },
      { label: 'Testimonials', href: '/admin/testimonials', icon: SparklesIcon },
      { label: 'Crop Summary', href: '/admin/prices', icon: LeafIcon },
    ],
  },
  {
    title: null,
    items: [
      { label: 'Users', href: '/admin/users', icon: UsersIcon },
      { label: 'Field App', href: '/field', icon: PhoneIcon },
      { label: 'Settings', href: '/admin/settings', icon: SparklesIcon },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the drawer on route change (mobile).
  useEffect(() => { setOpen(false); }, [pathname]);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
    router.replace('/login');
  }

  const content = (
    <>
      {/* Brand logo */}
      <div className="p-6 border-b border-gray-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          B
        </div>
        <div>
          <h1 className="font-bold text-gray-900 text-lg leading-tight">Belarro</h1>
          <p className="text-xs text-gray-500 font-medium">Farm Management</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.title && (
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const IconComponent = item.icon;
              // Strict match for dashboard, prefix match for others to keep active state
              const isActive = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 group ${
                    isActive
                      ? 'bg-green-50 text-green-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <IconComponent
                    className={`w-5 h-5 transition-colors shrink-0 ${
                      isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition flex items-center justify-center gap-2"
        >
          Sign out
        </button>
        <p className="text-[11px] text-gray-400 font-medium text-center">Belarro V4 Admin</p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar: hamburger + brand, shown below lg only */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">B</div>
        <span className="font-bold text-gray-900">Belarro</span>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Desktop: static sidebar. Mobile: slide-in drawer. */}
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col z-50
          fixed inset-y-0 left-0 w-72 transform transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:w-64 lg:h-screen lg:sticky lg:top-0`}
      >
        {content}
      </aside>
    </>
  );
}
