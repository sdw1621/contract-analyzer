'use client';

import React from 'react';

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
    onReset: () => void;
}

function getRiskClass(risk: string): string {
    if (risk === '높음') return 'high';
    if (risk === '중간') return 'mid';
    return 'low';
}

function getRiskEmoji(risk: string): string {
    if (risk === '높음') return '🔴';
    if (risk === '중간') return '🟡';
    return '🟢';
}

export default function AnalysisResult({ results, onReset }: Props) {
    const highCount = results.filter((r) => r.불공정_가능성 === '높음').length;
    const midCount = results.filter((r) => r.불공정_가능성 === '중간').length;
    const lowCount = results.filter((r) => r.불공정_가능성 === '낮음').length;

    return (
        <div className="results-container">
            <div className="results-header">
                <h2 className="results-title">
                    📋 분석 결과
                </h2>
                <button className="new-analysis-btn" onClick={onReset}>
                    새로운 분석
                </button>
            </div>

            <div className="results-summary">
                {highCount > 0 && (
                    <span className="summary-badge high">🔴 높음 {highCount}</span>
                )}
                {midCount > 0 && (
                    <span className="summary-badge mid">🟡 중간 {midCount}</span>
                )}
                {lowCount > 0 && (
                    <span className="summary-badge low">🟢 낮음 {lowCount}</span>
                )}
            </div>

            {results.map((item, index) => (
                <div
                    key={index}
                    className="result-card"
                    style={{ animationDelay: `${index * 0.08}s` }}
                >
                    <div className="card-header">
                        <h3 className="card-title">
                            {getRiskEmoji(item.불공정_가능성)} {item.조항}
                        </h3>
                        <span className={`risk-badge ${getRiskClass(item.불공정_가능성)}`}>
                            {item.불공정_가능성}
                        </span>
                    </div>

                    <div className="card-section">
                        <div className="card-section-label">문제 조항 요약</div>
                        <div className="card-section-content summary">
                            {item.문제_조항_요약}
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="card-section-label">소비자에게 불리한 이유</div>
                        <div className="card-section-content">
                            {item.소비자_불리_이유}
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="card-section-label">관련 법적 쟁점</div>
                        <div className="keywords-list">
                            {item.법적_쟁점_키워드.map((keyword, kidx) => (
                                <span key={kidx} className="keyword-tag">
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="card-section-label">개선 권고</div>
                        <div className="recommendation">{item.개선_권고}</div>
                    </div>
                </div>
            ))}

            <div className="disclaimer">
                ⚠️ 본 분석 결과는 AI 기반 참고 자료이며, 법적 자문을 대체하지 않습니다.
                정확한 법률 검토는 전문 법률가에게 문의하시기 바랍니다.
            </div>
        </div>
    );
}
