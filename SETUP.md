# Luna Quilling — Exact Setup Guide

This guide assumes you are the owner of the Google account `lunaquilling@gmail.com` and GitHub account. Do not share your Google password or private credentials.

## A. Prepare the project

1. Download the project ZIP.
2. Extract it.
3. Do not rename the files.

## B. Create Google Drive folders

Create two private folders:

- `Luna Quilling - Artwork Images`
- `Luna Quilling - Customer References`

Do not share the Customer References folder.

## C. Create the Google Sheet

You can create a blank Google Sheet called:

`Luna Quilling - Enquiries`

or allow the Apps Script setup function to create it automatically.

The script creates/maintains these tabs:

### Artworks

`Work ID | Title | Category | Description | Starting Price | Image URL | Featured | Status | Sort Order | Created Date | Updated Date`

### Enquiries

`Enquiry ID | Date/time | Customer name | Phone | Email | Source | Enquiry type | Artwork | Size | Budget | Requirements | Reference image | Status | Notes`

### Artwork Form Responses

Created automatically when the artwork form is linked to the spreadsheet.

## D. Google Apps Script

1. Open the Google Sheet.
2. Extensions → Apps Script.
3. Replace the default script with `Code.gs`.
4. Save.
5. Run `setupLunaQuilling()`.
6. Approve Google's authorization prompts.

The setup function creates the missing sheets, Drive folders and artwork manager Form when possible. It also creates the Form submit trigger.

## E. Google OAuth client for the admin dashboard

The dashboard is intentionally not protected by a password stored in GitHub.

Create a Google Cloud OAuth 2.0 Client ID of type **Web application**.

Add the exact GitHub Pages origin under Authorized JavaScript origins. Example:

`https://YOUR-GITHUB-USERNAME.github.io`

If the repository is a project site, the page URL will be:

`https://YOUR-GITHUB-USERNAME.github.io/luna-quilling/`

The origin is still:

`https://YOUR-GITHUB-USERNAME.github.io`

Do not put a client secret in this project. A Web client ID is public; its secret must never be shipped to GitHub Pages.

After obtaining the client ID, run in Apps Script:

```javascript
setGoogleClientId('YOUR_CLIENT_ID.apps.googleusercontent.com')
```

Run it once and authorize if asked.

## F. Deploy Apps Script backend

Apps Script:

1. Deploy → New deployment.
2. Select **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Deploy.
6. Copy the URL ending in `/exec`.

Do not use the `/dev` URL.

## G. Configure the website

Open `config.js`.

Replace:

```javascript
API_URL: "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE"
```

with the `/exec` URL.

Replace:

```javascript
GOOGLE_CLIENT_ID: "PASTE_YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID_HERE"
```

with the Web OAuth client ID.

Do not add a Google client secret.

## H. Test the public API

Open:

`YOUR_EXEC_URL?action=works`

You should receive JSON with an `ok` property and a `works` array.

## I. GitHub Pages

1. Create a GitHub repository, for example `luna-quilling`.
2. Upload all files in this folder.
3. Keep `.nojekyll`.
4. Repository → Settings → Pages.
5. Source: Deploy from a branch.
6. Branch: `main`.
7. Folder: `/ (root)`.
8. Save.

Wait for GitHub Pages to publish.

## J. Admin dashboard

Open:

`https://YOUR-GITHUB-USERNAME.github.io/luna-quilling/admin.html`

Click Google sign-in.

Only `lunaquilling@gmail.com` is accepted by the backend.

The dashboard can:

- add artwork
- edit artwork
- replace artwork image
- change category/title/description/price
- feature/unfeature
- change status
- change sort order
- mark deleted
- search/filter artworks
- view enquiries
- search/filter enquiries
- change enquiry status
- add enquiry notes
- open private reference image links

## K. Artwork Form

`setupLunaQuilling()` attempts to create:

`Luna Quilling - Artwork Manager`

with the required questions.

If your Google Workspace/account does not allow Apps Script to create a File Upload item automatically, create that one question manually in the Form with exact title:

`Artwork image`

The other question titles should remain exact because the trigger maps by title.

## L. Add artwork through Form

Submit:

- Work ID (optional)
- Title
- Category
- Description
- Starting Price
- Artwork image
- Featured
- Status
- Sort Order

The trigger writes/updates the clean `Artworks` sheet.

## M. Add artwork through dashboard

Admin → Artworks → Add Artwork.

Upload an image and save. The backend stores the image in the artwork Drive folder, makes only that artwork image link-viewable, and writes its public thumbnail URL into Sheets.

## N. Customer enquiry test

1. Open a public artwork.
2. Click Enquire.
3. Submit test name + phone.
4. Confirm a new row appears in `Enquiries`.
5. Confirm the admin notification email arrives.
6. If an email was provided, confirm the acknowledgement arrives.

## O. Custom artwork test

1. Open `custom.html`.
2. Fill the form.
3. Upload a JPG/PNG/WebP under 5 MB.
4. Submit.
5. Confirm the enquiry row.
6. Confirm the reference image is in the private Customer References folder.

## P. Hide/delete test

Admin → Edit artwork → Status = Hidden → Save.

Refresh the public catalogue. It must disappear.

Set it back to Active. It must return.

The Delete button marks the record `Deleted` rather than physically deleting the row. This preserves the database audit trail.

## Q. Troubleshooting

### Catalogue says API URL is not configured

Check `config.js` and make sure the `/exec` URL was pasted.

### Dashboard says OAuth client ID is not configured

Check `config.js` and replace the client ID placeholder.

### Dashboard says audience mismatch

The client ID in `config.js` and the client ID stored by `setGoogleClientId()` do not match.

### Dashboard says account is not authorized

Sign in with `lunaquilling@gmail.com`.

### Artwork image is broken

Check that the image was uploaded by the dashboard/Form and that the file has link-viewer access. Replacing the image from the dashboard will create a fresh public artwork image link.

### Enquiry submission fails

Check the Apps Script execution log and confirm the Web App deployment is the latest deployment.

## R. Mobile operation

For day-to-day business management, save the GitHub Pages `admin.html` URL to your phone home screen. Use the dashboard for artwork and enquiry management; use the Google Sheets app when you want direct spreadsheet-level access.
