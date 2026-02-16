import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Menu, X, LogOut, User, LayoutDashboard, Calculator, Package, BarChart3, MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const navigation = [
  { name: 'Dashboard', href: createPageUrl('Dashboard'), icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Calculator', href: createPageUrl('Calculator'), icon: Calculator, page: 'Calculator' },
  { name: 'Inventory', href: createPageUrl('Inventory'), icon: Package, page: 'Inventory' },
  { name: 'Analytics', href: createPageUrl('Analytics'), icon: BarChart3, page: 'Analytics' },
  { name: 'Support', href: createPageUrl('AgentChat'), icon: MessageSquare, page: 'AgentChat' }];


  if (user?.role === 'admin') {
    navigation.push({ name: 'Invite Users', href: createPageUrl('InviteUsers'), icon: Users, page: 'InviteUsers' });
  }

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div style={{ fontFamily: "'Ingram Mono', monospace" }} className="min-h-screen bg-slate-50">
      <style>{`
        * {
          font-family: 'Ingram Mono', monospace !important;
        }
        body::-webkit-scrollbar {
          display: none;
        }
        body {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center py-6 pr-6 pl-0">
          <Link to={createPageUrl('Dashboard')} className="flex items-center">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/f2bc037c5_Screenshot2026-02-14160229.png" 
              alt="ALKIMI Logo"
              className="h-12"
              style={{ filter: 'invert(1)' }}
            />
          </Link>
        </div>
      </header>


































































      {/* Mobile Navigation */}
        {mobileMenuOpen &&
        <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-1">
              {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ?
                  'bg-slate-100 text-slate-900' :
                  'text-slate-600 hover:bg-slate-50'}`
                  }
                  onClick={() => setMobileMenuOpen(false)}>

                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>);

            })}
              {user &&
            <>
                  <div className="pt-3 mt-3 border-t border-slate-200">
                    <div className="px-3 py-2 text-sm text-slate-500">
                      {user.full_name || user.email}
                      {user.role === 'admin' &&
                  <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded">Admin</span>
                  }
                    </div>
                    <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50">

                      <LogOut className="h-5 w-5" />
                      Logout
                    </button>
                  </div>
                </>
            }
            </div>
          </div>
        }
      </header>

      {/* Main Content */}
      <main className="min-h-[calc(100vh-4rem)]">
        {children}
      </main>
    </div>);

}