import { NextRequest, NextResponse } from 'next/server';

const ELIZA_CLOUD_URL = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || 'http://localhost:3000';
const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { fieldName, currentValue, context } = await req.json();

    if (!fieldName) {
      return NextResponse.json(
        { success: false, error: 'Field name required' },
        { status: 400 }
      );
    }

    if (!ELIZA_CLOUD_API_KEY) {
      console.error('[Generate Field] ELIZA_CLOUD_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'AI service not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const prompt = buildPromptForField(fieldName, currentValue, context);

    const systemPrompt = fieldName === 'name' 
      ? 'You are a helpful assistant that generates realistic, natural character descriptions and dialogue. Be concise and authentic.'
      : `You are a helpful assistant that generates realistic, natural character descriptions and dialogue. Be concise and authentic.

IMPORTANT: You are working with a SINGLE character. The character's name may have changed from previous context, but it's still the SAME person. If the name in the current context differs from previous descriptions, USE THE NEW NAME and rewrite/adapt the content for that character as if that was always their name. Maintain consistency with their personality, appearance, and traits, just update any name references.`;

    const messages: ChatMessage[] = [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
    ];

    console.log(`[Generate Field] Calling Eliza Cloud chat completions for field: ${fieldName}`);

    const response = await fetch(`${ELIZA_CLOUD_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ELIZA_CLOUD_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Generate Field] Eliza Cloud API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      
      // Parse error if possible
      let errorMessage = 'Failed to generate field';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Use default error message
      }
      
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: response.status === 402 ? 402 : 500 }
      );
    }

    const data = await response.json();
    const generatedValue = data.choices?.[0]?.message?.content?.trim() || '';

    // Remove surrounding quotes if present
    const cleanedValue = generatedValue.replace(/^["']|["']$/g, '');

    console.log(`[Generate Field] Successfully generated ${fieldName}: ${cleanedValue.slice(0, 50)}...`);

    return NextResponse.json({
      success: true,
      value: cleanedValue,
    });
  } catch (error) {
    console.error('[Generate Field] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate field' },
      { status: 500 }
    );
  }
}

function buildPromptForField(
  fieldName: string,
  currentValue: string | undefined,
  context: Record<string, string | undefined>
): string {
  const hasContext = Object.values(context).some((v) => v && v.length > 0);
  const hasCurrentValue = currentValue && currentValue.length > 0;

  let contextSummary = '';
  if (context.name) contextSummary += `Name: ${context.name}\n`;
  if (context.personality) contextSummary += `Personality: ${context.personality}\n`;
  if (context.backstory) contextSummary += `Backstory: ${context.backstory}\n`;

  switch (fieldName) {
    case 'name':
      if (hasCurrentValue) {
        return `Suggest a better or alternative name${hasContext ? ` based on:\n${contextSummary}` : ''}. Just return the name, nothing else.`;
      }
      return `Generate a realistic first name${hasContext ? ` based on:\n${contextSummary}` : ''}. Just return the name, nothing else.`;

    case 'personality':
      if (hasCurrentValue) {
        return `Complete or enhance this personality description:\n"${currentValue}"\n${
          contextSummary ? `\nContext:\n${contextSummary}` : ''
        }\nProvide a natural, complete description (2-3 sentences). Just return the enhanced text, no quotes or explanations.`;
      }
      return `Write a brief, natural personality description (2-3 sentences)${hasContext ? ` based on:\n${contextSummary}` : ''}. Be warm and descriptive. Just return the description, no quotes or explanations.`;

    case 'backstory':
      if (hasCurrentValue) {
        return `Complete or enhance this backstory:\n"${currentValue}"\n${
          contextSummary ? `\nContext:\n${contextSummary}` : ''
        }\nWrite from the user's perspective about meeting ${context.name || 'this person'}. Just return the enhanced text, no quotes or explanations.`;
      }
      return `Write a brief, natural story (2-3 sentences) about how THE USER met ${context.name || 'a person'}${
        context.personality ? `. ${context.name || 'They'} is described as: ${context.personality}` : ''
      }. Write from the user's perspective. Make it realistic and relatable. Just return the story, no quotes or explanations.`;

    case 'imagePrompt':
      if (hasCurrentValue) {
        return `Enhance or improve this image description:\n"${currentValue}"\n${
          contextSummary ? `\nContext:\n${contextSummary}` : ''
        }\nCreate a detailed, vivid description for generating a portrait photo. Include details about appearance, expression, setting, and style. Just return the enhanced description, no quotes or explanations.`;
      }
      return `Generate a detailed image description for creating a portrait photo${hasContext ? ` based on:\n${contextSummary}` : ''}. Include details about appearance, expression, setting, lighting, and photographic style. Make it vivid and specific. Just return the description, no quotes or explanations.`;

    default:
      return `Generate a value for ${fieldName}${hasContext ? ` using this context:\n${contextSummary}` : ''}.`;
  }
}
