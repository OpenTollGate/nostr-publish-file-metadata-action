let core;
try {
    core = require('@actions/core');
} catch (error) {
    console.error('Failed to load @actions/core:', error);
    process.exit(1);
}

const { SimplePool } = require('nostr-tools');
const { getPublicKey, finalizeEvent } = require('nostr-tools/pure');
const WebSocket = require('ws');
const { nip19 } = require('nostr-tools');

// Simple WebSocket global assignment
global.WebSocket = WebSocket;

async function publishNIP94Event(inputs) {
  let pool = null;
  try {
    console.log("Creating SimplePool...");
    pool = new SimplePool();

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

    const results = await Promise.allSettled(
      inputs.relays.map(async (relay) => {
        try {
          await Promise.race([
            pool.publish([relay], signedEvent),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Publication timeout for ${relay}`)), 30000)
            )
          ]);
          console.log(`Published to ${relay}`);
          return relay;
        } catch (error) {
          console.error(`Failed to publish to ${relay}:`, error.message);
          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled');
    if (successful.length === 0) {
      throw new Error("Failed to publish to any relay");
    }

    return {
      eventId: signedEvent.id,
      noteId: nip19.noteEncode(signedEvent.id),
      rawEvent: signedEvent,
    };
  } finally {
    if (pool) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (pool._relays) {
          for (const [_, relay] of Object.entries(pool._relays)) {
            if (relay && typeof relay.close === 'function') {
              await relay.close();
            }
          }
        }
        console.log("Pool cleaned up successfully");
      } catch (closeError) {
        console.error("Error during cleanup:", closeError);
      }
    }
  }
}

async function main() {
  try {
    const relays = core.getInput("relays").split(",");
    const url = core.getInput("url");
    const mimeType = core.getInput("mimeType");
    const fileHash = core.getInput("fileHash");
    const content = core.getInput("content");
    const nsecInput = core.getInput("nsec");
    let nsecBytes;

    try {
      if (!nsecInput) {
        throw new Error("nsec input is required");
      }

      const cleanNsec = nsecInput.trim();

      if (cleanNsec.startsWith('nsec1')) {
        const decoded = nip19.decode(cleanNsec);
        nsecBytes = new Uint8Array(Buffer.from(decoded.data, 'hex'));
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
      throw new Error(`Failed to process nsec: ${error.message}`);
    }

    const originalHash = core.getInput("originalHash");
    const size = core.getInput("size");
    const dimensions = core.getInput("dimensions");

    const inputs = {
      relays,
      url,
      mimeType,
      fileHash,
      content,
      nsec: nsecBytes,
      originalHash: core.getInput("originalHash") || undefined,
      size: Number(core.getInput("size")) || undefined,
      dimensions: core.getInput("dimensions") || undefined,
    };

    const result = await publishNIP94Event(inputs);
    
    core.setOutput("eventId", result.eventId);
    core.setOutput("noteId", result.noteId);
    console.log(`Published NIP-94 event: ${result.noteId}`);
    console.log(`View on clients:
- https://snort.social/e/${result.noteId}
- https://primal.net/e/${result.eventId}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Action failed:", errorMessage);
    core.setFailed(error.message);
  }
}

// Don't forget to call main()
main();
