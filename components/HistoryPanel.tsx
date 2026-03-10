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

export interface HistoryEntry {
    id: string;
    fileName: string;
    analyzedAt: string; // ISO string
    score: number;
    results: AnalysisItem[];
    highCount: number;
    midCount: number;
    lowCount: number;
}

interface Props {
    history: HistoryEntry[];
    onSelect: (entry: HistoryEntry) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
    selectedId?: string | null;
}

function getGradeColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
}

function getGradeLabel(score: number): string {
    if (score >= 80) return '양호';
    if (score >= 60) return '주의';
    if (score >= 40) return '위험';
    return '매우 위험';
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

export default function HistoryPanel({
    history,
    onSelect,
    onDelete,
    onClear,
    selectedId
}: Props) {
    if (history.length === 0) {
        return (
            <div className="history-panel">
                <div className="history-header">
                    <h3 className="history-title">📁 분석 이력</h3>
                </div>
                <div className="history-empty">
                    <div className="history-empty-icon">📋</div>
                    <p>아직 분석 이력이 없습니다</p>
                    <p className="history-empty-sub">파일을 업로드하여 첫 분석을 시작하세요</p>
                </div>
            </div>
        );
    }

    return (
        <div className="history-panel">
            <div className="history-header">
                <h3 className="history-title">📁 분석 이력 <span className="history-count">{history.length}</span></h3>
                <button className="history-clear-btn" onClick={onClear}>전체 삭제</button>
            </div>

            <div className="history-list">
                {history.map((entry) => {
                    const color = getGradeColor(entry.score);
                    const label = getGradeLabel(entry.score);
                    const isSelected = selectedId === entry.id;

                    return (
                        <div
                            key={entry.id}
                            className={`history-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelect(entry)}
                        >
                            <div className="history-item-top">
                                <div className="history-item-name" title={entry.fileName}>
                                    {entry.fileName}
                                </div>
                                <button
                                    className="history-delete-btn"
                                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                                    title="삭제"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="history-item-bottom">
                                <span className="history-item-date">{formatDate(entry.analyzedAt)}</span>
                                <div className="history-item-stats">
                                    <span className="history-score-badge" style={{ color, borderColor: `${color}60`, background: `${color}15` }}>
                                        {entry.score}점 · {label}
                                    </span>
                                    {entry.highCount > 0 && <span className="history-risk-dot high">{entry.highCount}</span>}
                                    {entry.midCount > 0 && <span className="history-risk-dot mid">{entry.midCount}</span>}
                                    {entry.lowCount > 0 && <span className="history-risk-dot low">{entry.lowCount}</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
