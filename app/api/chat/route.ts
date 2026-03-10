import { NextRequest } from 'next/server';

function buildSystemPrompt(contractText: string): string {
  return `당신은 대한민국 공정거래위원회(공정위) 전문가 챗봇입니다.
아래 계약서/약관 내용을 분석하여 사용자의 질문에 답변합니다.

[계약서/약관 내용]
${contractText}

[역할 및 지침]
- 약관법, 전자상거래법, 소비자보호법 등 관련 법령에 비추어 불공정 조항을 분석합니다
- 각 조항의 불공정 가능성을 평가하고 그 이유를 설명합니다
- 소비자에게 불리한 조항과 그 영향을 명확히 설명합니다
- 공정한 계약을 위한 개선 방안을 제시합니다
- 항상 한국어로 답변합니다
- 불공정 가능성은 🔴 높음 / 🟡 중간 / 🟢 낮음으로 표시합니다
- 마크다운 형식으로 답변을 구성합니다 (볼드, 목록, 헤더 등 활용)
- 법적 근거가 있는 경우 반드시 관련 법령을 언급합니다`;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, contractText, provider, apiKey } = await request.json();

    if (!apiKey) {
      return new Response('API 키가 필요합니다.', { status: 400 });
    }

    if (!contractText) {
      return new Response('계약서 내용이 없습니다.', { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(contractText);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (provider === 'claude') {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });

            const anthropicStream = client.messages.stream({
              model: 'claude-sonnet-4-5',
              max_tokens: 2048,
              system: systemPrompt,
              messages,
            });

            for await (const chunk of anthropicStream) {
              if (
                chunk.type === 'content_block_delta' &&
                chunk.delta.type === 'text_delta'
              ) {
                controller.enqueue(encoder.encode(chunk.delta.text));
              }
            }
          } else {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey });

            const openaiStream = await client.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
              ],
              temperature: 0.3,
              stream: true,
            });

            for await (const chunk of openaiStream) {
              const text = chunk.choices[0]?.delta?.content || '';
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
          }

          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : '오류 발생';
          let userMessage = `\n\n⚠️ 오류가 발생했습니다: ${message}`;

          if (message.includes('401') || message.includes('authentication')) {
            userMessage = '\n\n⚠️ API 키가 유효하지 않습니다. 올바른 키를 입력해주세요.';
          } else if (message.includes('429') || message.includes('rate')) {
            userMessage = '\n\n⚠️ API 요청 한도 초과. 잠시 후 다시 시도해주세요.';
          }

          controller.enqueue(encoder.encode(userMessage));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return new Response(`오류: ${message}`, { status: 500 });
  }
}
