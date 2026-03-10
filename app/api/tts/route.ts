import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, apiKey, provider } = await request.json();

    if (!apiKey) {
      return new Response('API 키가 필요합니다.', { status: 400 });
    }

    // Claude는 TTS 미지원 → 클라이언트에서 브라우저 TTS 사용
    if (provider === 'claude') {
      return new Response('BROWSER_TTS', { status: 200 });
    }

    // 4096자 제한 (OpenAI TTS 최대)
    const input = text.slice(0, 4096);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const mp3 = await client.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',   // 자연스러운 여성 목소리
      input,
      response_format: 'mp3',
      speed: 0.95,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '오류 발생';
    return new Response(`TTS 오류: ${msg}`, { status: 500 });
  }
}
