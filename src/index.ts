import { getInput, setFailed, setOutput } from "@actions/core";
import { SimplePool, nip19 } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

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

interface PublishError extends Error {
  relay?: string;
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

    console.log(`Publishing to ${inputs.relays.length} relays...`);
    let publishedCount = 0;
    
    const publishPromises = inputs.relays.map((relay) => {
      return new Promise<void>(async (resolve, reject) => {
        try {
          const pub = pool.publish([relay], signedEvent);
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout publishing to ${relay}`));
          }, 10000);

          await Promise.all(pub)
            .then(() => {
              clearTimeout(timeout);
              console.log(`Published to ${relay}`);
              publishedCount++;
              resolve();
            })
            .catch((error: Error) => {
              clearTimeout(timeout);
              console.error(`Failed to publish to ${relay}:`, error);
              reject(error);
            });
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    try {
      await Promise.any(publishPromises);
    } catch (error: unknown) {
      console.error("Publishing error:", error);
      if (publishedCount === 0) {
        throw new Error("Failed to publish to any relay");
      }
    }

    return {
      eventId: signedEvent.id,
      noteId: nip19.noteEncode(signedEvent.id),
      rawEvent: signedEvent,
    };
  } finally {
    pool.close(inputs.relays);
  }
}

async function main() {
  try {
    const relays = getInput("relays").split(",");
    const url = getInput("url");
    const mimeType = getInput("mimeType");
    const fileHash = getInput("fileHash");
    const content = getInput("content");
    
    const nsecInput = getInput("nsec");
    let nsecBytes: Uint8Array;

    try {
      if (!nsecInput) {
        throw new Error("nsec input is required");
      }

      const cleanNsec = nsecInput.trim();

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

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to process nsec: ${error.message}`);
      }
      throw error;
    }

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
    console.log(`View on clients:
- https://snort.social/e/${result.noteId}
- https://primal.net/e/${result.eventId}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Action failed:", errorMessage);
    setFailed("NIP-94 publication failed");
  }
}

// Execute the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  setFailed("Unhandled error in NIP-94 publication");
});
