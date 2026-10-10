export const AZURE_OPENAI_ENDPOINT_KEY = 'AZURE_OPENAI_ENDPOINT';
export const AZURE_OPENAI_API_KEY_KEY = 'AZURE_OPENAI_API_KEY';
export const AZURE_OPENAI_CHAT_DEPLOYMENT_KEY = 'AZURE_OPENAI_CHAT_DEPLOYMENT';
export const AZURE_OPENAI_DEFAULT_CHAT_API_VERSION = '2024-08-01-preview';
export const AZURE_OPENAI_CHAT_HTTP_TIMEOUT_MS = 20_000;
export const AZURE_OPENAI_MAX_PAGE_TEXT_LENGTH = 6_000;

export const LYRICS_EXTRACTION_NOT_FOUND = 'NOT_FOUND';

export const LYRICS_EXTRACTION_SYSTEM_PROMPT = `You are a strict text-extraction tool. You will be given the raw text of one web page and a song title/artist. If — and only if — this page's text already contains that song's lyrics, output them exactly as written in the page, preserving line breaks, with no additions, translations, summarization, or paraphrasing, and using no knowledge of the song beyond what is in the provided text. Do not explain yourself. If the page does not contain the lyrics, output exactly: ${LYRICS_EXTRACTION_NOT_FOUND}`;
