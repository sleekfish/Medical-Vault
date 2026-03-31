import React from 'react'
import { useTheme } from '../context/ThemeContext'

const BackgroundGrid: React.FC = () => {
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    return (
        <div
            className="fixed inset-0 z-0 pointer-events-none transition-colors duration-500"
            style={{
                background: isDark ? '#050505' : '#f8fafc',
                backgroundImage: isDark
                    ? `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                       linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`
                    : `linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
                       linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)`,
                backgroundSize: '60px 60px',
            }}
        />
    )
}

export default BackgroundGrid