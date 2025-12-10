import { NextRequest, NextResponse } from 'next/server';

import { getCloudUrl } from '@/lib/cloud-url';

const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Field types that need larger token limits
const LARGE_TOKEN_FIELDS = ['messageExamples', 'suggestions', 'improvedBio', 'improvedPersonality'];

export async function POST(req: NextRequest) {
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
  const systemPrompt = getSystemPromptForField(fieldName);
  const maxTokens = LARGE_TOKEN_FIELDS.includes(fieldName) ? 800 : 200;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  console.log(`[Generate Field] Calling Eliza Cloud for field: ${fieldName}`);

  const cloudUrl = getCloudUrl();
  const response = await fetch(`${cloudUrl}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ELIZA_CLOUD_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Generate Field] Eliza Cloud API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    
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

  // Parse JSON for structured fields
  if (fieldName === 'messageExamples') {
    const parsed = parseMessageExamples(generatedValue);
    return NextResponse.json({ success: true, value: parsed });
  }

  // Remove surrounding quotes if present
  const cleanedValue = generatedValue.replace(/^["']|["']$/g, '');

  console.log(`[Generate Field] Generated ${fieldName}: ${cleanedValue.slice(0, 50)}...`);

  return NextResponse.json({
    success: true,
    value: cleanedValue,
  });
}

function getSystemPromptForField(fieldName: string): string {
  switch (fieldName) {
    case 'messageExamples':
      return `You are a character dialogue expert. Generate realistic, natural conversation examples that capture the character's unique voice and personality. Output ONLY valid JSON.`;
    
    case 'previewResponse':
      return `You are roleplaying as a character. Respond naturally in their voice, staying true to their personality and style. Be conversational and engaging.`;
    
    case 'improvedBio':
    case 'improvedPersonality':
    case 'suggestions':
      return `You are a character design expert helping improve AI companion characters. Provide specific, actionable suggestions that enhance personality depth and engagement.`;
    
    case 'name':
      return 'You are a helpful assistant that generates realistic, natural character names. Be creative but authentic.';
    
    default:
      return `You are a helpful assistant that generates realistic, natural character descriptions and dialogue. Be concise and authentic.

IMPORTANT: You are working with a SINGLE character. The character's name may have changed from previous context, but it's still the SAME person. If the name in the current context differs from previous descriptions, USE THE NEW NAME and rewrite/adapt the content for that character as if that was always their name. Maintain consistency with their personality, appearance, and traits, just update any name references.`;
  }
}

function parseMessageExamples(raw: string): Array<{ user: string; agent: string }> {
  // Try to parse as JSON array
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ user?: string; agent?: string; character?: string }>;
    return parsed.map(ex => ({
      user: ex.user || '',
      agent: ex.agent || ex.character || '',
    }));
  }
  
  // Fallback: return empty array
  return [];
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
  if (context.adjectives) contextSummary += `Traits: ${context.adjectives}\n`;

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

    case 'messageExamples':
      return `Generate 3 example conversations for a character with these traits:
${contextSummary}

Output a JSON array with objects containing "user" and "agent" fields:
[
  {"user": "Hey, how's it going?", "agent": "...character's response..."},
  {"user": "What do you think about...", "agent": "..."},
  {"user": "Tell me about yourself", "agent": "..."}
]

Make the conversations feel natural and showcase the character's unique personality. Vary the topics. Output ONLY the JSON array, no other text.`;

    case 'previewResponse':
      const examplesContext = context.examples ? `\nExample conversations:\n${context.examples}` : '';
      return `You are ${context.name || 'a character'}. ${context.personality || ''}
${contextSummary}${examplesContext}

The user says: "${currentValue}"

Respond naturally in character. Keep your response conversational (1-3 sentences). Stay true to the character's personality.`;

    case 'improvedBio':
      return `Improve this character bio to be more engaging and distinctive:
"${currentValue}"

Character context:
${contextSummary}

Make it more vivid and personality-driven while keeping the core identity. Output only the improved bio text (2-3 sentences).`;

    case 'suggestions':
      return `Analyze this character and suggest specific improvements:

${contextSummary}
Current bio: ${currentValue || 'Not set'}

Provide 2-3 specific, actionable suggestions to make this character more engaging and distinctive. Be concise and specific. Output as a brief numbered list.`;

    default:
      return `Generate a value for ${fieldName}${hasContext ? ` using this context:\n${contextSummary}` : ''}.`;
  }
}
