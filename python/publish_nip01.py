import json 
import ssl
import time
from nostr.event import Event
from nostr.relay_manager import RelayManager
from nostr.message_type import ClientMessageType
from nostr.key import PrivateKey

relay_manager = RelayManager()
relay_manager.add_relay("wss://nostr-pub.wellorder.net")
relay_manager.add_relay("wss://relay.damus.io")
relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE}) # NOTE: This disables ssl certificate verification
time.sleep(1.25) # allow the connections to open

private_key = PrivateKey()

# Get public key in different formats
public_key_hex = private_key.public_key.hex()
public_key_bech32 = private_key.public_key.bech32()

print(f"Public Key (hex): {public_key_hex}")
print(f"Public Key (bech32): {public_key_bech32}")

event = Event(
    content="Hello Nostr",
    public_key=public_key_hex,
    created_at=int(time.time()),
    kind=1,
    tags=[]
)
private_key.sign_event(event)

relay_manager.publish_event(event)
time.sleep(1) # allow the messages to send

relay_manager.close_connections()
