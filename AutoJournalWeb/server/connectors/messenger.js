import { toDay } from '../util.js';

// Parses a Facebook/Messenger "Download Your Information" messages JSON file
// (message_1.json inside each conversation folder). Facebook double-encodes
// non-ASCII text (UTF-8 bytes stored as Latin-1), so we repair mojibake.

function fixMojibake(str) {
  if (!str) return str;
  try {
    // Re-interpret the string's characters as raw bytes, then decode as UTF-8.
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

/**
 * @param {object} json parsed message_1.json
 * @returns {Array<{day:string, source:'messenger', ts:string, sender:string, text:string}>}
 */
export function parseMessenger(json) {
  const messages = Array.isArray(json?.messages) ? json.messages : [];
  const rows = [];
  for (const msg of messages) {
    if (!msg.timestamp_ms) continue;
    const content = msg.content ? fixMojibake(msg.content) : null;
    // Skip pure reactions / calls with no textual content.
    const text = content || (msg.photos ? '[photo]' : msg.videos ? '[video]' : msg.sticker ? '[sticker]' : null);
    if (!text) continue;
    const date = new Date(msg.timestamp_ms);
    if (Number.isNaN(date.getTime())) continue;
    rows.push({
      day: toDay(date),
      source: 'messenger',
      ts: date.toISOString(),
      sender: fixMojibake(msg.sender_name) || 'Unknown',
      text,
    });
  }
  return rows;
}

export function conversationTitle(json) {
  return fixMojibake(json?.title) || 'Messenger conversation';
}
