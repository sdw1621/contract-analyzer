'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ContractFile {
  text: string;
  fileName: string;
}

const QUICK_QUESTIONS = [
  '전체 계약서를 요약해줘',
  '가장 위험한 조항은 뭐야?',
  '불공정 조항 목록 알려줘',
  '개선 방안 알려줘',
];

/* ── 마크다운 → HTML 변환 ── */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)(\n|$)/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

/* ── TTS ── */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function browserSpeak(text: string, onEnd: () => void) {
  if (!('speechSynthesis' in window)) { onEnd(); return; }
  window.speechSynthesis.cancel();
  const plain = stripHtml(text);
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = 'ko-KR';
  utter.rate = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find((v) => v.lang.startsWith('ko'));
  if (koVoice) utter.voice = koVoice;
  utter.onend = onEnd;
  utter.onerror = onEnd;
  window.speechSynthesis.speak(utter);
}

function useTTS(apiKey: string, provider: string) {
  const [speakingIdx, setSpeakingIdx] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeakingIdx(null);
  }, []);

  const speak = useCallback(async (text: string, idx: string) => {
    if (speakingIdx === idx) { stop(); return; }
    stop();
    setSpeakingIdx(idx);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stripHtml(text), apiKey, provider }),
      });
      if (res.ok && (await res.clone().text()) === 'BROWSER_TTS') {
        browserSpeak(text, () => setSpeakingIdx(null));
        return;
      }
      if (!res.ok) { setSpeakingIdx(null); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setSpeakingIdx(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeakingIdx(null); };
      audio.play();
    } catch {
      setSpeakingIdx(null);
    }
  }, [speakingIdx, stop, apiKey, provider]);

  return { speak, stop, speakingIdx };
}

