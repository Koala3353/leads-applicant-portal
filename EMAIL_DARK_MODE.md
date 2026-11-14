# How to code a LEADS email so it survives dark mode

For anyone (or any AI) building an Eyes on LEADS email: results blasts, payment emails, announcements.
Written Nov 14 2026, after a night of testing on Keene's iPhone. Follow it exactly; every rule here was learned by an email breaking.

## The problem in one paragraph

**Gmail on iPhone, in dark mode, rewrites your email.** It looks at every `background-color` / `bgcolor`, flips dark ones to light,
and then darkens your text so it "contrasts" with the light colour it invented. It does this **even when the colour is hidden
under a background image**, so you end up with dim grey/olive text on your dark panels (lab, Nov 13: every panel with a colour
behind its image had unreadable text; a panel with only a colour turned light grey). Apple Mail, Gmail on the web and Outlook each
do their own thing on top. The fix is not a trick on the text. It is to give Gmail **no background colour to flip**.

## The rules

1. **Surfaces are background IMAGES only.** Every dark or coloured area (page, window, panels, bars, paper, manila) is a hosted
   tile: `background-image:url('https://i.imgur.com/....png');background-repeat:repeat;`.
   **Never** put `background-color:` or `bgcolor=""` on anything that holds text. (Outlook-only rules inside
   `[data-ogsb] ...` in the `<style>` block are fine; Gmail ignores them.)
   The one exception that has been tested and works: the red rubber-stamp button may keep `background-color:#a32620` (Nathan's
   Accepted.js does, and it renders right on the iPhone).
2. **Light text on the dark image panels is fine** (`#d8d8d3` body, `#f0efe9` headings, `#ffffff` title bars, `#ff3038` red,
   `#85858a` muted). With no colour to flip, Gmail leaves it alone.
3. **Dark text goes only on a light image tile** (the cream paper `bg_paper`, manila `bg_manila`, yellow `bg_yellow`), never on a
   light `background-color`. Highlights are a yellow tile behind dark text, not yellow text.
4. **Every text colour is also a class**, re-declared for dark mode and for Outlook, so clients that do read CSS keep it:
   ```css
   @media (prefers-color-scheme: dark) { .t-text { color:#d8d8d3 !important; } .t-paper { color:#211f19 !important; } /* ... */ }
   [data-ogsc] .t-text { color:#d8d8d3 !important; }   /* Outlook */
   ```
   and every element carries both the class and the inline colour: `<td class="t-text" style="color:#d8d8d3;">`.
5. **Tell clients not to recolour:** `<meta name="color-scheme" content="light only">`,
   `<meta name="supported-color-schemes" content="light">`, and `:root { color-scheme: light only; supported-color-schemes: light; }`.
   Apple Mail respects it; Gmail does not (hence rules 1 to 3).
6. **The Gmail iOS fix div** as the last thing in `<body>`, with `u + .body .gmail-fix { display:none; }` in the style block and
   `class="body"` on `<body>`:
   ```html
   <div class="gmail-fix" style="display:none;white-space:nowrap;font:15px courier;line-height:0;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
   ```
7. **No blend-mode tricks.** The famous `mix-blend-mode: screen / difference` "Gmail dark mode fix" does nothing when written as
   a class in Gmail iOS, and when written inline it turns your colours into their opposites (manila → lavender, red → teal).
   Do not use it.
8. **No near-white-on-colour hacks either:** making text "less white" or "brighter" does not help; Gmail darkens light text of any
   colour when it thinks the background is light. Rule 1 is the only thing that works.
9. **Images are hosted links, never inline attachments (CID).** Attachments show up as files on phones and as "image +3" in the
   notification. GIFs live on GitHub Pages (`docs/mail/`) or imgur.
10. **Layout like it is 2005:** nested `<table role="presentation">`, inline styles, one 600 px column with `max-width:600px`, a
    `@media only screen and (max-width:480px)` block for phone padding and font sizes. Web fonts (Google Fonts link) are a bonus
    for Apple Mail; always give fallback stacks (`'JetBrains Mono', Menlo, Consolas, monospace`).

