import { createClient } from '@supabase/supabase-js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only allow POST requests on the /bot endpoint
    if (url.pathname === "/bot") {
      try {
        if (request.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }
        const update = await request.json();
        await handleUpdate(update, env);
        return new Response("ok");
      } catch (err) {
        console.error("Error handling update:", err);
        return new Response("Error", { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};

// Lazy initialization of Supabase client per request lifecycle
const supabase = (env) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// -------------------- MAIN HANDLER --------------------

async function handleUpdate(update, env) {
  // Validate that the update contains a text message
  if (!update.message || !update.message.text) return;

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;

  // Safety check: Ignore messages from bots to prevent infinite response loops
  if (update.message.from.is_bot) return;

  const isAdmin = userId.toString() === env.ADMIN_ID.toString();

  // Parsing commands: Trim whitespace and handle command variants (e.g. /add@BotName)
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const rawCommand = parts[0].split('@')[0].toLowerCase();

  // ---------------- COMMAND: ADD / UPDATE FILTER ----------------

  if (rawCommand === "/add") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null);

    const keyword = parts[1];
    if (!keyword) {
      return send(env, chatId, "Usage: /add KEYWORD RESPONSE", null, null);
    }

    // Find the position of the keyword in the original text, and take everything after it.
    // This preserves newlines, spaces, and formatting characters in the response.
    const keywordIndex = text.indexOf(keyword);
    const response = text.substring(keywordIndex + keyword.length).trim();

    if (!response) {
      return send(env, chatId, "Usage: /add KEYWORD RESPONSE", null, null);
    }

    // Using upsert with onConflict on the unique 'keyword' column to support updating existing filters
    const { error } = await supabase(env)
      .from("filters")
      .upsert({
        keyword: keyword.toUpperCase(),
        response,
        created_by: userId
      }, { onConflict: 'keyword' });

    if (error) {
      console.error("Supabase upsert error:", error);
      return send(env, chatId, "❌ Error adding filter", null, null);
    }

    return send(env, chatId, `✅ Filter added/updated: ${keyword.toUpperCase()}`, null, null);
  }

  // ---------------- COMMAND: REMOVE FILTER ----------------

  if (rawCommand === "/remove") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null);

    const keyword = parts[1];

    if (!keyword) {
      return send(env, chatId, "Usage: /remove KEYWORD", null, null);
    }

    const { error } = await supabase(env)
      .from("filters")
      .delete()
      .eq("keyword", keyword.toUpperCase());

    if (error) {
      console.error("Supabase delete error:", error);
      return send(env, chatId, "❌ Error removing filter", null, null);
    }

    return send(env, chatId, `🗑️ Removed: ${keyword.toUpperCase()}`, null, null);
  }

  // ---------------- COMMAND: LIST FILTERS ----------------

  if (rawCommand === "/list") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null);

    const { data, error } = await supabase(env)
      .from("filters")
      .select("*");

    if (error) {
      console.error("Supabase select error:", error);
      return send(env, chatId, "❌ Error retrieving filters list", null, null);
    }

    if (!data || data.length === 0) {
      return send(env, chatId, "No filters found.", null, null);
    }

    // We list the raw database values so that admins can see formatting and buttons syntax
    const list = data
      .map(f => `• ${f.keyword} → ${f.response}`)
      .join("\n");

    return send(env, chatId, list, null, null);
  }

  // ---------------- AUTO FILTER (Replies to matches in group/private chats) ----------------

  // Only auto-reply if the incoming message doesn't start with '/' to avoid conflicting with other bot commands
  if (trimmed.startsWith("/")) return;

  const { data, error } = await supabase(env)
    .from("filters")
    .select("*");

  if (error || !data) return;

  const msg = trimmed.toUpperCase();

  for (const f of data) {
    if (msg.includes(f.keyword.toUpperCase())) {
      // Parse inline buttons and strip them from the text body
      const { cleanText, replyMarkup } = parseButtonsAndText(f.response);
      return send(env, chatId, cleanText, replyMarkup, "Markdown");
    }
  }
}

// ---------------- BUTTON PARSER HELPER ----------------

/**
 * Parses bracket-pipe style inline buttons from a message string.
 * Groups buttons on the same line into the same inline keyboard row.
 * Strips out button syntax, returning the cleaned text and reply markup.
 * 
 * Syntax: [Button Label|https://example.com]
 */
function parseButtonsAndText(text) {
  const buttonRegex = /\[([^\]|]+)\|([^\]\s]+)\]/g;
  const inline_keyboard = [];
  const lines = text.split("\n");
  const cleanLines = [];

  for (const line of lines) {
    let match;
    const rowButtons = [];

    // Reset regex index for this line
    buttonRegex.lastIndex = 0;
    while ((match = buttonRegex.exec(line)) !== null) {
      rowButtons.push({
        text: match[1].trim(),
        url: match[2].trim()
      });
    }

    if (rowButtons.length > 0) {
      inline_keyboard.push(rowButtons);
    }

    // Remove the button tags from the text
    const cleanLine = line.replace(buttonRegex, "").trim();
    
    // Only keep lines that aren't empty (or were empty originally)
    if (cleanLine.length > 0 || rowButtons.length === 0) {
      cleanLines.push(cleanLine);
    }
  }

  const cleanText = cleanLines.join("\n").trim();
  const replyMarkup = inline_keyboard.length > 0 ? { inline_keyboard } : null;

  return { cleanText, replyMarkup };
}

// ---------------- TELEGRAM API SEND MESSAGE ----------------

/**
 * Sends a message via Telegram. Supports markdown parse mode and custom inline keyboards.
 * If sending with Markdown fails (e.g. invalid syntax), automatically falls back to plain text.
 */
async function send(env, chatId, text, replyMarkup = null, parseMode = "Markdown") {
  try {
    const body = {
      chat_id: chatId,
      text
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    let res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    // Fallback if Markdown parsing fails
    if (!res.ok && parseMode === "Markdown") {
      const errText = await res.clone().text();
      if (errText.includes("can't parse entities") || errText.includes("bad request")) {
        console.warn("Markdown parsing failed, retrying in plain text mode...");
        delete body.parse_mode;
        res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram API response error (status ${res.status}): ${errText}`);
    }
  } catch (err) {
    console.error("Exception when communicating with Telegram API:", err);
  }
}