export default function Home() {
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [savedShow, setSavedShow] = useState(false);

  // 다중 파일 지원
  const [contracts, setContracts] = useState<ContractFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showContractIdx, setShowContractIdx] = useState<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { speak, stop, speakingIdx } = useTTS(apiKey, provider);

  // 모든 계약서 텍스트를 합쳐서 AI에게 전달
  const combinedContractText = contracts.length > 0
    ? contracts.map((c, i) =>
        contracts.length === 1
          ? c.text
          : `=== 문서 ${i + 1}: ${c.fileName} ===\n\n${c.text}`
      ).join('\n\n')
    : '';

  /* LocalStorage 로드 */
  useEffect(() => {
    const savedProvider = localStorage.getItem('ftc-provider');
    const savedApiKey = localStorage.getItem('ftc-apikey');
    if (savedProvider) setProvider(savedProvider);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (streaming) stop();
  }, [streaming, stop]);

  const saveSettings = useCallback((newProvider: string, newApiKey: string) => {
    localStorage.setItem('ftc-provider', newProvider);
    localStorage.setItem('ftc-apikey', newApiKey);
    setSavedShow(true);
    setTimeout(() => setSavedShow(false), 2000);
  }, []);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setProvider(val);
    saveSettings(val, apiKey);
  };

  const handleApiKeyBlur = () => saveSettings(provider, apiKey);

  /* 파일 하나 업로드 처리 */
  const processFile = async (file: File): Promise<ContractFile | null> => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.pdf')) {
      return null;
    }
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/extract', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '파일 처리 오류');
    return { text: data.text, fileName: data.fileName };
  };

  /* 여러 파일 업로드 */
  const handleFilesUpload = async (files: File[], replace = false) => {
    const validFiles = Array.from(files).filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith('.txt') || n.endsWith('.pdf');
    });
    if (validFiles.length === 0) {
      setUploadError('TXT 또는 PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const results = await Promise.all(validFiles.map(processFile));
      const successful = results.filter((r): r is ContractFile => r !== null);
      if (successful.length === 0) {
        setUploadError('파일 처리에 실패했습니다.');
        return;
      }
      const newContracts = replace ? successful : [...contracts, ...successful];
      setContracts(newContracts);
      // 환영 메시지
      const fileList = newContracts.map((c, i) => `${i + 1}. **${c.fileName}**`).join('\n');
      const msg = newContracts.length === 1
        ? `**${newContracts[0].fileName}** 파일을 분석했습니다! 📋\n\n계약서 내용을 파악했습니다. 궁금한 점을 자유롭게 질문해보세요.`
        : `**${newContracts.length}개 문서**를 모두 분석했습니다! 📋\n\n${fileList}\n\n각 문서의 불공정 조항 비교, 개별 분석 등 질문해보세요.`;
      setMessages([{ role: 'assistant', content: msg }]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '서버 연결 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesUpload(Array.from(e.dataTransfer.files), contracts.length === 0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(Array.from(e.target.files), true);
      e.target.value = '';
    }
  };

  const handleAddFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(Array.from(e.target.files), false);
      e.target.value = '';
    }
  };

  // 특정 파일 제거
  const removeContract = (idx: number) => {
    stop();
    const newContracts = contracts.filter((_, i) => i !== idx);
    setContracts(newContracts);
    if (showContractIdx === idx) setShowContractIdx(null);
    if (newContracts.length === 0) {
      setMessages([]);
      setUploadError('');
    } else {
      const fileList = newContracts.map((c, i) => `${i + 1}. **${c.fileName}**`).join('\n');
      setMessages([{ role: 'assistant', content: `문서를 제거했습니다. 현재 분석 중인 문서:\n\n${fileList}` }]);
    }
  };

  // 전체 초기화
  const removeAllContracts = () => {
    stop();
    setContracts([]);
    setMessages([]);
    setUploadError('');
    setShowContractIdx(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* 메시지 전송 */
  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming || !combinedContractText || !apiKey) return;
    stop();
    const userMessage: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, contractText: combinedContractText, provider, apiKey }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = { role: 'assistant', content: `⚠️ 오류: ${errText}` };
          return u;
        });
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = { role: 'assistant', content: u[u.length - 1].content + chunk };
          return u;
        });
      }
    } catch {
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: 'assistant', content: '⚠️ 서버 연결 실패. 다시 시도해주세요.' };
        return u;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; }
  };

  const isReady = contracts.length > 0 && !!apiKey;

  return (
    <div className="chat-app">
      {/* ── 헤더 ── */}
      <header className="chat-header">
        <div className="header-left">
          <div className="header-logo">⚖️</div>
          <div>
            <h1 className="header-title">공정거래위원회 계약서 분석 챗봇</h1>
            <p className="header-subtitle">약관법·전자상거래법 기반 불공정 조항 AI 분석</p>
          </div>
        </div>
        <button
          className={`settings-toggle ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          API 설정
        </button>
      </header>

      {/* ── API 설정 패널 ── */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-row">
            <div className="settings-field">
              <label>API 제공자</label>
              <select value={provider} onChange={handleProviderChange}>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="claude">Claude (Sonnet)</option>
              </select>
            </div>
            <div className="settings-field flex-1">
              <label>API 키</label>
              <input
                type="password"
                placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={handleApiKeyBlur}
              />
            </div>
          </div>
          {savedShow && <div className="saved-badge">✓ 저장됨</div>}
        </div>
      )}

      {/* ── 파일 업로드 영역 ── */}
      <div className="file-area">
        {contracts.length === 0 ? (
          /* 업로드 전: 드롭존 */
          <div
            className={`upload-zone${dragOver ? ' dragover' : ''}${uploading ? ' uploading' : ''}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
          >
            {uploading ? (
              <><div className="upload-spinner"/><p>파일을 분석하는 중...</p></>
            ) : (
              <>
                <div className="upload-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="30" height="30">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <p className="upload-main">계약서 파일을 업로드하세요</p>
                <p className="upload-sub">TXT 또는 PDF · 여러 파일 동시 선택 가능 · 끌어다 놓거나 클릭</p>
              </>
            )}
            <input ref={fileInputRef} type="file" accept=".txt,.pdf" multiple onChange={handleFileSelect} style={{display:'none'}}/>
          </div>
        ) : (
          /* 업로드 후: 파일 목록 */
          <div className="file-list-area">
            <div className="file-list-header">
              <span className="file-list-title">
                📁 분석 문서 <span className="file-count-badge">{contracts.length}</span>
              </span>
              <div className="file-list-actions">
                {uploading && <span className="uploading-text">업로드 중...</span>}
                {/* 파일 추가 버튼 */}
                <button
                  className="add-file-btn"
                  onClick={() => addFileInputRef.current?.click()}
                  disabled={uploading}
                  title="문서 추가"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  문서 추가
                </button>
                {/* 전체 초기화 */}
                <button className="clear-all-btn" onClick={removeAllContracts} title="전체 제거">
                  전체 제거
                </button>
                <input ref={addFileInputRef} type="file" accept=".txt,.pdf" multiple onChange={handleAddFileSelect} style={{display:'none'}}/>
              </div>
            </div>

            {/* 파일 배지 목록 */}
            <div className="file-badges-list">
              {contracts.map((c, idx) => (
                <div key={idx} className="file-badge">
                  <span className="file-badge-icon">
                    {c.fileName.toLowerCase().endsWith('.pdf') ? '📄' : '📝'}
                  </span>
                  <span className="file-badge-name">{c.fileName}</span>
                  <span className="file-badge-status">✓</span>

                  {/* 원문 보기 토글 */}
                  <button
                    className={`contract-view-btn${showContractIdx === idx ? ' active' : ''}`}
                    onClick={() => setShowContractIdx(showContractIdx === idx ? null : idx)}
                    title="원문 보기"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    원문
                  </button>

                  {/* TTS */}
                  <button
                    className={`contract-view-btn${speakingIdx === `contract-${idx}` ? ' active' : ''}`}
                    onClick={() => speak(c.text, `contract-${idx}`)}
                    title="원문 읽기"
                  >
                    {speakingIdx === `contract-${idx}` ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      </svg>
                    )}
                    {speakingIdx === `contract-${idx}` ? '읽는 중' : '읽기'}
                  </button>

                  {/* 개별 제거 */}
                  <button className="file-badge-remove" onClick={() => removeContract(idx)} title="제거">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* 원문 패널 */}
            {showContractIdx !== null && contracts[showContractIdx] && (
              <div className="contract-panel">
                <div className="contract-panel-header">
                  <span>📋 {contracts[showContractIdx].fileName}</span>
                  <button onClick={() => setShowContractIdx(null)}>✕ 닫기</button>
                </div>
                <pre className="contract-panel-text">{contracts[showContractIdx].text}</pre>
              </div>
            )}
          </div>
        )}
        {uploadError && <div className="upload-error">⚠️ {uploadError}</div>}
      </div>

      {/* ── 채팅 메시지 영역 ── */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🏛️</div>
            <p className="chat-empty-title">공정거래위원회 계약서 분석 챗봇</p>
            <p className="chat-empty-desc">
              계약서를 업로드하면 불공정 조항을<br/>약관법 기준으로 분석해 드립니다
            </p>
            {!apiKey && (
              <p className="chat-empty-hint">
                먼저 우측 상단 <strong>API 설정</strong>에서 API 키를 입력해주세요
              </p>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message-row ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="message-avatar bot-avatar">⚖️</div>
            )}
            <div className={`message-bubble ${msg.role}`}>
              {msg.role === 'assistant' ? (
                <>
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        ? `<p>${renderMarkdown(msg.content)}</p>`
                        : '<span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span>',
                    }}
                  />
                  {msg.content && !streaming && (
                    <button
                      className={`tts-btn${speakingIdx === `msg-${i}` ? ' tts-active' : ''}`}
                      onClick={() => speak(msg.content, `msg-${i}`)}
                      title={speakingIdx === `msg-${i}` ? '읽기 중단' : '소리로 읽기'}
                    >
                      {speakingIdx === `msg-${i}` ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                      )}
                      {speakingIdx === `msg-${i}` ? '읽는 중' : '읽기'}
                    </button>
                  )}
                </>
              ) : (
                <div className="message-content">{msg.content}</div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="user-avatar">나</div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef}/>
      </div>

      {/* ── 빠른 질문 ── */}
      {contracts.length > 0 && messages.length > 0 && !streaming && (
        <div className="quick-questions">
          {contracts.length >= 2 && (
            <button className="quick-btn" onClick={() => sendMessage('두 문서의 불공정 조항을 비교해줘')} disabled={!isReady}>
              문서 비교 분석
            </button>
          )}
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} className="quick-btn" onClick={() => sendMessage(q)} disabled={!isReady}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── 입력 영역 ── */}
      <div className="chat-input-area">
        {!apiKey && (
          <div className="input-warning">
            API 키를 먼저 입력해주세요 →{' '}
            <button onClick={() => setShowSettings(true)}>설정 열기</button>
          </div>
        )}
        {contracts.length === 0 && apiKey && (
          <div className="input-warning">계약서 파일을 먼저 업로드해주세요</div>
        )}
        <div className={`input-row${!isReady ? ' disabled' : ''}`}>
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={
              !apiKey ? 'API 키를 먼저 입력해주세요'
              : contracts.length === 0 ? '계약서를 먼저 업로드해주세요'
              : contracts.length >= 2 ? `${contracts.length}개 문서에 대해 질문하세요... (Enter 전송 / Shift+Enter 줄바꿈)`
              : '계약서에 대해 질문하세요... (Enter 전송 / Shift+Enter 줄바꿈)'
            }
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            disabled={!isReady || streaming}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!isReady || streaming || !input.trim()}
            title="전송"
          >
            {streaming ? (
              <div className="send-spinner"/>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
