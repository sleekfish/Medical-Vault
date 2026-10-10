let audioContext: AudioContext | null = null;
let soundEnabled = true;

const getContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    try {
        if (!audioContext) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return null;
            audioContext = new Ctx();
        }
        if (audioContext.state === "suspended") {
            void audioContext.resume();
        }
        return audioContext;
    } catch {
        return null;
    }
};

export function setNotificationSoundEnabled(enabled: boolean) {
    soundEnabled = enabled;
    try {
        localStorage.setItem("medivault_notification_sound", enabled ? "on" : "off");
    } catch {}
}

export function getNotificationSoundEnabled(): boolean {
    try {
        const saved = localStorage.getItem("medivault_notification_sound");
        if (saved === "off") soundEnabled = false;
        if (saved === "on") soundEnabled = true;
    } catch {}
    return soundEnabled;
}

/** Call this from a user click (for example, clicking the bell) to unlock browser audio. */
export async function unlockNotificationAudio() {
    const ctx = getContext();
    if (!ctx) return;
    try {
        await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
    } catch {}
}

export function playNotificationSound(kind: "normal" | "prescription" | "appointment" | "emergency" = "normal") {
    if (!getNotificationSoundEnabled()) return;
    const ctx = getContext();
    if (!ctx) return;

    const notes =
        kind === "emergency" ? [880, 660, 880] :
        kind === "prescription" ? [660, 880] :
        kind === "appointment" ? [523.25, 659.25] :
        [587.33, 783.99];

    try {
        const now = ctx.currentTime;
        notes.forEach((frequency, index) => {
            const start = now + index * 0.10;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.18);
        });
    } catch {}
}
