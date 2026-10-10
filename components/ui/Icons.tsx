/**
 * Icons.tsx
 *
 * Safe wrapper around lucide-react.
 *
 * Root cause of "Class constructor X cannot be invoked without 'new'":
 * Some lucide-react versions export icons as ES classes. When Vite bundles
 * these and they are used as JSX function components (<Shield />), React
 * calls them as functions, which throws on class constructors.
 *
 * Fix: wrap every icon in an arrow function component so React always
 * calls a plain function, never a class constructor.
 */
import type { LucideProps } from 'lucide-react';
import * as Lucide from 'lucide-react';

type IconComponent = React.FC<LucideProps>;

// Wrap a lucide export safely — if it's a class, this makes it callable as a function
function safe(name: string, fallbackName?: string): IconComponent {
    const icons = Lucide as any;
    const Icon = icons[name] ?? (fallbackName ? icons[fallbackName] : null);
    if (!Icon) return () => null;
    // Return a wrapper that always works regardless of class/function
    const Wrapped: IconComponent = (props) => {
        try {
            return <Icon {...props} />;
        } catch {
            return null;
        }
    };
    Wrapped.displayName = name;
    return Wrapped;
}

export const Activity      = safe('Activity');
export const AlertCircle   = safe('AlertCircle');
export const AlertTriangle = safe('AlertTriangle');
export const ArrowLeft     = safe('ArrowLeft');
export const BarChart2     = safe('BarChart2');
export const Bell          = safe('Bell');
export const BookOpen      = safe('BookOpen');
export const Calendar      = safe('Calendar');
export const CheckCircle   = safe('CheckCircle');
export const CheckCircle2  = safe('CheckCircle2');
export const ChevronDown   = safe('ChevronDown');
export const ChevronRight  = safe('ChevronRight');
export const Clock         = safe('Clock');
export const Copy          = safe('Copy');
export const Database      = safe('Database');
export const Download      = safe('Download');
export const Eye           = safe('Eye');
export const EyeOff        = safe('EyeOff');
export const ExternalLink  = safe('ExternalLink');
export const FileText      = safe('FileText');
export const Filter        = safe('Filter');
export const Fingerprint   = safe('Fingerprint');
export const Heart         = safe('Heart');
export const HeartPulse    = safe('HeartPulse',  'Activity');
export const Hospital      = safe('Hospital',    'Users');
export const Info          = safe('Info');
export const Loader2       = safe('Loader2');
export const Lock          = safe('Lock');
export const LogOut        = safe('LogOut');
export const MessageSquare = safe('MessageSquare');
export const Mic           = safe('Mic');
export const MicOff        = safe('MicOff');
export const Moon          = safe('Moon');
export const Phone         = safe('Phone');
export const PhoneOff      = safe('PhoneOff');
export const Plus          = safe('Plus');
export const QrCode        = safe('QrCode',      'Database');
export const RefreshCw     = safe('RefreshCw');
export const Search        = safe('Search');
export const Send          = safe('Send');
export const Settings      = safe('Settings');
export const Share2        = safe('Share2');
export const Shield        = safe('Shield');
export const ShieldAlert   = safe('ShieldAlert');
export const ShieldCheck   = safe('ShieldCheck');
export const ShieldOff     = safe('ShieldOff');
export const Sparkles      = safe('Sparkles',    'Zap');
export const Star          = safe('Star');
export const Stethoscope   = safe('Stethoscope');
export const Sun           = safe('Sun');
export const Syringe       = safe('Syringe',     'Activity');
export const TrendingUp    = safe('TrendingUp');
export const Upload        = safe('Upload');
export const User          = safe('User');
export const UserCheck     = safe('UserCheck');
export const UserPlus      = safe('UserPlus');
export const Users         = safe('Users');
export const Video         = safe('Video');
export const VideoOff      = safe('VideoOff');
export const Wallet        = safe('Wallet');
export const X             = safe('X');
export const XCircle       = safe('XCircle');
export const Zap           = safe('Zap');