import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `당신은 대한민국 공정거래 전문가입니다.
아래 계약서 또는 약관 조항을 분석하여 각 조항별로 다음 항목을 JSON 배열 형식으로 출력하십시오.

각 항목은 다음 구조를 따르십시오:
{
  "조항": "조항명 (예: 제1조 (계약 해지))",
  "불공정_가능성": "높음" | "중간" | "낮음",
  "문제_조항_요약": "해당 조항의 불공정 요소에 대한 간결한 요약",
  "소비자_불리_이유": "소비자에게 불리한 이유에 대한 구체적 설명",
  "법적_쟁점_키워드": ["관련 법률 조항", "키워드"],
  "개선_권고": "더 공정한 조항으로 수정하기 위한 개선 권고 문장"
}

판단 기준:
- "높음": 약관법, 전자상거래법 등의 강행규정을 명백히 위반하는 경우에만 부여
- "중간": 법 위반 가능성이 있으나, 계약 유형이나 상황에 따라 해석이 달라질 수 있는 경우
- "낮음": 통상적인 계약 조항으로 특별한 불공정성이 없는 경우

반드시 추측이 아닌 조항에 근거하여 분석하십시오.
응답은 반드시 JSON 배열만 출력하십시오. 다른 텍스트는 포함하지 마십시오.`;

async function callOpenAI(apiKey: string, text: string): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  return response.choices[0]?.message?.content || '[]';
}

async function callClaude(apiKey: string, text: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: text },
    ],
  });
  const block = response.content[0];
  if (block.type === 'text') {
    return block.text;
  }
  return '[]';
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const provider = request.headers.get('x-provider') || 'openai';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API 키가 필요합니다. 설정에서 API 키를 입력해주세요.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 업로드되지 않았습니다.' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let text = '';

    if (fileName.endsWith('.txt')) {
      text = await file.text();
    } else if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      text = await extractTextFromPDF(buffer);
    } else {
      return NextResponse.json(
        { error: '지원하지 않는 파일 형식입니다. TXT 또는 PDF 파일만 업로드해주세요.' },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: '파일에서 텍스트를 추출할 수 없습니다.' },
        { status: 400 }
      );
    }

    let resultText: string;
    if (provider === 'claude') {
      resultText = await callClaude(apiKey, text);
    } else {
      resultText = await callOpenAI(apiKey, text);
    }

    // Parse the JSON from the LLM response
    let results;
    try {
      const parsed = JSON.parse(resultText);
      // Handle both direct array and wrapped object formats
      if (Array.isArray(parsed)) {
        results = parsed;
      } else if (parsed.results) {
        results = parsed.results;
      } else if (parsed.분석결과) {
        results = parsed.분석결과;
      } else {
        // Try to find an array value in the object
        const values = Object.values(parsed);
        const arrayValue = values.find((v) => Array.isArray(v));
        results = arrayValue || [parsed];
      }
    } catch {
      // Try to extract JSON array from text
      const match = resultText.match(/\[[\s\S]*\]/);
      if (match) {
        results = JSON.parse(match[0]);
      } else {
        return NextResponse.json(
          { error: 'LLM 응답을 파싱하는 데 실패했습니다. 다시 시도해주세요.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

    // Handle common API errors
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('authentication')) {
      return NextResponse.json(
        { error: 'API 키가 유효하지 않습니다. 올바른 API 키를 입력해주세요.' },
        { status: 401 }
      );
    }

    if (message.includes('429') || message.includes('rate')) {
      return NextResponse.json(
        { error: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: `분석 중 오류가 발생했습니다: ${message}` },
      { status: 500 }
    );
  }
}
