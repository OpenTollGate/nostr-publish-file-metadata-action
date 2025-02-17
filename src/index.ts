// src/nip94-publisher.ts
import { getInput, setFailed, setOutput } from "@actions/core";
import { SimplePool, nip19 } from "nostr-tools";
import { getPublicKey, finalizeEvent } from "nostr-tools/pure";
import WebSocket from "ws";

global.WebSocket = WebSocket;

interface NIP94Inputs {
  relays: string[];
  url: string;
  mimeType: string;
  fileHash: string;
  content: string;
  originalHash?: string;
  size?: number;
  dimensions?: string;
  nsec: string;
}

async function publishNIP94Event(inputs: NIP94Inputs) {
  const pool = new SimplePool();
  try {
    const tags = [
      ["url", inputs.url],
      ["m", inputs.mimeType],
      ["x", inputs.fileHash],
      ...(inputs.originalHash ? [["ox", inputs.originalHash]] : []),
      ...(inputs.size ? [["size", inputs.size.toString()]] : []),
      ...(inputs.dimensions ? [["dim", inputs.dimensions]] : []),
    ];

    const eventTemplate = {
      kind: 1063,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: inputs.content,
    };

    const signedEvent = finalizeEvent(eventTemplate, inputs.nsec);
    
    await Promise.race([
      pool.publish(inputs.relays, signedEvent),
      new Promise((_, reject) =>
        setTimeout(() => reject("Publish timeout after 30s"), 30000)
      ),
    ]);

    return {
      eventId: signedEvent.id,
      noteId: nip19.noteEncode(signedEvent.id),
      rawEvent: signedEvent,
    };
  } finally {
    pool.close(inputs.relays);
  }
}

try {
  const relays = getInput("relays").split(",");
  const url = getInput("url");
  const mimeType = getInput("mimeType");
  const fileHash = getInput("fileHash");
  const content = getInput("content");
  const nsec = getInput("nsec");
  
  const inputs: NIP94Inputs = {
    relays,
    url,
    mimeType,
    fileHash,
    content,
    nsec,
    originalHash: getInput("originalHash") || undefined,
    size: Number(getInput("size")) || undefined,
    dimensions: getInput("dimensions") || undefined,
  };

  publishNIP94Event(inputs)
    .then(result => {
      setOutput("eventId", result.eventId);
      setOutput("noteId", result.noteId);
      console.log(`Published NIP-94 event: ${result.noteId}`);
      console.log(`View on clients:
- https://snort.social/e/${result.noteId}
- https://primal.net/e/${result.eventId}`);
    })
    .catch(err => {
      throw new Error(`NIP-94 publish failed: ${err}`);
    });
} catch (error) {
  console.error("Action failed:", error instanceof Error ? error.message : error);
  setFailed("NIP-94 publication failed");
}
