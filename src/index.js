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
    pool = new SimplePool({
      eoseSubTimeout: 10000,
      getTimeout: 10000,
    });

    // Verify relay connections first
    console.log("Verifying relay connections...");
    for (const relay of inputs.relays) {
      try {
        await pool.ensureRelay(relay);
        console.log(`Connected to ${relay}`);
      } catch (error) {
        console.error(`Failed to connect to ${relay}:`, error);
      }
    }

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
    console.log("Event created:", {
      id: signedEvent.id,
      kind: signedEvent.kind,
      created_at: signedEvent.created_at,
      tagCount: signedEvent.tags.length
    });

    console.log(`Publishing to ${inputs.relays.length} relays...`);

    const results = await Promise.allSettled(
      inputs.relays.map(async (relay) => {
        try {
          const relayInstance = await pool.ensureRelay(relay);
          const pub = await Promise.race([
            relayInstance.publish(signedEvent).catch(e => {
              console.error(`Internal publish error for ${relay}:`, e);
              throw e;
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Publication timeout for ${relay}`)), 30000)
            )
          ]);
          console.log(`Published to ${relay}`, pub);
          return relay;
        } catch (error) {
          console.error(`Failed to publish to ${relay}:`, error);
          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled');
    if (successful.length === 0) {
      throw new Error("Failed to publish to any relay");
    }

    console.log(`Successfully published to ${successful.length} relays`);

    return {
      eventId: signedEvent.id,
      noteId: nip19.noteEncode(signedEvent.id),
      rawEvent: signedEvent,
    };
  } catch (error) {
    console.error("Error in publishNIP94Event:", error);
    throw error;
  } finally {
    if (pool) {
      try {
        // Increased delay to ensure all operations complete
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (pool._relays) {
          for (const [_, relay] of Object.entries(pool._relays)) {
            if (relay && typeof relay.close === 'function') {
              try {
                await relay.close();
                console.log(`Closed connection to relay`);
              } catch (closeError) {
                console.error(`Error closing relay connection:`, closeError);
              }
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
    console.log("Starting main function...");
    const relays = core.getInput("relays").split(",");
    const url = core.getInput("url");
    const mimeType = core.getInput("mimeType");
    const fileHash = core.getInput("fileHash");
    const content = core.getInput("content");
    const nsecInput = core.getInput("nsec");
    let nsecBytes;

    console.log("Validating inputs...");
    try {
      if (!nsecInput) {
        throw new Error("nsec input is required");
      }

      const cleanNsec = nsecInput.trim();

      if (cleanNsec.startsWith('nsec1')) {
        console.log("Processing bech32 nsec...");
        const decoded = nip19.decode(cleanNsec);
        nsecBytes = new Uint8Array(Buffer.from(decoded.data, 'hex'));
      } else {
        console.log("Processing hex nsec...");
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

    console.log("Publishing event...");
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

main().catch(error => {
  console.error("Unhandled error in main:", error);
  core.setFailed(error.message);
  process.exit(1);
});
