# RANDOZ UI conventions

This is a contract. Update it in the same change as any shared component,
token or pattern, and keep the prop tables in step with the code.

RANDOZ follows UNCLI's conventions wherever a phone app can: the same
tokens, the same ground rules, the same shell for toasts and confirmation.
UNCLI is Svelte in a desktop window; RANDOZ is React Native on a phone, so
CSS custom properties become a theme object and `Modal` becomes a bottom
sheet. Where the two differ, this file says how.

The UI is `app/` (React Native, Expo). It never touches the network or the
group's data itself: it sees the core's state and calls its methods through
`useNode()` (`src/store/node.tsx`). The core runs in a Bare worklet
(`app/worklet/worker.js` around `core/`).

## Ground rules

- Function components with hooks, typed props via `interface Props`, strict
  TypeScript, never `any`.
- Every user-visible string goes through `t('key')` (`src/i18n`); keys live
  in `src/locales/en.json`. Counts go through `plural()`. A test fails if
  the code uses a key that is missing, or the file holds one that is unused.
- Colours and sizes come from `useTheme()` (`src/theme`), defined for light
  and dark; the app follows the phone's setting. Components never hardcode
  a colour or a size, and colour is never the only signal: a member's
  colour always comes with their name.
- No component over about 300 lines; extract a child when one grows.
- Errors the user should know about are shown (toast or inline), never only
  logged. No `Alert.alert()`: destructive actions go through
  `shell.confirm()`. Components take the shell with `useShell()`.
- Keyed lists use stable ids, never the index.
- Touch targets are at least 44 px (`theme.touch`). Icon-only buttons carry
  an `accessibilityLabel`.
- **Back = Escape.** The Back button or gesture closes the topmost layer
  only: a sheet, the confirm dialog, the photo viewer, a selection, then the
  open group (back to the list). With nothing open it goes to the phone's
  home screen and leaves the app running: letting Android close the screen
  would leave the core running behind it.
- **A long press starts a selection** in a list of things that can be acted
  on together. While selecting, a tap toggles; the header becomes the
  selection's own bar (cancel, the count, the actions).
- **Connection is always said in words.** A dot never stands alone: it comes
  with "2 of 3 online", "online" or "not connected".
- **Colour comes in splashes, fully saturated.** A member's colour is their
  hue at 100 % saturation and the theme's lightness (`theme.tint(hue)`,
  `theme.tintSoft(hue)`); anything without its own colour uses the one
  accent.
- **Say what is true about privacy, where it matters.** Before a first
  share and before leaving, the text says that people can save what you
  share and that leaving removes it from RANDOZ, not from their camera roll.
- Motion is subtle (120–200 ms) and never carries meaning by itself.
- Text is `Txt`, never a bare `Text`, so the font and scale stay in one place.

## Tokens

`useTheme()` returns these. The palette, spacing and radii are UNCLI's.

| Token | Use |
|---|---|
| `color.bg` | Screen background |
| `color.surface` | Headers, sheets, cards, toasts |
| `color.surface2` / `color.surface3` | Pressed fills, empty photo tiles / placeholders |
| `color.text` / `color.textMuted` / `color.textFaint` | Body, secondary, hints and placeholders |
| `color.border` / `color.borderStrong` | Dividers / outlines of buttons and fields |
| `color.accent` / `color.accentSoft` / `color.accentText` | The one accent: primary actions, selection / its soft fill / text on it |
| `color.danger` / `color.dangerSoft` | Errors and destructive actions |
| `color.warning` / `color.success` | Cautions / done, saved |
| `color.scrim` | Behind sheets |
| `color.qrGround` / `color.qrInk` | A QR code's ground (white in both themes, so it scans) and ink |
| `color.tintL` | Lightness for member colours (40 % light, 62 % dark) |
| `space[1]` … `space[7]` | 4, 8, 12, 16, 24, 32, 48 px |
| `radius.sm` / `radius.md` / `radius.lg` | 6, 10, 14 px |
| `fontSize.xs` … `fontSize.xl` | 12, 13.5, 15.5, 17.5, 22 px: UNCLI's scale one step up, for a phone |
| `font.regular` / `font.medium` / `font.semibold` | Inter 400, 500, 600 (bundled) |
| `touch` | 44 px, the smallest tappable size |
| `motion.fast` / `motion.normal` | 120, 200 ms |