## The tiles (all hosted on imgur, 1x1 or small)

| Name | Colour it stands for | URL |
|---|---|---|
| bg_outer | page `#0c0c0e` | https://i.imgur.com/V8jQqbw.png |
| grain | window `#252527` with grain | https://i.imgur.com/02P7pBN.png |
| bg_panel | inset `#17181c` | https://i.imgur.com/ZtlO7pz.png |
| bg_paper | cream paper `#e6dfc9` | https://i.imgur.com/LZ8xRXB.png |
| bg_manila | manila `#d3bc86` | https://i.imgur.com/5nzgKEm.png |
| bg_edge | paper edge `#f1ecda` | https://i.imgur.com/64X5i55.png |
| bg_yellow | warning yellow `#f2ea00` | https://i.imgur.com/uZqf0CR.png |
| bg_red | red `#ff3038` | https://i.imgur.com/oFCz3I1.png |
| bg_grey | Win95 grey `#c0c0c0` | https://i.imgur.com/BkStD1h.png |
| bar_blue | title bar navy (stretch it: `background-size:100% 100%`) | https://i.imgur.com/ZplW8Fl.png |
| bar_red | title bar maroon | https://i.imgur.com/HVlgs0R.png |

Other assets: title image https://i.imgur.com/cpAjLSQ.png, REC dot https://i.imgur.com/n5qzW3m.gif, peeking eye https://i.imgur.com/uhoxnzE.gif.

## Start from a working email, don't start from scratch

These render correctly in Gmail on iPhone (dark and light), Apple Mail and Gmail web. Copy one and change the words:

- **`PaymentMailHtml.gs`** (portal): the two payment emails. Cleanest example: one function, `payMail_html_(kind, v)`.
- **`Accepted.js` / `Waitlisted.js` / `Rejected.js`** in the "[LEADS 2627] EMAIL BLAST SHEET" Apps Script project
  (script `1nvIOCr1LlwT4zghdqtmO-DWqrgaaxxBNOy_o6SHHnJqpx-KUV7taFqgo`): Nathan's results designs, the reference the above was built from.
- **`Launch.js`** in the same project: the application launch blast, the first email that got this right.
- **`Combined Email Sender.js`** in the results project (`1QYum8uOMnBz3B8rjjT0fMf48XTZH5XSQWqryWNxhpZi_4sPqx7sYgFDc`): the scheduled
  results blast (tracker lists, release ticks, scheduling). Since Nov 14 2026 it sends Nathan's design (one shared shell,
  `mailShell_`, plus `mailKit_` helpers; `buildHtml_(p, type)` writes only each letter). Edit the words there: this is what goes out.

**Buttons (Nov 14 2026):** the main action is a solid red rubber stamp (`background-color:#a32620`, the tested exception, square
corners, a 1px dashed cream inner line, label + →, no emoji); everything else is an outlined ink stamp on the paper (2px `#a32620`
border, rust text, **no fill at all**). Both are in `mailKit_` (results) and `payMail_html_` (payments).

Skeleton of each: Win95 title bar → REC bar → yellow case-file label + title image + red tagline → small data block on the dark
window → manila folder with the cream paper memo (dark typed text, yellow-tile highlights, red stamp buttons) → closing line with
the peeking eye → footer → `gmail-fix` div.

## Test before you send to anyone

1. Send it to yourself (every script has a test function that only emails the person running it: `payMail_test`,
   `sendTestEmails`, `sendTestEmail3/4/5`).
2. Open it in **the Gmail app on an iPhone with dark mode ON**. That is the client that breaks things; if it looks right there it
   looks right everywhere we have tried. Then check light mode and one other app (Apple Mail or Gmail on a laptop).
3. Not sure how a colour or technique behaves? The results project has `darkModeLab()` and `contrastLab2()`: they email you
   labelled rows of the same text drawn different ways. Screenshot them in Gmail iPhone dark mode and pick the row that survives.

## Words

Brand voice still applies: deadpan, second person, short sentences, no exclamation marks, end on what happens next.
User-facing copy says "core team", never "officers".
