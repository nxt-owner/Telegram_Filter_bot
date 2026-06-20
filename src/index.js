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

// -------------------- HELPER: ADMIN CHECK --------------------

/**
 * Checks if the sender is an authorized administrator for the given chat.
 * - Private chats: Only the bot owner (env.ADMIN_ID) can configure filters.
 * - Group chats: Any group admin, creator, or anonymous admin, or the global bot owner.
 */
async function isGroupAdmin(env, chatId, userId, update) {
  // In private DMs, only the global ADMIN_ID is allowed to manage filters
  if (chatId > 0) {
    return userId.toString() === env.ADMIN_ID.toString();
  }

  // The global ADMIN_ID is always allowed everywhere
  if (userId.toString() === env.ADMIN_ID.toString()) {
    return true;
  }

  // Handle Telegram's GroupAnonymousBot (sent when admins post anonymously)
  if (userId === 1087968824) {
    if (update && update.message && update.message.sender_chat && update.message.sender_chat.id === chatId) {
      return true;
    }
  }

  // Handle Telegram's ChannelBot (sent when posting from a linked channel or as a channel)
  if (userId === 136817688) {
    if (update && update.message && update.message.sender_chat) {
      try {
        const chatRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChat?chat_id=${chatId}`);
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          if (chatData.ok && chatData.result.linked_chat_id === update.message.sender_chat.id) {
            return true;
          }
        }
      } catch (err) {
        console.error("Error fetching chat details for linked channel check:", err);
      }
    }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.ok) return false;

    const status = data.result.status;
    return status === "administrator" || status === "creator";
  } catch (err) {
    console.error("Error checking group admin status:", err);
    return false;
  }
}

// -------------------- MAIN HANDLER --------------------

async function handleUpdate(update, env) {
  console.log("Received update:", JSON.stringify(update));
  // Validate that the update contains a text message
  if (!update.message || !update.message.text) return;

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const messageId = update.message.message_id;

  // Safety check: Ignore messages from other bots to prevent infinite response loops.
  // We allow Telegram's GroupAnonymousBot (1087968824) and ChannelBot (136817688) so that
  // anonymous admins and channel posts can trigger filters and run commands.
  const anonymousBotIds = [1087968824, 136817688];
  if (update.message.from.is_bot && !anonymousBotIds.includes(update.message.from.id)) return;

  // Admins can be the configured ADMIN_ID, group admins, or any anonymous admin in the group
  const isAdmin = await isGroupAdmin(env, chatId, userId, update);

  // Parsing commands: Trim whitespace and handle command variants (e.g. /add@BotName)
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const rawCommand = parts[0].split('@')[0].toLowerCase();

  // ---------------- COMMAND: START ----------------

  if (rawCommand === "/start") {
    let startText;
    if (chatId > 0) {
      startText = `👋 *Welcome to the Telegram Filter Bot!*\n\nI can help you set up automatic replies to keywords in your group chats or here in private messages.\n\n⚙️ *How to use me:*\n1. Add me to your group chat.\n2. Disable Privacy Mode in @BotFather or promote me to Admin so I can see group messages.\n3. Send \`/add KEYWORD RESPONSE\` in the group/chat to register an auto-reply.\n4. Send \`/list\` to see registered keywords.\n5. Send \`/remove KEYWORD\` to delete a filter.\n\n💡 *Need help?* Send \`/help\` to view detailed usage instructions, formatting options, and developer links.\n\n*(Note: Add/Remove/List commands are restricted to group admins)*`;
    } else {
      startText = `👋 *Hello! I am active in this group.*\n\nI will auto-reply to registered keyword filters. Group admins can use \`/add\`, \`/list\`, and \`/remove\` directly in this chat.\n\n💡 Send \`/help\` to learn more about formatting and developer details.`;
    }
    return send(env, chatId, startText, null, "Markdown", messageId);
  }

  // ---------------- COMMAND: HELP ----------------

  if (rawCommand === "/help") {
    const helpText = `📖 *Telegram Filter Bot Help Guide*\n\n` +
      `This bot automatically replies to keyword filters configured for this chat.\n\n` +
      `⚙️ *Commands:*\n` +
      `• \`/add KEYWORD RESPONSE\` — Create/update an auto-reply filter (Admin only).\n` +
      `• \`/remove KEYWORD\` — Delete a filter (Admin only).\n` +
      `• \`/list\` — List all active filters (Admin only).\n` +
      `• \`/help\` — Show this help message.\n\n` +
      `📝 *Response Formatting:*\n` +
      `You can use markdown in your responses:\n` +
      `• *bold* \\= \`*bold*\`\n` +
      `• _italic_ \\= \`_italic_\`\n` +
      `• \`code\` \\= \` \`code\` \`\n` +
      `• [link](https://example.com) \\= \`[link](https://example.com)\`\n\n` +
      `🔘 *Inline Buttons:*\n` +
      `Add clickable buttons at the end of responses:\n` +
      `\`[Button Text|https://example.com]\`\n\n` +
      `💻 *Developer Details:*\n` +
      `Developed with ❤️. Visit the developer's website for more projects, updates, and tutorials:\n` +
      `👉 [techlasiya.com](https://techlasiya.com)`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🌐 Visit Tech Lasiya", url: "https://techlasiya.com" }
        ]
      ]
    };

    return send(env, chatId, helpText, replyMarkup, "Markdown", messageId);
  }

  // ---------------- COMMAND: ADD / UPDATE FILTER ----------------

  if (rawCommand === "/add") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null, messageId);

    const keyword = parts[1];
    if (!keyword) {
      return send(env, chatId, "Usage: /add KEYWORD RESPONSE", null, null, messageId);
    }

    // Find the position of the keyword in the original text, and take everything after it.
    // This preserves newlines, spaces, and formatting characters in the response.
    const keywordIndex = text.indexOf(keyword);
    const response = text.substring(keywordIndex + keyword.length).trim();

    if (!response) {
      return send(env, chatId, "Usage: /add KEYWORD RESPONSE", null, null, messageId);
    }

    // Using upsert with onConflict on the composite unique key (chat_id, keyword)
    const { error } = await supabase(env)
      .from("filters")
      .upsert({
        chat_id: chatId,
        keyword: keyword.toUpperCase(),
        response,
        created_by: userId
      }, { onConflict: 'chat_id,keyword' });

    if (error) {
      console.error("Supabase upsert error:", error);
      return send(env, chatId, "❌ Error adding filter", null, null, messageId);
    }

    return send(env, chatId, `✅ Filter added/updated: ${keyword.toUpperCase()}`, null, null, messageId);
  }

  // ---------------- COMMAND: REMOVE FILTER ----------------

  if (rawCommand === "/remove") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null, messageId);

    const keyword = parts[1];

    if (!keyword) {
      return send(env, chatId, "Usage: /remove KEYWORD", null, null, messageId);
    }

    const { error } = await supabase(env)
      .from("filters")
      .delete()
      .eq("chat_id", chatId)
      .eq("keyword", keyword.toUpperCase());

    if (error) {
      console.error("Supabase delete error:", error);
      return send(env, chatId, "❌ Error removing filter", null, null, messageId);
    }

    return send(env, chatId, `🗑️ Removed: ${keyword.toUpperCase()}`, null, null, messageId);
  }

  // ---------------- COMMAND: LIST FILTERS ----------------

  if (rawCommand === "/list") {
    if (!isAdmin) return send(env, chatId, "❌ Not allowed", null, null, messageId);

    const { data, error } = await supabase(env)
      .from("filters")
      .select("*")
      .eq("chat_id", chatId);

    if (error) {
      console.error("Supabase select error:", error);
      return send(env, chatId, "❌ Error retrieving filters list", null, null, messageId);
    }

    if (!data || data.length === 0) {
      return send(env, chatId, "No filters found.", null, null, messageId);
    }

    // We list the raw database values so that admins can see formatting and buttons syntax
    const list = data
      .map(f => `• ${f.keyword} → ${f.response}`)
      .join("\n");

    return send(env, chatId, list, null, null, messageId);
  }

  // ---------------- AUTO FILTER (Replies to matches in group/private chats) ----------------

  // Only auto-reply if the incoming message doesn't start with '/' to avoid conflicting with other bot commands
  if (trimmed.startsWith("/")) return;

  const { data, error } = await supabase(env)
    .from("filters")
    .select("*")
    .eq("chat_id", chatId);

  if (error || !data) return;

  const msg = trimmed.toUpperCase();

  for (const f of data) {
    if (msg.includes(f.keyword.toUpperCase())) {
      // Parse inline buttons and strip them from the text body
      const { cleanText, replyMarkup } = parseButtonsAndText(f.response);
      return send(env, chatId, cleanText, replyMarkup, "Markdown", messageId);
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
async function send(env, chatId, text, replyMarkup = null, parseMode = "Markdown", replyToMessageId = null) {
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
    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
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
