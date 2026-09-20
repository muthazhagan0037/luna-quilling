# Luna Quilling — Free Business System

A mobile-first handmade quilling-art catalogue and enquiry system using:

- GitHub Pages — public static website
- Google Apps Script — API/backend
- Google Sheets — artwork + enquiry database
- Google Drive — artwork and private customer-reference storage
- Google Forms — optional phone-friendly artwork entry
- Google Identity Services — Google-account protection for the private admin dashboard
- MailApp — enquiry notifications and customer acknowledgements

## Files

- `index.html` — home
- `works.html` — dynamic catalogue
- `artwork.html` — dynamic individual artwork page
- `enquire.html` — existing-artwork enquiry
- `custom.html` — custom artwork enquiry + reference image
- `about.html` — about
- `contact.html` — contact
- `admin.html` — private admin dashboard
- `styles.css` — responsive design system
- `script.js` — public-site data loading/forms
- `config.js` — public API configuration
- `Code.gs` — Apps Script backend
- `SETUP.md` — exact setup/deployment guide

## Security model

The public API exposes only active artworks. It never exposes enquiries.

The admin dashboard uses Google Identity Services. The browser sends a Google ID token to Apps Script; Apps Script verifies the token with Google, checks its audience against the OAuth client ID stored in Script Properties, and only permits the exact admin email `lunaquilling@gmail.com`.

The Google Sheet, Apps Script project, Forms and customer-reference Drive folder should remain private.

Artwork images are intentionally link-viewable because a public static site must be able to fetch them. Customer reference images remain private.

## Quick start

1. Create/open your Google account.
2. Create a Google Cloud OAuth Web application client ID for the GitHub Pages origin.
3. Create/open the Google Sheet or let `setupLunaQuilling()` create it.
4. Put `Code.gs` into Apps Script.
5. Run `setupLunaQuilling()` and authorize it.
6. Run `setGoogleClientId('YOUR_CLIENT_ID')` once.
7. Deploy Apps Script as Web App, execute as you, access anyone.
8. Copy the `/exec` URL into `config.js`.
9. Put the same OAuth client ID into `config.js`.
10. Push this folder to GitHub and enable GitHub Pages.
11. Open `admin.html` on the GitHub Pages site and sign in with `lunaquilling@gmail.com`.

See `SETUP.md` for detailed steps.
