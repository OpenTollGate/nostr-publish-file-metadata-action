// src/index.ts
import { getInput, setFailed, setOutput } from "@actions/core";
import { SimplePool, nip19, Event } from "nostr-tools";
import { getPublicKey, finalizeEvent } from "nostr-tools";
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

// Interfaces
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

interface NostrEvent extends Event {
  id: string;
  content: string;
  tags: string[][];
}

// Utility function to validate relay URLs
function validateRelays(relays: string[]): string[] {
  return relays
    .map(r => r.trim())
    .filter(r => r.startsWith('wss://') && r.length > 6)
    .map(r => r.endsWith('/') ? r.slice(0, -1) : r);
}

// Publishing function
async function publishNIP94Event(inputs: NIP94Inputs) {
  const validRelays = validateRelays(inputs.relays);
  if (validRelays.length === 0) {
    throw new Error('No valid relay URLs provided');
  }

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
    pool.close(validRelays);
  }
}

// Verification function
async function verifyNIP94Event() {
  const relays = validateRelays(process.env.RELAYS?.split(',') || []);
  if (relays.length === 0) {
    throw new Error('No valid relay URLs provided');
  }

  const eventId = process.env.EVENT_ID;
  const expectedContent = process.env.EXPECTED_CONTENT;
  const expectedHash = process.env.FILE_HASH;

  if (!eventId || !expectedContent || !expectedHash) {
    throw new Error('Missing required environment variables');
  }

  const pool = new SimplePool();
  
  try {
    return new Promise<void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let eventFound = false;

      const sub = pool.subscribeMany(
        relays,
        [
          {
            ids: [eventId],
            kinds: [1063]
          }
        ],
        {
          onevent(event: NostrEvent) {
            eventFound = true;
            clearTimeout(timeoutId);
            
            try {
              if (event.content !== expectedContent) {
                throw new Error(`Content mismatch\nExpected: ${expectedContent}\nReceived: ${event.content}`);
              }

              const xTag = event.tags.find((t: string[]) => t[0] === 'x');
              if (!xTag || xTag[1] !== expectedHash) {
                throw new Error('File hash validation failed');
              }

              console.log('✅ Verification passed');
              pool.close(relays);
              resolve();
            } catch (error) {
              pool.close(relays);
              reject(error);
            }
          },
          oneose() {
            if (!eventFound) {
              pool.close(relays);
              reject(new Error('Event not found on any relays'));
            }
          }
        }
      );

      timeoutId = setTimeout(() => {
        if (!eventFound) {
          pool.close(relays);
          reject(new Error('Timeout waiting for event'));
        }
      }, 10000);
    });
  } catch (error) {
    console.error('Verification failed:', error);
    setFailed(error instanceof Error ? error.message : 'Unknown error during verification');
    throw error;
  }
}

// Main execution logic
async function main() {
  if (process.env.VERIFY_MODE === 'true') {
    try {
      await verifyNIP94Event();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Verification failed');
      process.exit(1);
    }
  } else {
    try {
      // Get all required inputs
      const relays = validateRelays(getInput("relays").split(","));
      if (relays.length === 0) {
        throw new Error('No valid relay URLs provided');
      }

      const url = getInput("url");
      const mimeType = getInput("mimeType");
      const fileHash = getInput("fileHash");
      const content = getInput("content");
      
      // Process nsec
      const nsecInput = getInput("nsec");
      let nsecBytes: Uint8Array;

      if (!nsecInput) {
        throw new Error("nsec input is required");
      }

      // Remove any whitespace
      const cleanNsec = nsecInput.trim();

      // Handle different formats
      if (cleanNsec.startsWith('nsec1')) {
        const decoded = nip19.decode(cleanNsec);
        nsecBytes = new Uint8Array(Buffer.from(decoded.data as string, 'hex'));
      } else {
        const hexString = cleanNsec.replace('0x', '');
        
        if (!/^[0-9a-fA-F]{64}$/.test(hexString)) {
          throw new Error("Invalid hex format: must be 64 characters long and contain only hex characters");
        }
        
        nsecBytes = new Uint8Array(Buffer.from(hexString, 'hex'));
      }

      if (nsecBytes.length !== 32) {
        throw new Error(`Invalid private key length: expected 32 bytes, got ${nsecBytes.length}`);
      }

      // Construct inputs
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

      const result = await publishNIP94Event(inputs);
      setOutput("eventId", result.eventId);
      setOutput("noteId", result.noteId);
      console.log(`Published NIP-94 event: ${result.noteId}`);
      console.log(`NIP-94 events won't render on most clients`);

    } catch (error) {
      console.error("Action failed:", error instanceof Error ? error.message : error);
      setFailed("NIP-94 publication failed");
      process.exit(1);
    }
  }
}

// Execute
main();
