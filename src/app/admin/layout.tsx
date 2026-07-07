import React from 'react';
import Sidebar from '@/components/Sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen bg-gray-50 lg:overflow-hidden font-sans">
      {/* Sidebar (renders its own mobile top bar + drawer) */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 lg:overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
