// GitHub Models client (OpenAI-compatible). Runs server-side so the GitHub
// token never reaches the browser. Supports multimodal (image) input and the
// reasoning-model parameter differences for GPT-5.x.

const ENDPOINT = 'https://models.github.ai/inference/chat/completions';

function isReasoningModel(model) {
  return /gpt-5/i.test(model);
}

/**
 * @param {object} opts
 * @param {string} opts.token   GitHub token with the Models permission
 * @param {string} opts.model   e.g. 'openai/gpt-5.5'
 * @param {string} opts.system  system prompt
 * @param {string} opts.userText assembled day context
 * @param {string[]} opts.imageDataUris base64 data: URIs for hero photos
 * @returns {Promise<string>}
 */
export async function complete({ token, model, system, userText, imageDataUris = [], maxTokens = 2000, temperature = 0.6 }) {
  if (!token) throw new Error('No GitHub token configured. Set GITHUB_TOKEN in .env.');

  const userContent = [{ type: 'text', text: userText }];
  for (const uri of imageDataUris) {
    userContent.push({ type: 'image_url', image_url: { url: uri } });
  }

  const reasoning = isReasoningModel(model);
  const body = {
    model,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: userContent },
    ],
    ...(reasoning
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens, temperature }),
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error('GitHub Models rate limit hit. Wait and retry.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub Models HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('The model returned an empty response.');
  return content.trim();
}
