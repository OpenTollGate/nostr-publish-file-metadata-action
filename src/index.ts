// src/nip94-publisher.ts
import { getInput, setFailed, setOutput } from "@actions/core";
import { SimplePool, nip19 } from "nostr-tools";
import { getPublicKey, finalizeEvent } from "nostr-tools";
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

// Modify the NIP94Inputs interface
interface NIP94Inputs {
  relays: string[];
  url: string;
  mimeType: string;
  fileHash: string;
  content: string;
  originalHash?: string;
  size?: number;
  dimensions?: string;
  nsec: Uint8Array;
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

    return {
      eventId: signedEvent.id,
      noteId: nip19.noteEncode(signedEvent.id),
      rawEvent: signedEvent,
    };
  } finally {
    pool.close(inputs.relays);
  }
}

// Update input processing
try {
  // Get all required inputs first
  const relays = getInput("relays").split(",");
  const url = getInput("url");
  const mimeType = getInput("mimeType");
  const fileHash = getInput("fileHash");
  const content = getInput("content");
  
// Process nsec
const nsecInput = getInput("nsec");
let nsecBytes: Uint8Array;

try {
  if (!nsecInput) {
    throw new Error("nsec input is required");
  }

  // Remove any whitespace
  const cleanNsec = nsecInput.trim();

  // Handle different formats
  if (cleanNsec.startsWith('nsec1')) {
    // Handle bech32 nsec format
    const decoded = nip19.decode(cleanNsec);
    nsecBytes = new Uint8Array(Buffer.from(decoded.data as string, 'hex'));
  } else {
    // Handle hex format
    // Remove '0x' prefix if present
    const hexString = cleanNsec.replace('0x', '');
    
    // Validate hex string
    if (!/^[0-9a-fA-F]{64}$/.test(hexString)) {
      throw new Error("Invalid hex format: must be 64 characters long and contain only hex characters");
    }
    
    nsecBytes = new Uint8Array(Buffer.from(hexString, 'hex'));
  }

  // Validate the length of the resulting bytes
  if (nsecBytes.length !== 32) {
    throw new Error(`Invalid private key length: expected 32 bytes, got ${nsecBytes.length}`);
  }

} catch (error) {
  if (error instanceof Error) {
    throw new Error(`Failed to process nsec: ${error.message}`);
  }
  throw error;
}

  // Construct inputs with proper variable names
  const inputs: NIP94Inputs = {
    relays,
    url,
    mimeType,
    fileHash,
    content,
    nsec: nsecBytes,
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
