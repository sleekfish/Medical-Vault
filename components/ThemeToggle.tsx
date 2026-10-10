import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from './ui/Icons';

const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`p-2 rounded-lg transition-all ${
                theme === 'dark'
                    ? 'text-gray-400 hover:text-white hover:bg-white/5'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
        >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
};

export default ThemeToggle;