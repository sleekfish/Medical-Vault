import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Activity } from './ui/Icons';
import { MOCK_VITALS_HISTORY } from '../services/mockData';
import { VitalsReading } from '../types';

type Metric = 'heartRate' | 'spo2' | 'systolic' | 'glucose' | 'weight';
type Range  = '7d' | '30d' | '90d';

const metricConfig: Record<Metric, { label: string; unit: string; color: string; min: number; max: number }> = {
    heartRate: { label: 'Heart rate',           unit: 'BPM',   color: '#E24B4A', min: 50,  max: 110 },
    spo2:      { label: 'SpO2',                 unit: '%',     color: '#378ADD', min: 90,  max: 102 },
    systolic:  { label: 'Blood pressure (sys)', unit: 'mmHg',  color: '#1D9E75', min: 100, max: 150 },
    glucose:   { label: 'Blood glucose',        unit: 'mg/dL', color: '#EF9F27', min: 70,  max: 140 },
    weight:    { label: 'Weight',               unit: 'kg',    color: '#7F77DD', min: 70,  max: 80  },
};

function loadChartJs(): Promise<void> {
    return new Promise(resolve => {
        if ((window as any).Chart) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });
}

const HealthTrends: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef  = useRef<any>(null);
    const [metric, setMetric] = useState<Metric>('heartRate');
    const [range, setRange]   = useState<Range>('30d');
    const [ready, setReady]   = useState(!!(window as any).Chart);

    useEffect(() => {
        if (!ready) loadChartJs().then(() => setReady(true));
    }, []);

    const getData = (): VitalsReading[] => {
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
        return MOCK_VITALS_HISTORY.slice(-days);
    };

    useEffect(() => {
        if (!ready || !canvasRef.current) return;
        chartRef.current?.destroy();
        const data   = getData();
        const cfg    = metricConfig[metric];
        const values = data.map(d => d[metric] as number);
        const labels = data.map(d => { const dt = new Date(d.timestamp); return `${dt.getMonth() + 1}/${dt.getDate()}`; });
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        chartRef.current = new (window as any).Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ data: values, borderColor: cfg.color, backgroundColor: cfg.color + '15', borderWidth: 2, pointRadius: range === '90d' ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: cfg.color, tension: 0.4, fill: true }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => `${Math.round(c.parsed.y * 10) / 10} ${cfg.unit}` } } },
                scales: {
                    x: { ticks: { maxTicksLimit: range === '7d' ? 7 : 10, font: { size: 11 }, color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: cfg.min, max: cfg.max, ticks: { font: { size: 11 }, color: '#6b7280', callback: (v: any) => `${v} ${cfg.unit}` }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
        return () => { chartRef.current?.destroy(); chartRef.current = null; };
    }, [ready, metric, range]);

    const data   = getData();
    const values = data.map(d => d[metric] as number);
    const avg    = values.reduce((a, b) => a + b, 0) / values.length;
    const min    = Math.min(...values);
    const max    = Math.max(...values);
    const trend  = values[values.length - 1] - values[0];
    const cfg    = metricConfig[metric];

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-teal-500/10 rounded-lg"><TrendingUp size={18} className="text-teal-400" /></div>
                <div><h3 className="text-white font-bold">Health Trends</h3><p className="text-xs text-gray-500">90-day biometric history</p></div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
                {(Object.keys(metricConfig) as Metric[]).map(m => (
                    <button key={m} onClick={() => setMetric(m)}
                            style={metric === m ? { borderColor: metricConfig[m].color, color: metricConfig[m].color, background: metricConfig[m].color + '15' } : {}}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${metric === m ? '' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                        {metricConfig[m].label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                    { label: 'Average', value: `${Math.round(avg * 10) / 10}` },
                    { label: 'Min',     value: `${Math.round(min * 10) / 10}` },
                    { label: 'Max',     value: `${Math.round(max * 10) / 10}` },
                    { label: 'Trend',   value: `${trend >= 0 ? '+' : ''}${Math.round(trend * 10) / 10}` },
                ].map(s => (
                    <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className="text-lg font-bold" style={{ color: cfg.color }}>{s.value}</p>
                        <p className="text-[10px] text-gray-600">{cfg.unit}</p>
                    </div>
                ))}
            </div>

            <div className="flex gap-2 mb-4">
                {(['7d','30d','90d'] as Range[]).map(r => (
                    <button key={r} onClick={() => setRange(r)}
                            className={`px-3 py-1 text-xs rounded-lg border transition-all ${range === r ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                        {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
                    </button>
                ))}
            </div>

            <div className="bg-black/50 rounded-xl p-4" style={{ height: 260 }}>
                {ready
                    ? <canvas ref={canvasRef} />
                    : <div className="flex items-center justify-center h-full text-gray-600 text-sm">Loading chart…</div>
                }
            </div>

            <div className="mt-4 flex items-start gap-2 p-3 bg-white/5 rounded-xl">
                <Activity size={14} className="text-sky-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-400">
                    Your {cfg.label.toLowerCase()} has {Math.abs(trend) < 2 ? 'remained stable' : trend > 0 ? 'increased slightly' : 'decreased slightly'} over the past {range === '7d' ? 'week' : range === '30d' ? 'month' : '3 months'}.
                    Average of <strong className="text-white">{Math.round(avg * 10) / 10} {cfg.unit}</strong> is within normal range.
                </p>
            </div>
        </div>
    );
};

export default HealthTrends;