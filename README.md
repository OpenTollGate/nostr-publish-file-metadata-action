# Nostr NIP-94 Publisher Action

This repository provides two implementations of a GitHub Action for publishing NIP-94 file metadata to Nostr relays:

## JavaScript Implementation (Original)

```yaml
- name: Publish NIP-94 Metadata
  uses: your-username/nostr-publish-file-metadata-action/js@main
  with:
    relays: "wss://relay.damus.io,wss://nos.lol"
    url: "https://example.com/file.txt"
    mimeType: "text/plain"
    fileHash: "sha256hash..."
    originalHash: "sha256hash..."
    nsec: ${{ secrets.NSEC }}
```

## Python Implementation (Alternative)

```yaml
- name: Publish NIP-94 Metadata
  uses: your-username/nostr-publish-file-metadata-action/python@main
  with:
    relays: "wss://relay.damus.io,wss://nos.lol"
    url: "https://example.com/file.txt"
    mimeType: "text/plain"
    fileHash: "sha256hash..."
    originalHash: "sha256hash..."
    nsec: ${{ secrets.NSEC }}
```

Choose the implementation that best suits your needs. Both provide identical functionality but I currently can't find the events that the javascript verison publishes on the relays.
```

And finally, you could modify your test workflow to test both implementations:

```yaml
# .github/workflows/test.yml
name: Test NIP-94 Publishing
on: [push, pull_request]

jobs:
  test-js-implementation:
    runs-on: ubuntu-latest
    steps:
      # ... your existing JavaScript implementation test ...

  test-python-implementation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Create test file
        run: |
          echo "Nostr file metadata test - $(date)" > testfile.txt
      
      - name: Upload to Blossom
        id: upload
        uses: c03rad0r/upload-blossom-action@using-nsec-argument
        with:
          host: ${{ secrets.HOST }}
          filePath: testfile.txt
          nostrPrivateKey: ${{ secrets.NSEC }}

      - name: Publish NIP-94 Metadata (Python)
        uses: ./python
        with:
          relays: "wss://relay.damus.io,wss://nos.lol,wss://nostr.mom/"
          url: ${{ steps.upload.outputs.blossomUrl }}
          mimeType: "text/plain"
          fileHash: ${{ steps.upload.outputs.blossomHash }}
          originalHash: ${{ steps.upload.outputs.blossomHash }}
          content: "Test file uploaded via GitHub Actions (Python)"
          nsec: ${{ secrets.NSEC }}
          size: ${{ steps.upload.outputs.size }}
```

This approach gives users choice while maintaining backward compatibility and provides a good path for testing and potentially migrating to the Python implementation if it proves more reliable.



## Issues / Contributions
We use nostr to manage issues and pull requests for this repository.

You either need:
* the ability to push to this git remote
* or the to push to your own git remote with [ngit](https://gitworkshop.dev/) installed and ready for use

Any remote branches beginning with `pr/` are rendered as open PRs from contributors on [GitWorkshop](https://gitworkshop.dev/r/naddr1qvzqqqrhnypzpslz866785q0rze0favgmrxmc4yxfzl8vx7ajzqjrpklgcpa0j4fqy88wumn8ghj7mn0wvhxcmmv9uqzymn0wd68yttsw43xc6tndqkkv6tvv5kk6et5v9jxzarp94skxarfdahqu4jauc). You can submit these by simply pushing a branch with this `pr/` prefix.
