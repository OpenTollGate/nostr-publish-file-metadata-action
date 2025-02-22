import json
import ssl
import time
from nostr.filter import Filter, Filters
from nostr.event import Event, EventKind
from nostr.relay_manager import RelayManager
from nostr.message_type import ClientMessageType

# Create a filter for the specific event ID
event_id = "94aff13f86ddf8eef1053169f2571af65c778608b38030351930adfb0009d895"
filters = Filters([Filter(event_ids=[event_id])])

subscription_id = "randomsub"
request = [ClientMessageType.REQUEST, subscription_id]
request.extend(filters.to_json_array())

relay_manager = RelayManager()
relay_manager.add_relay("wss://relay.damus.io")
relay_manager.add_relay("wss://nos.lol")
relay_manager.add_relay("wss://nostr.mom")

relay_manager.add_subscription(subscription_id, filters)
relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
time.sleep(10.25)

message = json.dumps(request)
relay_manager.publish_message(message)
time.sleep(1)

while relay_manager.message_pool.has_events():
    event_msg = relay_manager.message_pool.get_event()
    print(f"Event ID: {event_msg.event.id}")
    print(f"Content: {event_msg.event.content}")
    print(f"Created at: {event_msg.event.created_at}")
    print(f"Pubkey: {event_msg.event.public_key}")
    print("---")

relay_manager.close_connections()
