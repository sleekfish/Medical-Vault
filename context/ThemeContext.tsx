import React, { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'dark' | 'light'
interface ThemeContextType { theme: Theme; toggleTheme: () => void }

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {} })

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            return (localStorage.getItem('vault_theme') as Theme) || 'light' // default: light
        } catch {
            return 'light'
        }
    })

    useEffect(() => {
        try {
            const root = document.documentElement
            if (theme === 'dark') {
                root.classList.add('dark')
                root.classList.remove('light')
                root.style.colorScheme = 'dark'
            } else {
                root.classList.remove('dark')
                root.classList.add('light')
                root.style.colorScheme = 'light'
            }
            localStorage.setItem('vault_theme', theme)
        } catch {}
    }, [theme])

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => useContext(ThemeContext)