/**
 * Prepara o payload do D-ID speak() para soar o mais humano possível:
 *  - SSML com pausas naturais em fronteiras de sentença
 *  - Prosody rate ligeiramente abaixo de 1x (0.93)
 *  - Voz Neural Microsoft Azure calibrada por idioma
 *  - Limpeza de markdown antes de enviar
 */

export interface DIDSpeakPayload {
  type: 'text';
  input: string;
  ssml: true;
  provider: {
    type: 'microsoft';
    voice_id: string;
    voice_config?: { style?: string };
  };
}

// Vozes com melhor naturalidade por idioma
const VOICES: Record<string, { voice_id: string; style?: string }> = {
  'pt-BR': { voice_id: 'pt-BR-FranciscaNeural' },
  'en-US': { voice_id: 'en-US-AriaNeural', style: 'friendly' },
  'en':    { voice_id: 'en-US-AriaNeural', style: 'friendly' },
  'es-ES': { voice_id: 'es-ES-ElviraNeural' },
  'es':    { voice_id: 'es-ES-ElviraNeural' },
};

const XML_LANG: Record<string, string> = {
  'pt-BR': 'pt-BR',
  'en':    'en-US',
  'en-US': 'en-US',
  'es':    'es-ES',
  'es-ES': 'es-ES',
};

function resolveVoiceKey(language: string): string {
  return Object.keys(VOICES).find(k => language.startsWith(k)) ?? 'pt-BR';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

// Insere pausas SSML em fronteiras naturais de fala
function addNaturalBreaks(s: string): string {
  return s
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
    `</speak>`,
  ].join('');

  return {
    type: 'text',
    input: ssml,
    ssml: true,
    provider: {
      type: 'microsoft',
      voice_id,
      ...(style && { voice_config: { style } }),
    },
  };
}
