'use client';

import React, { useEffect, useState } from 'react';

interface AnalysisItem {
    조항: string;
    불공정_가능성: '높음' | '중간' | '낮음';
    문제_조항_요약: string;
    소비자_불리_이유: string;
    법적_쟁점_키워드: string[];
    개선_권고: string;
}

interface Props {
    results: AnalysisItem[];
}

export default function RiskScoreChart({ results }: Props) {
    const [animatedScore, setAnimatedScore] = useState(0);
    const [animatedProgress, setAnimatedProgress] = useState(0);

    const total = results.length;
    const highCount = results.filter((r) => r.불공정_가능성 === '높음').length;
    const midCount = results.filter((r) => r.불공정_가능성 === '중간').length;
    const lowCount = results.filter((r) => r.불공정_가능성 === '낮음').length;

    // Score: 100 = safest, 0 = most dangerous
    // high = -30pts each, mid = -15pts each, low = -5pts each
    const rawDeduction = highCount * 30 + midCount * 15 + lowCount * 5;
    const score = Math.max(0, Math.min(100, 100 - rawDeduction));

    const getGrade = (s: number) => {
        if (s >= 80) return { label: '양호', color: '#10b981', desc: '대체로 공정한 계약서입니다' };
        if (s >= 60) return { label: '주의', color: '#f59e0b', desc: '일부 불공정 조항이 발견되었습니다' };
        if (s >= 40) return { label: '위험', color: '#f97316', desc: '상당수 불공정 조항이 포함되어 있습니다' };
        return { label: '매우 위험', color: '#ef4444', desc: '심각한 불공정 조항이 다수 포함되어 있습니다' };
    };

    const grade = getGrade(score);

    // Donut chart
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

    useEffect(() => {
        // Animate score counting
        const duration = 1200;
        const steps = 60;
        const stepTime = duration / steps;
        let current = 0;
        const increment = score / steps;

        const timer = setInterval(() => {
            current += increment;
            if (current >= score) {
                current = score;
                clearInterval(timer);
            }
            setAnimatedScore(Math.round(current));
            setAnimatedProgress(current);
        }, stepTime);

        return () => clearInterval(timer);
    }, [score]);

    return (
        <div className="risk-score-panel">
            <div className="score-header">
                <h3 className="score-title">📊 종합 위험도 평가</h3>
            </div>

            <div className="score-body">
                {/* Donut Chart */}
                <div className="donut-wrapper">
                    <svg className="donut-chart" viewBox="0 0 180 180">
                        {/* Background circle */}
                        <circle
                            cx="90" cy="90" r={radius}
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="12"
                        />
                        {/* Progress circle */}
                        <circle
                            cx="90" cy="90" r={radius}
                            fill="none"
                            stroke={grade.color}
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            transform="rotate(-90 90 90)"
                            style={{ transition: 'stroke-dashoffset 0.1s ease-out', filter: `drop-shadow(0 0 8px ${grade.color}50)` }}
                        />
                    </svg>
                    <div className="donut-center">
                        <div className="donut-score" style={{ color: grade.color }}>
                            {animatedScore}
                        </div>
                        <div className="donut-label">/ 100</div>
                    </div>
                </div>

                {/* Grade + Description */}
                <div className="score-info">
                    <span className="grade-badge" style={{ background: `${grade.color}18`, color: grade.color, border: `1px solid ${grade.color}40` }}>
                        {grade.label}
                    </span>
                    <p className="grade-desc">{grade.desc}</p>
                </div>
            </div>

            {/* Statistics Bar */}
            <div className="stats-section">
                <div className="stat-row">
                    <div className="stat-label">
                        <span className="stat-dot high" />
                        높음 (명확한 법 위반)
                    </div>
                    <div className="stat-bar-wrapper">
                        <div
                            className="stat-bar high"
                            style={{ width: total > 0 ? `${(highCount / total) * 100}%` : '0%' }}
                        />
                    </div>
                    <span className="stat-count">{highCount}건</span>
                </div>
                <div className="stat-row">
                    <div className="stat-label">
                        <span className="stat-dot mid" />
                        중간 (위반 가능성)
                    </div>
                    <div className="stat-bar-wrapper">
                        <div
                            className="stat-bar mid"
                            style={{ width: total > 0 ? `${(midCount / total) * 100}%` : '0%' }}
                        />
                    </div>
                    <span className="stat-count">{midCount}건</span>
                </div>
                <div className="stat-row">
                    <div className="stat-label">
                        <span className="stat-dot low" />
                        낮음 (양호)
                    </div>
                    <div className="stat-bar-wrapper">
                        <div
                            className="stat-bar low"
                            style={{ width: total > 0 ? `${(lowCount / total) * 100}%` : '0%' }}
                        />
                    </div>
                    <span className="stat-count">{lowCount}건</span>
                </div>
            </div>

            <div className="score-total">
                총 <strong>{total}</strong>개 조항 분석 완료
            </div>
        </div>
    );
}
