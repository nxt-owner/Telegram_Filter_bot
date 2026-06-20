# 🤖 Telegram Filter Bot (Cloudflare Workers + Supabase)

A lightweight, serverless Telegram bot deployed on Cloudflare Workers. It uses Supabase for database storage, allowing you to manage auto-reply keywords dynamically from your chat.

## 🚀 Features

- **/start** - Display instructions and setup information (tailored for DM and group chats).
- **/help** - Display detailed usage guidelines, response formatting options, and developer links.
- **/add `<keyword>` `<response>`** - Add or update a keyword filter for the current chat/group (Admin only). Supports multiple words for the response.
- **/remove `<keyword>`** - Delete a keyword filter from the current chat/group (Admin only).
- **/list** - List all active keyword filters for the current chat/group (Admin only).
- **Auto-Reply** - Automatically triggers and sends the saved response when anyone sends a message containing a registered keyword in the current chat/group.
- **Safety checks** - Ignores messages from other bots to prevent message loops.
- **Group Isolation** - Each group chat and private DM has its own independent set of filters. Group administrators can manage filters for their respective group.

---

## 🗄️ 1. Database Setup (Supabase)

1. Open your Supabase Dashboard at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** tab on the left sidebar.
3. Click **New Query**.
4. Copy and paste the contents of `schema.sql` (also shown below) and click **Run**:

```sql
create table if not exists filters (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  keyword text not null,
  response text not null,
  created_by bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint filters_chat_id_keyword_key unique (chat_id, keyword)
);
```

---

## ⚙️ 2. Environment Variables

You need to obtain four parameters to configure the bot:

1. **`SUPABASE_URL`**: `https://example.supabase.co`
2. **`SUPABASE_SERVICE_ROLE_KEY`**: Found in Supabase under **Project Settings** -> **API** -> `service_role` (secret) key.
   > ⚠️ **DO NOT** use the `anon` key. The worker needs the `service_role` key to bypass RLS policies and make database updates.
3. **`BOT_TOKEN`**: The token provided by [@BotFather](https://t.me/BotFather) when you create your bot.
4. **`ADMIN_ID`**: Your personal Telegram User ID (you can get this from [@userinfobot](https://t.me/userinfobot) or [@IDBot](https://t.me/myidbot)).

---

## 💻 3. Local Development

To run the project locally:

1. Clone or open the workspace.
2. Run `npm install` to install dependencies.
3. Open the `.dev.vars` file and update the variables:
   ```env
   SUPABASE_URL="https://example.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
   BOT_TOKEN="your_telegram_bot_token"
   ADMIN_ID="your_telegram_user_id"
   ```
4. Start the local server:
   ```bash
   npm run dev
   ```

---

## 🌐 4. Deployment to Cloudflare Workers

Deploy the worker using Wrangler CLI:

1. Run the deployment command:
   ```bash
   npx wrangler deploy
   ```
   *(This will build the script and upload it, printing a worker URL, e.g., `https://telegram-filter-bot.your-username.workers.dev`)*

2. Add your secrets to the Cloudflare production environment:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put ADMIN_ID
   ```
   *(Paste each corresponding secret value when prompted in the terminal).*

---

## 🔗 5. Register the Telegram Webhook

Once your worker is deployed, you must tell Telegram to send messages to it.

Run this API request in your browser or via `curl` in your terminal (replace `<BOT_TOKEN>` and `<WORKER_URL>` with your actual values):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>/bot"
```

### Example:
If your bot token is `123456:ABC-def` and your worker URL is `https://telegram-filter-bot.myname.workers.dev`:
```bash
curl -X POST "https://api.telegram.org/bot123456:ABC-def/setWebhook?url=https://telegram-filter-bot.myname.workers.dev/bot"
```

Verify you receive a success response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

---

## 🛡️ 6. How to Use

### Basic Commands
1. **Add a keyword** (Admin only):
   Send `/add KEYWORD RESPONSE` to the bot.
   *The bot will respond:* `✅ Filter added/updated: KEYWORD`

2. **Trigger the filter** (Anyone):
   Send a message containing the keyword.
   *The bot will reply with your custom response.*

3. **List all filters** (Admin only):
   Send `/list` to the bot.
   *The bot will return the list of raw database values.*

4. **Remove a filter** (Admin only):
   Send `/remove KEYWORD` to the bot.
   *The bot will respond:* `🗑️ Removed: KEYWORD`

5. **Get help & dev details** (Anyone):
   Send `/help` to the bot.
   *The bot will return detailed help, formatting instructions, and links to the developer's website (https://techlasiya.com).*

---

## 🎨 7. Rich Formatting & Buttons

### Markdown Styling
You can use standard Telegram Markdown styling in your responses:
- `*bold text*` -> **bold text**
- `_italic text_` -> *italic text*
- `` `inline code` `` -> `inline code`
- `[hyperlink text](https://url)` -> [hyperlink text](https://url)

**Example**:
```text
/add promo Join our channel for *massive* discounts: [Click Here](https://t.me/mychannel)
```

### Inline Buttons (Links)
You can append clickable inline buttons to your responses using the format:
`[Button Label|https://button-link.com]`

- **Grid Layout**: Buttons on the same line will be grouped side-by-side in the same row. Buttons on different lines will form separate rows.
- **Example**:
```text
/add contact Need help? Reach out below:
[Visit Website|https://example.com] [Read FAQs|https://example.com/faq]
[Support Chat|https://t.me/mysupport]
```
This will send a message with three buttons:
- Row 1: `Visit Website` and `Read FAQs` side-by-side.
- Row 2: `Support Chat` underneath them.


---

## 👥 8. Group Chat Setup & Bot Privacy

By default, Telegram bots have **Privacy Mode** enabled. This prevents them from seeing regular messages in group chats (they only receive commands starting with `/`). 

To make the auto-reply keyword filters work in group chats, you must do one of the following:

### Option A: Disable Bot Privacy (Recommended)
1. Message [@BotFather](https://t.me/BotFather) and send `/mybots`.
2. Select your bot.
3. Go to **Bot Settings** -> **Group Privacy**.
4. Click **Turn off** (it should show `Privacy mode is disabled`).
5. **Important:** If your bot is already added to a group, **remove the bot and add it back** for this change to take effect.

### Option B: Promote to Administrator
1. Add the bot to your group chat.
2. Promote the bot to an **Administrator** with at least "Post Messages" permission. Admins automatically bypass Privacy Mode.
