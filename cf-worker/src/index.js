/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import OpenAI from "openai";
let client;

export default {
  async fetch(request, env, ctx) {
		client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
		console.log("url:", request.url.toString());
		return handleRequest(env, request);
  },
};

async function handleRequest(env, request) {
	let path = request.url.toString().split("/").slice(3).join("/");
  if (request.method === "GET") {
		return onRequestGet(env, request);
	} else if (request.method === "POST") {
    try {
      const { user, text } = await request.json();
			if (!user) return new Response("Missing user", { status: 400 });
			if (!text) return new Response("Missing text", { status: 400 });

			// TODO: authenticate the user

			let { category, confidence } = await processDictation(env, user, text);
			console.log("category:", category);
			console.log("confidence:", confidence);


			await saveDictation(env, path, user, text, category);

      return new Response(
				`Saved input as ${category} with confidence ${confidence}`,
				{ status: 200 },
			);
    } catch (error) {
			console.error("Error:", error);
      return new Response("Invalid JSON", { status: 400 });
    }
  } else {
    return new Response("Method Not Allowed", { status: 405 });
  }
}

async function processDictation(env, user, text) {
	const response = await client.responses.create({
		model: "gpt-4o",
		input: `Classify the following dictation into one of the following categories: note, reminder, event, task.
Respond in plain JSON (no backticks for markdown code blocks) with the following keys: "category" and "confidence".

Here is the dictation now: ${text}.
`});

	return JSON.parse(response.output_text);
}

async function saveDictation(env, source, user, text, category) {
	const d = new Date();
	const key = `${user}:dictations:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}@${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
	const value = {
		source,
		timestamp: Date.now(),
		category,
		text,
	};
	console.log("key:", key);
	console.log("value:", value);
	await env.VRKV.put(key, JSON.stringify(value, "", " "));
}



export async function onRequestGet(env, request) {
  const url = new URL(request.url);
  const user = url.searchParams.get("user");

  if (!user) {
    return new Response("Missing 'user' query parameter.", { status: 400 });
  }

  // List up to 100 keys with the prefix
  const prefix = `${user}:dictations:`;
  const list = await env.VRKV.list({ prefix, limit: 50 });

  // Sort by timestamp (assuming timestamps in the key names)
  const entries = await Promise.all(
    list.keys.map(async (key) => {
      const value = await env.VRKV.get(key.name);
      try {
        return JSON.parse(value);
      } catch {
        return { text: value };
      }
    })
  );

	// sort by entry.timestamp (it's a unix ts in ms)
	entries.sort((a, b) => b.timestamp - a.timestamp);

	const sourceKeys = {
		"apple-shortcuts-dictation": "Apple Shortcuts Dictation",
		"test-dictation":            "Test Dictation",
	}
	const categoryKeys = {
		"note":     "Note",
		"reminder": "Reminder",
		"event":    "Event",
		"task":     "Task",
		"todo":     "Task",
	}

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${user}'s Recent Dictations</title>
      <style>
        body { font-family: sans-serif; margin: 2rem; }
        h1 { color: #333; }
        .entry { margin-bottom: 1.5rem; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9; }
        .timestamp { font-size: 0.9em; color: #666; }
				.metadata { font-size: 0.9em; color: #666; margin-top: 0.5rem; }
        .text { margin-top: 0.5rem; }
      </style>
    </head>

    <body>
      <h1>Latest Dictations for "${user}"</h1>
      ${entries.length === 0 ? `
				<p>No dictations found.</p>
			` : `
				<p>Found ${entries.length} dictations.</p>
			`}
			${entries.map(entry => {
					entry.category = entry.category.toLowerCase();
					let timestamp = new Date(entry.timestamp).toLocaleString();
					return `
						<div class="entry">
							<div class="timestamp">${timestamp}</div>
							<div class="text">${entry.text}</div>
							<div class="metadata">Category: ${categoryKeys[entry.category] || entry.category}</div>
							<div class="metadata">Source: ${sourceKeys[entry.source] || entry.source}</div>
						</div> `
					}).join("")}
    </body>

    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
