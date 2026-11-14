# 0003: Identities are chosen per group

## Context

A device has a separate key pair in every group, so nothing in the protocol
links what it does in one group to what it does in another. The first build
had one optional name that was shown in every group, which quietly undid
that for anyone who set it, and gave no way to be "Harv" among friends and
anonymous among strangers.

## Decision

A device holds any number of **identities**: a name, a short line about the
person, and an optional small picture. They exist only on that device. Each
group uses one identity, or none; with none the group shows the random
nickname and colour it derives from the member's key, as before.

- The identity is chosen when starting or joining a group, and can be
  changed later for that group alone.
- What a group is told is a copy: a `profile` entry in the group log with
  the name, the line and the picture (base64 JPEG, about 30 KB at most).
  The identity's id never leaves the device.
- Editing an identity updates every group that uses it. Deleting it sends
  those groups back to their random nickname.
- The key pair is still per group. Using one identity in two groups links
  them only to someone who is in both and recognises the name or picture,
  which is the user's choice to make, and the screen says so.

## Consequences

- The picture travels in the group log, not as a blob, so it is there as
  soon as the member is, with no second fetch. The log is encrypted with the
  group's key like everything else in it.
- A member's colour still comes from their per-group key, so the same
  identity has a different colour in each group.
- The old single name is migrated on first start: it becomes one identity,
  and the groups already joined keep using it.
