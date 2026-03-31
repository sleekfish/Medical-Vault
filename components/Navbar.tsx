import React from 'react'
import { ShieldCheck, LogOut, Sun, Moon } from './ui/Icons'
import { User, UserRole } from '../types'
import { useTheme } from '../context/ThemeContext'

interface NavbarProps {
    user: User | null
    onLogout: () => void
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
    const { theme, toggleTheme } = useTheme()
    const isDark = theme === 'dark'

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${
            isDark
                ? 'border-white/5 bg-black/60'
                : 'border-gray-200/80 bg-white/80'
        }`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

                {/* Logo */}
                <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-sky-500" />
                    <span className={`font-bold text-sm tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Medical Vault
                    </span>
                    <span className="hidden sm:block text-[10px] text-sky-500 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono ml-1">
                        PDPB
                    </span>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-2">

                    {/* Theme toggle */}
                    <button
                        onClick={toggleTheme}
                        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        className={`p-2 rounded-lg transition-all ${
                            isDark
                                ? 'text-gray-400 hover:text-white hover:bg-white/5'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    >
                        {isDark ? <Sun size={16} /> : <Moon size={16} />}
                    </button>

                    {user && (
                        <>
                            {/* User pill */}
                            <div className={`hidden sm:flex items-center gap-2 border rounded-lg px-3 py-1.5 ${
                                isDark
                                    ? 'bg-white/5 border-white/10'
                                    : 'bg-gray-50 border-gray-200'
                            }`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                    user.role === UserRole.PATIENT
                                        ? 'bg-sky-500/20 text-sky-500'
                                        : 'bg-green-500/20 text-green-600'
                                }`}>
                                    {user.name?.[0]?.toUpperCase() ?? '?'}
                                </div>
                                <div>
                                    <p className={`text-xs font-medium leading-none ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {user.name}
                                    </p>
                                    <p className={`text-[10px] leading-none mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {user.role}
                                    </p>
                                </div>
                            </div>

                            {/* Logout */}
                            <button
                                onClick={onLogout}
                                className={`flex items-center gap-1.5 text-xs transition-colors border rounded-lg px-3 py-1.5 ${
                                    isDark
                                        ? 'text-gray-400 hover:text-red-400 border-white/10 hover:border-red-500/30'
                                        : 'text-gray-500 hover:text-red-500 border-gray-200 hover:border-red-300 hover:bg-red-50'
                                }`}
                            >
                                <LogOut size={13} /> Logout
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    )
}

export default Navbar