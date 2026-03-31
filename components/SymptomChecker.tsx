import React, { useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle, Loader2, Stethoscope, AlertTriangle, Info } from './ui/Icons';
import { useToast } from '../context/ToastContext';
import { MedicalRecord, SymptomCheckResult } from '../types';

interface SymptomCheckerProps {
    records: MedicalRecord[];
}

const severityConfig = {
    LOW: { color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle size={16} />, label: 'Low priority' },
    MEDIUM: { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', icon: <Info size={16} />, label: 'Monitor closely' },
    HIGH: { color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: <AlertTriangle size={16} />, label: 'See a doctor soon' },
    EMERGENCY: { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: <AlertCircle size={16} />, label: 'Seek emergency care' },
};

const SymptomChecker: React.FC<SymptomCheckerProps> = ({ records }) => {
    const { addToast } = useToast();
    const [symptoms, setSymptoms] = useState('');
    const [duration, setDuration] = useState('1-3 days');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SymptomCheckResult | null>(null);
    const [streamText, setStreamText] = useState('');

    const recordContext = records.slice(0, 5).map(r => `- ${r.name} (${r.date})`).join('\n');

    const analyzeSymptoms = async () => {
        if (!symptoms.trim()) {
            addToast('error', 'Please describe your symptoms first.');
            return;
        }

        setLoading(true);
        setResult(null);
        setStreamText('');

        try {
            const prompt = `You are a medical triage assistant. A patient has described symptoms and you must assess them carefully.

Patient's recent medical records:
${recordContext || 'No records available'}

Symptoms reported: ${symptoms}
Duration: ${duration}

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "triageSeverity": "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY",
  "possibleConditions": ["condition1", "condition2", "condition3"],
  "recommendation": "A clear, actionable 2-3 sentence recommendation",
  "relatedRecords": ["record name if relevant, else empty array"],
  "disclaimer": "This is an AI-generated triage suggestion only and not a medical diagnosis. Always consult a licensed physician."
}`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1000,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            const data = await response.json();
            const text = data.content?.map((c: any) => c.text || '').join('') || '';

            const clean = text.replace(/```json|```/g, '').trim();
            const parsed: SymptomCheckResult = JSON.parse(clean);
            setResult(parsed);
        } catch (err) {
            addToast('error', 'Analysis failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const sev = result ? severityConfig[result.triageSeverity] : null;

    return (
        <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-violet-500/10 rounded-lg">
                    <Sparkles size={18} className="text-violet-400" />
                </div>
                <div>
                    <h3 className="text-white font-bold">AI Symptom Checker</h3>
                    <p className="text-xs text-gray-500">Powered by Claude · Not a substitute for medical advice</p>
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1.5">Describe your symptoms</label>
                <textarea
                    value={symptoms}
                    onChange={e => setSymptoms(e.target.value)}
                    placeholder="e.g. I have had a persistent headache, mild fever, and sore throat for the past 2 days..."
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none h-28"
                />
            </div>

            <div className="mb-5">
                <label className="block text-xs text-gray-400 mb-1.5">Duration</label>
                <select
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                    <option>Less than 24 hours</option>
                    <option>1-3 days</option>
                    <option>4-7 days</option>
                    <option>1-2 weeks</option>
                    <option>More than 2 weeks</option>
                </select>
            </div>

            <button
                onClick={analyzeSymptoms}
                disabled={loading}
                className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? 'Analysing…' : 'Analyse symptoms'}
            </button>

            {loading && (
                <div className="mt-6 space-y-3">
                    {['Reviewing symptom description...', 'Cross-referencing medical records...', 'Generating triage assessment...'].map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                            {s}
                        </div>
                    ))}
                </div>
            )}

            {result && sev && (
                <div className="mt-6 space-y-4">
                    {/* Severity badge */}
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${sev.color}`}>
                        {sev.icon}
                        <div>
                            <p className="font-medium text-sm">{sev.label}</p>
                            <p className="text-xs opacity-70">{result.triageSeverity} severity</p>
                        </div>
                    </div>

                    {/* Possible conditions */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Possible conditions</p>
                        <div className="flex flex-wrap gap-2">
                            {result.possibleConditions.map(c => (
                                <span key={c} className="text-xs bg-black/40 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">{c}</span>
                            ))}
                        </div>
                    </div>

                    {/* Recommendation */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Recommendation</p>
                        <p className="text-sm text-white leading-relaxed">{result.recommendation}</p>
                    </div>

                    {/* Related records */}
                    {result.relatedRecords.length > 0 && (
                        <div className="bg-white/5 rounded-xl p-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Relevant records in your vault</p>
                            {result.relatedRecords.map(r => (
                                <div key={r} className="flex items-center gap-2 text-sm text-sky-400">
                                    <Stethoscope size={13} />
                                    {r}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-300/80">{result.disclaimer}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SymptomChecker;