import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#070a12] tech-grid relative overflow-hidden transition-all duration-300">
      
      {/* Ambient Cyber Beams */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-500/5 dark:bg-blue-500/3 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[65%] h-[65%] rounded-full bg-teal-500/5 dark:bg-teal-500/3 blur-[120px] pointer-events-none z-0" />
      
      {/* Fixed Full-Width Top Header */}
      <div className="flex-shrink-0 z-50">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} />
      </div>

      {/* Main Container: Fixed Sidebar + Scrollable Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden relative z-10 scrollbar-thin">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
