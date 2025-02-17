import {getInput, setFailed, setOutput} from "@actions/core"
import {readFileSync} from 'fs';
import {NDKPrivateKeySigner, NostrEvent} from "@nostr-dev-kit/ndk";
import {BlossomClient, EventTemplate, SignedEvent} from "blossom-client-sdk";
import mime from "mime";

console.log('Starting blossom Upload');

async function upload(filePath: string, host: string, nostrPrivateKey: string): Promise<void> {
    const data = readFileSync(filePath, 'utf-8');

    const fileType = mime.getType(filePath);
    const blob = new Blob([data], {type: fileType?.toString()});

    async function signer(event: EventTemplate): Promise<SignedEvent> {
        const signer = new NDKPrivateKeySigner(nostrPrivateKey);
        const pubkey = await signer.user().then(u => u.pubkey)

        const signature =  await signer.sign(event as NostrEvent);

        const y = event as NostrEvent
        return {...event, pubkey: pubkey, sig: signature, id: y.id!};
    }

    const client = new BlossomClient(host, signer);
    const uploadAuthEvent = await client.createUploadAuth(blob, 'Upload file')
    const result = await client.uploadBlob(blob, {auth: uploadAuthEvent})

    setOutput("blossomUrl", result.url);
    setOutput("blossomHash", result.sha256);
    console.log(`Blob uploaded!, ${result.url}`);
}

try {
    // Fetch the value of the input 'who-to-greet' specified in action.yml
    const host = getInput('host');
    const filePath = getInput('filePath');
    const nostrPrivateKey = getInput('nostrPrivateKey');

    console.log(`Uploading file '${filePath}' to host: '${host}'!`);

    upload(filePath, host, nostrPrivateKey)
        .catch((error) => {
            console.error("Blossom Upload failed with error", error);

            if(error instanceof Error) {
                setFailed(error.message);
            } else{
                setFailed("unexpected error");
            }
        })

} catch (error) {
    console.error("Blossom Upload failed with error", error);

    if(error instanceof Error) {
        setFailed(error.message);
    } else{
        setFailed("unexpected error");
    }
}