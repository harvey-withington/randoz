# 0002. Invites are separate from the group secret, and come in kinds

Status: accepted
Date: 2026-11-15

## Context

The design brief made physical presence the gate: a QR code that changes
every minute, shown on a member's screen, and no shareable links.

Harvey then asked for a choice. Sometimes you want exactly that; sometimes
you want to post an invite in a group chat or on social media, and it
should be safe to do so. The member picks the kind of invite for the
situation.

A posted invite is only safe if it can be taken back, and if seeing it
gives nothing but the chance to ask to join.

## Decision

An invite holds an **invite key**, never the group's secret. From the key
come an id (recorded in the group log), a swarm topic (where members listen
for people holding the invite) and a proof (shown to a member, tied to that
member's connection so it cannot be replayed). A member who accepts the
proof sends the group's secret and log key over the encrypted connection
and adds the newcomer as a writer.

Invites have a kind, written into the code itself:

- **open**: works for anyone who has it until a member turns it off. Built.
- **in-person**: changes every minute and is answered by the member showing
  it, so only someone present can use it. Planned; the code's kind byte and
  the handshake leave room for it.

Turning an invite off is an entry in the group log. Members stop listening
on its topic and refuse its proof.

## Consequences

- An invite can be posted publicly and later shut, without touching the
  group or its members.
- A revoked invite stops new people; it does not remove anyone who already
  joined. Removal is a separate feature.
- Any member can answer an invite, so joining works while the person who
  made it is offline. The price is that the invite key sits in the group
  log, which every member can read. They already hold the group secret,
  which is stronger.
- Members announce on one more topic per live invite. On the public DHT an
  announce takes several seconds, so making an invite is not instant, and
  the app waits for the announce before showing the code.
- "Proximity is the gate" is no longer a rule of the product, only of one
  kind of invite. The safety design (brief section 8) relied on it and
  needs revisiting before strangers use open invites.
