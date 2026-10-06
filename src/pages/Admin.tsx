import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LayoutDashboard, Image, Package, DollarSign, Ticket, Megaphone, Users, Home, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

import DashboardTab from './admin/DashboardTab';
import PostersTab from './admin/PostersTab';
import OrdersTab from './admin/OrdersTab';
import PricingTab from './admin/PricingTab';
import CouponsTab from './admin/CouponsTab';
import SalesTab from './admin/SalesTab';
import CustomersTab from './admin/CustomersTab';
import HomepageTab from './admin/HomepageTab';
import AnalyticsTab from './admin/AnalyticsTab';

type Tab = 'dashboard' | 'posters' | 'orders' | 'pricing' | 'coupons' | 'sales' | 'customers' | 'homepage' | 'analytics';

export default function Admin() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  if (!user?.is_admin) return (
    <div className="min-h-screen bg-z-paper flex items-center justify-center p-6">
      <div className="max-w-md w-full p-12 bg-z-paper border-4 border-z-border shadow-[12px_12px_0px_0px_var(--color-z-shadow)] text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-8" />
        <h1 className="font-display font-black text-4xl uppercase tracking-tighter   mb-6 text-z-ink">ACCESS_<span className="text-red-600">DENIED</span></h1>
        <Link to="/" className="sticker-btn bg-z-ink text-z-paper w-full mt-10 block text-center">GO HOME</Link>
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'posters', label: 'Posters', icon: <Image className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders', icon: <Package className="w-4 h-4" /> },
    { id: 'pricing', label: 'Catalog', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-4 h-4" /> },
    { id: 'sales', label: 'Sales', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'homepage', label: 'Homepage', icon: <Home className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-z-paper">
      <div className="max-w-7xl mx-auto px-6 pt-40 pb-32">
        <header className="mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-z-orange font-black mb-2">ADMIN PANEL</p>
          <h1 className="font-display font-black text-4xl md:text-6xl uppercase tracking-tighter leading-none   text-z-ink">
            Control_<span className="text-z-orange">Center</span>
          </h1>
        </header>

        <nav className="flex flex-wrap gap-1.5 mb-8 border-b-2 border-z-border/20 pb-4 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-mono font-black uppercase tracking-wider border-2 transition-all whitespace-nowrap active:scale-95 active:opacity-80 ${
                activeTab === tab.id
                  ? 'bg-z-orange text-white border-z-orange shadow-[2px_2px_0px_0px_var(--color-z-shadow)]'
                  : 'bg-z-paper text-z-ink border-z-border/30 hover:border-z-orange hover:text-z-orange'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'dashboard' && <DashboardTab token={token} />}
        {activeTab === 'posters' && <PostersTab token={token} />}
        {activeTab === 'orders' && <OrdersTab token={token} />}
        {activeTab === 'pricing' && <PricingTab token={token} />}
        {activeTab === 'coupons' && <CouponsTab token={token} />}
        {activeTab === 'sales' && <SalesTab token={token} />}
        {activeTab === 'customers' && <CustomersTab token={token} />}
        {activeTab === 'homepage' && <HomepageTab token={token} />}
        {activeTab === 'analytics' && <AnalyticsTab token={token} />}
      </div>
    </div>
  );
}
