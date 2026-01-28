# Workflow Triggers - Simple Testing Guide

## What Does This Feature Do?

**In one sentence:** When someone texts a specific word to your phone number, it automatically runs a workflow.

### Real Example:

```
You have a workflow that fetches your calendar.

You set up a trigger with keyword: "schedule"

Now when anyone texts "schedule" to your Twilio number → 
The calendar workflow runs automatically and replies with your schedule.
```

That's it. That's the whole feature.

---

## How to Test It (Like a Real User)

### Step 1: Make Sure Your App is Running

1. Open terminal
2. Go to your project folder
3. Run: `bun run dev`
4. Wait until you see "Ready" or the server starts

---

### Step 2: Create a Workflow First

You need a workflow before you can add triggers to it.

1. Open browser: **http://localhost:3000**
2. Login
3. Go to **Workflows** in sidebar
4. Create a new workflow OR use an existing one
5. Make sure the workflow is **"Live"** or **"Testing"** status

---

### Step 3: Add a Trigger to Your Workflow

1. Click on your workflow to open it
2. Click the **"Triggers"** tab
3. Click **"Add Trigger"** button
4. Fill in:
   - **Name**: `Test Trigger`
   - **Type**: `Keyword Match`
   - **Keywords**: Type `test` and press Enter (or click +)
   - Leave everything else as default
5. Click **"Create"**

You now have a trigger that listens for the word "test".

---

### Step 4: Configure Twilio Webhook

This tells Twilio "send incoming messages to my app".

1. Go to **https://console.twilio.com**
2. Click **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your number (`+1 364 200 5895`)
4. Scroll to **"Messaging Configuration"**
5. Find **"A message comes in"**
6. Set:
   - **Webhook URL**: `https://YOUR-NGROK-URL/api/webhooks/twilio/YOUR-ORG-ID`
   - **Method**: HTTP POST
7. Click **Save**

**How to find your ORG-ID:**
- Login to your app
- Go to Settings or check the URL - it might show your org ID
- Or check your database

**How to get ngrok URL:**
- Open new terminal
- Run: `ngrok http 3000`
- Copy the `https://xxxxx.ngrok.io` URL

---

### Step 5: Send a Text Message from Your Phone

1. Pick up your phone (the one you verified in Twilio)
2. Open Messages app
3. Text to: `+1 364 200 5895` (your Twilio number)
4. Send message: `test`

---

### What Should Happen?

```
Your Phone                    Twilio                      Your App
    |                           |                            |
    |-- "test" ---------------->|                            |
    |                           |-- forwards to webhook ---->|
    |                           |                            |
    |                           |                     Trigger matches "test"
    |                           |                     Workflow runs
    |                           |                            |
    |                           |<---- response -------------|
    |<-- reply message ---------|                            |
    |                           |                            |
```

You should receive a reply from your Twilio number with the workflow output.

---

## Different Trigger Types Explained

### 1. Keyword Match
- Text must contain the exact word
- "test" matches "test" or "I need a test"
- "test" does NOT match "testing" or "contest"

### 2. Contains Text  
- Text must contain the substring anywhere
- "appoint" matches "appointment" or "disappoint"

### 3. From Sender
- Only triggers for specific phone numbers
- Good for VIP customers

### 4. Regex Pattern
- Advanced pattern matching
- Example: `\d{2}/\d{2}/\d{4}` matches dates like "12/25/2024"

---

## Quick Test Scenarios

### Test 1: Basic Keyword

| You Text | Should Trigger? |
|----------|-----------------|
| `test` | ✅ Yes |
| `test please` | ✅ Yes |
| `I need a test` | ✅ Yes |
| `testing` | ❌ No (it's part of another word) |

### Test 2: Multiple Keywords

Set up trigger with keywords: `schedule`, `calendar`, `events`

| You Text | Should Trigger? |
|----------|-----------------|
| `show my schedule` | ✅ Yes |
| `calendar please` | ✅ Yes |
| `what events today` | ✅ Yes |
| `hello` | ❌ No |

### Test 3: Priority

If you have two triggers that could match:
- Trigger A: keyword "help", priority 10
- Trigger B: keyword "schedule", priority 5

Text: "help with my schedule"
→ Trigger A runs (higher priority wins)

---

## Troubleshooting

### "I texted but nothing happened"

1. **Is your app running?** Check terminal for errors
2. **Is ngrok running?** The URL changes if you restart it
3. **Is webhook configured?** Check Twilio console
4. **Is the trigger active?** Check the toggle is ON
5. **Is the workflow live?** Draft workflows don't run

### "I get an error response"

1. Check terminal for error logs
2. Make sure workflow exists and is executable

### "Trigger doesn't match"

1. Check if keyword is exact (no typos)
2. Check if case sensitivity is off (default)
3. Try simpler keyword first like "test"

---

## Summary

| Step | What to Do |
|------|------------|
| 1 | Start your app (`bun run dev`) |
| 2 | Start ngrok (`ngrok http 3000`) |
| 3 | Create a workflow (make it "Live") |
| 4 | Add a trigger with keyword "test" |
| 5 | Configure Twilio webhook with ngrok URL |
| 6 | Text "test" from your phone to Twilio number |
| 7 | See the magic happen! |

---

## That's It!

The whole feature in simple terms:

> **Text a keyword → Workflow runs → Get a reply**

No curl commands. No complex setup. Just text your Twilio number and watch it work.
