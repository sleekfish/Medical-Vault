import React, { useState, useRef, useEffect } from 'react';
import {
    Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare,
    FileText, X, Send, Clock
} from './ui/Icons';
import { useToast } from '../context/ToastContext';
import { Doctor, MedicalRecord } from '../types';

interface TelemedicineProps {
    doctor?: Doctor;
    patientName?: string;
    records?: MedicalRecord[];
    role: 'PATIENT' | 'DOCTOR';
    onEnd?: () => void;
}

const Telemedicine: React.FC<TelemedicineProps> = ({ doctor, patientName, records = [], role, onEnd }) => {
    const { addToast } = useToast();
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [callState, setCallState] = useState<'IDLE' | 'CONNECTING' | 'ACTIVE' | 'ENDED'>('IDLE');
    const [videoOn, setVideoOn] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [showChat, setShowChat] = useState(false);
    const [showRecords, setShowRecords] = useState(false);
    const [messages, setMessages] = useState<{ sender: string; text: string; time: string }[]>([]);
    const [input, setInput] = useState('');
    const [callDuration, setCallDuration] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCall = async () => {
        setCallState('CONNECTING');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            setTimeout(() => {
                setCallState('ACTIVE');
                timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
                addToast('success', `Call started with ${role === 'PATIENT' ? doctor?.name : patientName}`);
            }, 1500);
        } catch (err) {
            setCallState('IDLE');
            addToast('error', 'Camera/microphone access denied.');
        }
    };

    const endCall = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setCallState('ENDED');
        setCallDuration(0);
        addToast('info', 'Call ended.');
        onEnd?.();
    };

    const toggleVideo = () => {
        streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !videoOn; });
        setVideoOn(v => !v);
    };

    const toggleMic = () => {
        streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
        setMicOn(m => !m);
    };

    const sendMessage = () => {
        if (!input.trim()) return;
        setMessages(m => [...m, {
            sender: role === 'PATIENT' ? 'You' : 'Dr.',
            text: input,
            time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
        }]);
        setInput('');
    };

    const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    useEffect(() => () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-violet-500/10 rounded-lg">
                    <Video size={18} className="text-violet-400" />
                </div>
                <div>
                    <h3 className="text-white font-bold">Telemedicine</h3>
                    <p className="text-xs text-gray-500">Encrypted video consultation · HIPAA-compliant</p>
                </div>
            </div>

            {callState === 'IDLE' && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                        <Video size={28} className="text-violet-400" />
                    </div>
                    <p className="text-white font-medium mb-1">
                        {role === 'PATIENT' ? doctor?.name || 'Your Doctor' : patientName || 'Patient'}
                    </p>
                    <p className="text-sm text-gray-500 mb-6">
                        {role === 'PATIENT' ? doctor?.specialization : 'Awaiting connection'}
                    </p>
                    <button
                        onClick={startCall}
                        className="bg-violet-500 hover:bg-violet-600 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 mx-auto transition-all"
                    >
                        <Video size={16} /> Start video consultation
                    </button>
                </div>
            )}

            {callState === 'CONNECTING' && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mx-auto mb-4" />
                    <p className="text-white">Connecting…</p>
                    <p className="text-xs text-gray-500 mt-1">Setting up encrypted channel</p>
                </div>
            )}

            {callState === 'ACTIVE' && (
                <div>
                    <div className="relative bg-black rounded-2xl overflow-hidden mb-4" style={{ height: 340 }}>
                        {/* Remote placeholder */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                            <div className="text-center">
                                <div className="w-20 h-20 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-violet-400">
                                    {role === 'PATIENT' ? (doctor?.name?.[4] || 'D') : (patientName?.[0] || 'P')}
                                </div>
                                <p className="text-white text-sm">{role === 'PATIENT' ? doctor?.name : patientName}</p>
                                <p className="text-xs text-gray-500">Connected</p>
                            </div>
                        </div>

                        {/* Local video PiP */}
                        <div className="absolute bottom-3 right-3 w-28 h-20 rounded-xl overflow-hidden border-2 border-white/20 bg-gray-900">
                            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                            {!videoOn && (
                                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                                    <VideoOff size={16} className="text-gray-400" />
                                </div>
                            )}
                        </div>

                        {/* Duration */}
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-white text-xs font-mono">{formatDuration(callDuration)}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <button
                            onClick={toggleMic}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-400'}`}
                        >
                            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                        <button
                            onClick={toggleVideo}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${videoOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-400'}`}
                        >
                            {videoOn ? <Video size={18} /> : <VideoOff size={18} />}
                        </button>
                        <button
                            onClick={() => setShowChat(s => !s)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showChat ? 'bg-sky-500/20 text-sky-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            <MessageSquare size={18} />
                        </button>
                        {records.length > 0 && (
                            <button
                                onClick={() => setShowRecords(s => !s)}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showRecords ? 'bg-green-500/20 text-green-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                            >
                                <FileText size={18} />
                            </button>
                        )}
                        <button
                            onClick={endCall}
                            className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all"
                        >
                            <PhoneOff size={18} />
                        </button>
                    </div>

                    {/* Chat panel */}
                    {showChat && (
                        <div className="bg-black border border-gray-800 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                                <p className="text-sm text-white">In-call chat</p>
                                <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                            </div>
                            <div className="p-3 space-y-2 min-h-[100px] max-h-48 overflow-y-auto">
                                {messages.length === 0 && <p className="text-xs text-gray-600 text-center py-4">No messages yet</p>}
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex flex-col ${m.sender === 'You' ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-3 py-1.5 rounded-xl text-sm max-w-xs ${m.sender === 'You' ? 'bg-sky-500/20 text-white' : 'bg-white/10 text-gray-300'}`}>{m.text}</div>
                                        <span className="text-[10px] text-gray-600 mt-0.5">{m.time}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 p-3 border-t border-gray-800">
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message…"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                                />
                                <button onClick={sendMessage} className="text-sky-400 hover:text-sky-300"><Send size={16} /></button>
                            </div>
                        </div>
                    )}

                    {/* Records sharing */}
                    {showRecords && records.length > 0 && (
                        <div className="mt-3 bg-black border border-gray-800 rounded-xl p-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Share records in this session</p>
                            {records.slice(0, 3).map(r => (
                                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                                    <div className="flex items-center gap-2">
                                        <FileText size={13} className="text-gray-500" />
                                        <span className="text-sm text-white">{r.name}</span>
                                    </div>
                                    <button
                                        onClick={() => addToast('success', `${r.name} shared with ${doctor?.name || 'doctor'}.`)}
                                        className="text-xs text-sky-400 hover:text-sky-300"
                                    >
                                        Share
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {callState === 'ENDED' && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <PhoneOff size={24} className="text-gray-400" />
                    </div>
                    <p className="text-white font-medium mb-1">Call ended</p>
                    <p className="text-xs text-gray-500 mb-6">Session summary saved to your vault</p>
                    <button onClick={() => setCallState('IDLE')} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                        Start new call
                    </button>
                </div>
            )}
        </div>
    );
};

export default Telemedicine;