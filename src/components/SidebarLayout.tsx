import React from 'react';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Home,
  LayoutDashboard,
  Moon,
  Plus,
  PlusCircle,
  RefreshCw,
  Settings,
  Sun,
  TrendingUp,
} from 'lucide-react';
import type { NavSection, StorageMode } from '../types/trade';

export type ThemeMode = 'light' | 'dark';

interface SidebarLayoutProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  storageMode: StorageMode;
  spreadsheetTitle: string | null;
  isSignedIn: boolean;
  userEmail: string | null;
  isSyncing: boolean;
  onRefreshSheets: () => void;
  onOpenLogin: () => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  mobileIcon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    mobileLabel: 'Home',
    icon: LayoutDashboard,
    mobileIcon: Home,
  },
  {
    id: 'add',
    label: 'Add Entry',
    mobileLabel: 'Add',
    icon: PlusCircle,
    mobileIcon: PlusCircle,
  },
  {
    id: 'analysis',
    label: 'Analysis',
    mobileLabel: 'Analysis',
    icon: BarChart3,
    mobileIcon: BarChart3,
  },
  {
    id: 'history',
    label: 'History',
    mobileLabel: 'History',
    icon: Clock,
    mobileIcon: Clock,
  },
  {
    id: 'settings',
    label: 'Settings',
    mobileLabel: 'Settings',
    icon: Settings,
    mobileIcon: Settings,
  },
];

const SECTION_TITLES: Record<
  NavSection,
  { title: string; mobileTitle: string; subtitle: string }
> = {
  dashboard: {
    title: 'Dashboard',
    mobileTitle: 'Trade Tracker',
    subtitle: 'Overview of your 50% trading profit share and recorded capital',
  },
  add: {
    title: 'Add Profit Entry',
    mobileTitle: 'Add Profit',
    subtitle: 'Record your net profit share directly without any automatic split',
  },
  analysis: {
    title: 'Profit Analysis',
    mobileTitle: 'Analysis',
    subtitle: 'Compare daily, weekly, monthly, and yearly trading performance',
  },
  history: {
    title: 'Trade History',
    mobileTitle: 'Trade History',
    subtitle: 'Search, filter, edit, and manage all recorded profit entries',
  },
  settings: {
    title: 'Settings',
    mobileTitle: 'Settings',
    subtitle: 'Manage appearance, cross-device cloud sync, and Google Sheets',
  },
};

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  activeSection,
  onNavigate,
  storageMode,
  spreadsheetTitle,
  isSignedIn,
  userEmail,
  isSyncing,
  onRefreshSheets,
  onOpenLogin,
  onSignOut,
  theme,
  onToggleTheme,
  children,
}) => {
  const currentHeader = SECTION_TITLES[activeSection];
  const isDark = theme === 'dark';

  const handleSelectNav = (section: NavSection) => {
    onNavigate(section);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleSelectNav('dashboard')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-md"
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </span>
            <span className="block text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-snug">
              My Trading Profit Tracker
            </span>
          </button>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 space-y-2.5">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Database</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {storageMode === 'sheets'
                ? spreadsheetTitle || 'Cloud + Google Sheets'
                : storageMode === 'cloud'
                  ? 'Cloud Account Sync'
                  : 'Local Browser Storage'}
            </p>
            {isSignedIn && userEmail && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                {userEmail}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => handleSelectNav('settings')}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-600 rounded"
            >
              {storageMode === 'sheets'
                ? 'Manage Sync'
                : storageMode === 'cloud'
                  ? 'Link Sheets'
                  : 'Connect Account'}
            </button>
            {isSignedIn ? (
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline underline-offset-2"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline underline-offset-2"
              >
                Login Page
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Top App Bar (48px tall; combined with 64px bottom bar = 112px < 15% of 844px) */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 h-12 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {activeSection === 'dashboard' ? (
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => handleSelectNav('dashboard')}
              aria-label="Back to Home"
              className="min-h-[40px] min-w-[40px] -ml-1.5 flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {currentHeader.mobileTitle}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {storageMode === 'sheets' && (
            <button
              type="button"
              onClick={onRefreshSheets}
              disabled={isSyncing}
              aria-label={isSyncing ? 'Syncing Google Sheet' : 'Refresh Google Sheet'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <RefreshCw
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDark}
            data-testid="mobile-theme-toggle"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop Header */}
        <header className="hidden lg:flex items-center justify-between gap-8 px-8 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
              {currentHeader.title}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 truncate">
              {currentHeader.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {storageMode === 'sheets' && (
              <button
                type="button"
                onClick={onRefreshSheets}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{isSyncing ? 'Syncing...' : 'Refresh Sheet'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={isDark}
              data-testid="header-theme-toggle"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            {activeSection !== 'add' && (
              <button
                type="button"
                onClick={() => handleSelectNav('add')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add Profit Entry</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-24 lg:py-6">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Bottom navigation"
        data-testid="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.mobileIcon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-8 h-7 rounded-lg ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/70'
                      : 'bg-transparent'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.75]'}`}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`mt-0.5 text-[11px] leading-none tracking-tight whitespace-nowrap ${
                    isActive ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