## Components

| Component | Props | Notes |
|---|---|---|
| `Txt` | `variant?` (`body`, `muted`, `faint`, `label`, `title`, `heading`), `color?`, `center?` | All text. `color` takes a token |
| `Button` | `label`, `onPress`, `kind?` (`primary`, `default`, `ghost`, `danger`), `icon?`, `disabled?`, `busy?`, `wide?` | UNCLI's `.btn`. `busy` shows a spinner and blocks presses |
| `IconButton` | `label`, `icon`, `onPress`, `color?`, `disabled?`, `badge?` | Icon only, 44 px; `label` is read out |
| `Sheet` | `title`, `onClose`, `children`, `footer?` | UNCLI's `Modal` as it is on a phone: a sheet along the bottom, at most 90 % of the screen, its content scrolling, its footer's buttons wrapping. Back, the scrim and the close button close it |
| `Avatar` | `person`, `size?`, `onPhoto?` | A member's initials on their colour. Not read out: the name is always beside it. `onPhoto` gives it an opaque ground |
| `Field` | `label`, `value`, `onChange`, `placeholder?`, `hint?`, `maxLength?`, `autoFocus?`, `onSubmit?` | A labelled one-line text field with a hint under it. UNCLI's `.input` |
| `ConnectionDot` | `online`, `label` | A dot (filled green on, hollow grey off) and what it means in words |
| `ShellProvider` | `children` | Mounted once in `App`. Gives `useShell()`: `toast(message, kind?)` and `confirm({ title, message, confirmLabel, danger? })`, which resolves `true` or `false`. Toasts sit at the top; errors stay until tapped, others fade after 3.5 s. Confirm is a `Sheet` with Cancel and the action |

Toasts are drawn in the app's own view, so a system dialog covers them.
Anything that toasts while it is open (the photo viewer) is therefore a
layer in the app, not a `Modal`.

## Screens

| Screen | Shows |
|---|---|
| `HomeScreen` | In no group yet: what RANDOZ is, **Start a group**, **Join a group**, and the privacy promise |
| `GroupsScreen` | "Your groups" and the **Your name** button. A row per group, newest first: its latest photo, name, "3 people · 12 photos", and its connection line; tapping opens it. A group still being joined is a row saying "Joining…" with what it is waiting for and **Stop trying**; a refused invite says so, with **Remove**. **Start a group** and **Join a group** stay at the bottom |
| `StartSheet` | The new group's name, then **Start group**, which opens it |
| `JoinSheet` | The camera scanning for an invite's QR code, or **Paste an invite link**. Without camera permission it explains and offers to ask. Joining carries on in the group list |
| `ProfileSheet` | The one name other members see, in every group. Empty keeps the random nickname each group gives |
| `GroupScreen` | Header: back to the list, the group's name, "You are <name>", the connection line, Invite, and Who's here. A three-column grid of `PhotoTile`s, newest first. **Share photos** floats at the bottom: pick, confirm, then "Sharing 2 of 5…". A long press selects: the header becomes Cancel, "3 selected", Save and Unshare (only when every selected photo is yours; it asks first) |
| `PhotoTile` | A thumbnail, or "Arriving…" until it comes. Bottom left: who shared it. Bottom right: a download mark once saved to this phone. Top right, while selecting: a tick |
| `InviteSheet` | The kinds of invite (shareable, selected; in person, described and not yet available), the invite as a QR code, **Send link**, **Copy link**, and **Turn this invite off** for the member who made it (asks first) |
| `MembersSheet` | Each member's avatar, name (with their nickname beside a chosen one), photo count and whether they are online, and **Leave group** (asks first) |
| `Viewer` | One photo full screen: the thumbnail at once, the preview when it arrives, who shared it, **Save to camera roll** (**Save again** once saved), and **Unshare** on your own (asks first) |
