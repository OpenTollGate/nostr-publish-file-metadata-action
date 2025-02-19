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

// Add this function at the top level
function validateNIP94Input(inputs) {
  const requiredFields = {
    url: 'URL is required for NIP-94',
    mimeType: 'MIME type is required for NIP-94',
    fileHash: 'File hash (SHA-256) is required for NIP-94',
    originalHash: 'Original file hash (SHA-256) is required for NIP-94'
  };

  const missingFields = [];
  for (const [field, message] of Object.entries(requiredFields)) {
    if (!inputs[field]) {
      missingFields.push(message);
    }
  }

  if (missingFields.length > 0) {
    throw new Error(`Invalid NIP-94 input: ${missingFields.join(', ')}`);
  }

  // Validate MIME type format
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(inputs.mimeType.toLowerCase())) {
    throw new Error('Invalid MIME type format');
  }

  // Validate SHA-256 hash formats
  const validateHash = (hash, field) => {
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      throw new Error(`Invalid ${field} hash format: must be a 64-character hex string`);
    }
  };

  validateHash(inputs.fileHash, 'file');
  validateHash(inputs.originalHash, 'original file');

  // Validate URL format
  try {
    new URL(inputs.url);
  } catch (e) {
    throw new Error('Invalid URL format');
  }

  return {
    ...inputs,
    mimeType: inputs.mimeType.toLowerCase(), // Ensure lowercase MIME type
  };
}

async function publishNIP94Event(inputs) {
  let pool = null;
  try {
    // Validate inputs before proceeding
    inputs = validateNIP94Input(inputs);

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

    // Create tags with ALL mandatory fields
    const mandatoryTags = [
      ["url", inputs.url],
      ["m", inputs.mimeType],
      ["x", inputs.fileHash],
      ["ox", inputs.originalHash],
    ];

    // Add optional tags
    const optionalTags = [
      ...(inputs.size ? [["size", inputs.size.toString()]] : []),
      ...(inputs.dimensions ? [["dim", inputs.dimensions]] : []),
    ];

    const tags = [...mandatoryTags, ...optionalTags];

    // Verify all required tags are present
    const requiredTags = ['url', 'm', 'x', 'ox'];
    const missingTags = requiredTags.filter(t => !tags.some(([name]) => name === t));
    if (missingTags.length > 0) {
      throw new Error(`Missing required NIP-94 tags: ${missingTags.join(', ')}`);
    }

    const eventTemplate = {
      kind: 1063,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: inputs.content || '', // Ensure content is never undefined
    };

    const signedEvent = finalizeEvent(eventTemplate, inputs.nsec);

    // Validate the signed event
    if (!signedEvent.sig || signedEvent.sig.length !== 128 || !/^[0-9a-f]{128}$/i.test(signedEvent.sig)) {
      throw new Error('Invalid event signature');
    }

    // Log the complete event for debugging
    console.log("Event created:", {
      id: signedEvent.id,
      kind: signedEvent.kind,
      created_at: signedEvent.created_at,
      tagCount: signedEvent.tags.length,
      tags: signedEvent.tags // Add this for better debugging
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
        if (pool._relays) {
          await Promise.all(
            Object.values(pool._relays).map(async (relay) => {
              if (relay && typeof relay.close === 'function') {
                try {
                  relay.close();
                } catch (closeError) {
                  console.error(`Error closing relay connection:`, closeError);
                }
              }
            })
          );
        }
        // Force cleanup of the pool
        pool = null;
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
    
    // Get and validate required inputs first
    const required = ['relays', 'url', 'mimeType', 'fileHash', 'originalHash', 'nsec'];
    for (const input of required) {
      const value = core.getInput(input);
      if (!value) {
        throw new Error(`Required input '${input}' is missing`);
      }
    }

    const content = core.getInput("content");
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
      originalHash: core.getInput("originalHash"),
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

    // Add explicit exit
    process.exit(0);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Action failed:", errorMessage);
    core.setFailed(error.message);
    process.exit(1);
  }
}

// Modify the main execution to handle any unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

main().catch(error => {
  console.error("Unhandled error in main:", error);
  core.setFailed(error.message);
  process.exit(1);
});
