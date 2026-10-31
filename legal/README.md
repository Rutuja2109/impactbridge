# GoodNeighbour legal pages

Three static pages for the Play Store listing: `privacy.html`, `delete-account.html` and `index.html`.

## Publish them free on GitHub Pages
1. On github.com create a **new public repository**, for example `goodneighbour-legal` (leave it empty).
2. Upload these three `.html` files to it (Add file > Upload files > Commit).
3. Repository **Settings > Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
4. Wait a minute. Your addresses are:
   - `https://<your-github-name>.github.io/goodneighbour-legal/privacy.html`
   - `https://<your-github-name>.github.io/goodneighbour-legal/delete-account.html`
5. Open both addresses in a browser to check they load.

## Where the addresses go
- Play Console > App content > **Privacy policy**: the privacy address.
- Play Console > App content > **Data safety** > account deletion: the delete-account address.
- GitHub repository secret `EXPO_PUBLIC_PRIVACY_URL` for the app: the privacy address (the app's drawer then links to it).

Before publishing, read both pages once and change anything that is not true for you (for example the 30-day promise on the delete page).
