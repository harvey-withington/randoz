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
- **What you write about your own things is for the group; about other
  people's, for you alone.** A photo's sharer sets its title, description
  and tags for everyone, and a group's creator its name and description.
  Anyone else can write their own, kept on their phone: the editing sheet
  says which it is before anything is typed, and private tags are marked
  "private" wherever tags are listed.
- **A wide screen shows two panels.** From 720 px wide, the group list is on
  the left and the open group on the right, with a divider that drags; the
  width is remembered. With no group open the right panel is `Welcome`.
  Screens take their width from their own layout, never from the window.
- **Connection is always said in words, and yours comes first.** A group's
  line says whether this phone is connected, then how many of the others
  are: "Connected · 1 of 2 others online", "Connected · no one else online",
  "Not connected". Its dot is green whenever this phone is connected, however
  many others are. A member's line says "online" or "not connected". Beside an `Avatar` there is no second dot
  and no line: the avatar's own dot shows it, and the row's
  `accessibilityLabel` says it in words for a screen reader.
- **Never wait without a reason.** Anything that needs another phone (a
  photo to arrive, a save) says who it is waiting for, and an action that
  cannot work while nobody is connected is disabled with the reason beside
  it.
- **Colour comes in splashes, fully saturated.** A member's colour is their
  hue at 100 % saturation and the theme's lightness (`theme.tint(hue)`,
  `theme.tintSoft(hue)`); anything without its own colour uses the one
  accent.
- **Say what is true about privacy, where it matters.** Before sharing and
  before leaving, the text says that people can save what you share and
  that leaving removes it from RANDOZ, not from their camera roll. The
  reminder before sharing can be turned off ("Don't show this again") and
  back on under Your name.
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
| `Sheet` | `title`, `onClose`, `children`, `footer?` | UNCLI's `Modal` as it is on a phone: a sheet along the bottom, at most 90 % of the screen and 640 px wide, its content scrolling, its footer's buttons wrapping. Back, the scrim and the close button close it |
| `Avatar` | `person`, `size?`, `onPhoto?` | A member's picture, or their initials on their colour. Not read out: the name is always beside it. `onPhoto` gives it an opaque ground. When `person.online` is known, a dot on the corner: filled green connected, hollow grey not |
| `Field` | `label`, `value`, `onChange`, `placeholder?`, `hint?`, `maxLength?`, `autoFocus?`, `onSubmit?`, `multiline?` | A labelled text field with a hint under it, one line unless `multiline`. UNCLI's `.input` |
| `IdentityPicker` | `identities`, `value`, `onChange`, `onManage?` | "Appear as": Random, then each identity, as radio rows. `value` is an identity's id or `null` for random. `onManage` adds **New identity…** |
| `Choice` | `label`, `options`, `value`, `onChange` | One of a few, as a row of options with the chosen one filled |
| `ToggleRow` | `label`, `hint?`, `value`, `onChange` | An on/off setting: label, what it does, a switch |
| `SearchBox` | `label`, `value`, `onChange` | A search field with a clear button; filters as you type |
| `ZoomImage` | `uri`, `label` | A photo that fills its space: pinch to zoom, drag when zoomed, double tap to zoom in and out |
| `Welcome` | none | The picture and "Pick a group" shown beside the list on a wide screen |
| `ConnectionDot` | `online`, `label` | A dot (filled green on, hollow grey off) and what it means in words |
| `ShellProvider` | `children` | Mounted once in `App`. Gives `useShell()`: `toast(message, kind?)` and `confirm({ title, message, confirmLabel, danger?, optOut?, onOptOut? })`, which resolves `true` or `false`; `optOut` adds a tick box with that label, and `onOptOut` runs if it is ticked and the action confirmed. Toasts sit at the top; errors stay until tapped, others fade after 3.5 s. Confirm is a `Sheet` with Cancel and the action |

Toasts are drawn in the app's own view, so a system dialog covers them.
Anything that toasts while it is open (the photo viewer) is therefore a
layer in the app, not a `Modal`.

## Screens

| Screen | Shows |
|---|---|
| `HomeScreen` | In no group yet: what RANDOZ is, **Start a group**, **Join a group**, and the privacy promise |
| `GroupsScreen` | "Your groups", **Preferences** and **Your identities**. A search box (name and description) once there are two groups. A row per group in the user's own order: its latest photo, name, description or "3 people · 12 photos", its connection line, and a handle to drag it to another place (not while searching); tapping opens it. A group still being joined is a row saying "Joining…" with what it is waiting for and **Stop trying**; a refused invite says so, with **Remove**. **Start a group** and **Join a group** stay at the bottom |
| `StartSheet` | The new group's name, how to appear in it (`IdentityPicker`, starting on the identity used last), then **Start group**, which opens it |
| `JoinSheet` | The camera scanning for an invite's QR code, or **Paste an invite link**. Without camera permission it explains and offers to ask. Under it, how to appear in the group (`IdentityPicker`). Joining carries on in the group list |
| `IdentitiesSheet` | This phone's identities: each one's picture, name, line and how many groups use it; tapping one edits it (name, about, picture, **Delete**, which asks first); **New identity** |
| `GroupScreen` | Header: back to the list (not beside it on a wide screen), the group's name (tap for `GroupDetailsSheet`), "You are <name>", the connection line, Invite, and Who's here. Under it, once there are photos: a search box and **View and filter** (`ViewSheet`); active filters show as chips with "Showing 4 of 12". Then the photos (`Gallery`). **Share photos** floats at the bottom. A long press selects: the header becomes Cancel, "3 selected", **Select all shown** (what the search and filters leave), Save and Unshare (only when every selected photo is yours; it asks first) |
| `PhotoTile` | A thumbnail, or "Arriving…" until it comes. Bottom left: who shared it. Bottom right: a download mark once saved to this phone. Top right, while selecting: a tick |
| `Gallery` | The photos in the sections and order `lib/gallery.ts` gives: large tiles, small tiles, or the details list (`PhotoRow`: thumbnail, title, description, tags, who, when, size) under column headings that sort it. Grouped by person or tag, each section has a heading and a count |
| `ViewSheet` | Layout, Sort by, Group by (remembered for every group), then Show photos from (a chip per sharer) and Show photos tagged (shared tags, then your own marked "private"), which last until the group is closed |
| `DetailsSheet` | A photo's title, description and tags. Says first whether they are for the group (your photo) or for you alone. Tags already used in the group are offered as chips; a new one is typed |
| `GroupDetailsSheet` | A group's name and description: for everyone if you started it, else your own for it |
| `PreferencesSheet` | Photos (layout, sort, group by, details above a photo), Sharing (ask before sharing), Connection (stay connected in the background), Help (copy connection log). Each change applies at once |
| `InviteSheet` | The kinds of invite (shareable, selected; in person, described and not yet available), the invite as a QR code, **Send link**, **Copy link**, and **Turn this invite off** for the member who made it (asks first) |
| `MembersSheet` | Each member's avatar (its dot says whether they are connected), name (with their nickname beside a chosen one), the line about them and photo count. Beside yourself, **Change** opens the `IdentityPicker` for this group. **Leave group** (asks first) |
| `Viewer` | One photo full screen, which pinches to zoom: the thumbnail at once, the preview when it arrives. Above it, the photo's details in full (title, description, tags, the sharer's avatar, name and line about them, date, size), as one line, or hidden; the arrow switches between full and one line, and the choice is remembered. The pencil opens `DetailsSheet`. **Save to camera roll** (**Save again** once saved), and **Unshare** on your own (asks first). With nobody connected and the full-size photo not on this phone, Save is disabled and says why; while saving waits on someone, the button says who |
