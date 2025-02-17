# Upload Blossom (Action)

This action allows you to upload a file to a blossom server.
This action is still very experimental, so expect bugs. If you find any please let me know.

## Example usage
```yaml
jobs:
  upload-blossom-job:
    runs-on: ubuntu-latest
    steps:
      - name: Upload to Blossom
        uses: Origami74/upload-blossom-action@main
        with:
          host: 'https://blossom.domain.com/'
          filePath: 'some-file.txt'
```

## Building

Run
`npm run build` to build the app into the `dist` directory.

## Issues / Contributions

Please use Nostr to create issues and pull-requests for this repository.
Go to [GitWorkshop](https://gitworkshop.dev/r/naddr1qvzqqqrhnypzpwa4mkswz4t8j70s2s6q00wzqv7k7zamxrmj2y4fs88aktcfuf68qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgwwaehxw309ahx7uewd3hkctcpzamhxue69uhhyetvv9ujumn0wd68ytnzv9hxgtcpz4mhxue69uhhyetvv9ujuerpd46hxtnfduhsq9t4wpkx7cty943xcmmnwdhk6ttpvd6xjmmw8kl5gl/proposals)