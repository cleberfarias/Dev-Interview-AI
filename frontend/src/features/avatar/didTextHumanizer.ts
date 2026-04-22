import { Providers, type SupportedStreamScript } from '@d-id/client-sdk';

export type DIDSpeakPayload = Extract<SupportedStreamScript, { type: 'text' }>;

const VOICES: Record<string, { voice_id: string; style?: string }> = {
  'pt-BR': { voice_id: 'pt-BR-FranciscaNeural' },
  'en-US': { voice_id: 'en-US-AriaNeural', style: 'friendly' },
  en: { voice_id: 'en-US-AriaNeural', style: 'friendly' },
  'es-ES': { voice_id: 'es-ES-ElviraNeural' },
  es: { voice_id: 'es-ES-ElviraNeural' },
};

const XML_LANG: Record<string, string> = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  'en-US': 'en-US',
  es: 'es-ES',
  'es-ES': 'es-ES',
};

function resolveVoiceKey(language: string): string {
  return Object.keys(VOICES).find((key) => language.startsWith(key)) ?? 'pt-BR';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function addNaturalBreaks(value: string): string {
  return value
    .replace(/\.\.\./g, '<break time="500ms"/>')
    .replace(/([.!])\s{1,2}/g, '$1 <break time="350ms"/> ')
    .replace(/\?\s{1,2}/g, '? <break time="400ms"/> ')
    .replace(/:\s{1,2}/g, ': <break time="200ms"/> ');
}

export function buildDIDSpeakPayload(text: string, language = 'pt-BR'): DIDSpeakPayload {
  const langKey = resolveVoiceKey(language);
  const xmlLang = XML_LANG[langKey] ?? 'pt-BR';
  const { voice_id, style } = VOICES[langKey];
  const body = addNaturalBreaks(escapeXml(cleanMarkdown(text)));

  const ssml = [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">`,
    `<prosody rate="0.93">${body}</prosody>`,
    '</speak>',
  ].join('');

  return {
    type: 'text',
    input: ssml,
    ssml: true,
    provider: {
      type: Providers.Microsoft,
      voice_id,
      ...(style && { voice_config: { style } }),
    },
  };
}
