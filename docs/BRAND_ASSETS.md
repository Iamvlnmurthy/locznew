# LocZ brand assets

The LocZ visual family uses a deep-green location pin, a white negative-space `Z`,
coral and turmeric accents, warm cream surfaces, and tactile paper-cut illustration.

## Production files

| Asset               | Path                                                           | Use                                |
| ------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Master logo         | `apps/web/public/brand/locz-logo.png`                          | High-resolution transparent lockup |
| Web logo            | `apps/web/public/brand/locz-logo.webp`                         | Header and web UI                  |
| Standalone mark     | `apps/web/public/brand/locz-mark.png`                          | Compact headers and brand moments  |
| App icon master     | `apps/web/public/brand/app-icon-1024.png`                      | Store and platform icon source     |
| Flutter app icon    | `apps/mobile/assets/brand/app-icon-1024.png`                   | Android/iOS generation source      |
| Flutter mark        | `apps/mobile/assets/brand/locz-mark.png`                       | In-app branding                    |
| Favicon             | `apps/web/public/favicon.ico`                                  | Browser favicon, 16–64 px          |
| Apple touch icon    | `apps/web/public/brand/apple-touch-icon.png`                   | iOS home screen                    |
| PWA icons           | `apps/web/public/brand/icon-192.png`, `icon-512.png`           | Installable web app                |
| Social preview      | `apps/web/public/brand/og-locz.jpg`                            | Open Graph and X/Twitter           |
| Hero artwork        | `apps/web/public/illustrations/hero-neighbourhood.webp`        | Desktop homepage                   |
| Mobile hero         | `apps/web/public/illustrations/hero-neighbourhood-mobile.webp` | Responsive source                  |
| Empty-state artwork | `apps/web/public/illustrations/empty-neighbourhood.webp`       | Empty results and 404              |
| Category family     | `apps/web/public/icons/categories/*.webp`                      | Twelve marketplace categories      |

## Generation prompt set

All generated sources used the image-generation tool and these core briefs:

1. **Logo:** Minimal vector-style map pin with a negative-space `Z`, paired with the
   exact `LocZ` wordmark; deep green, coral and turmeric; strong at favicon size.
2. **Hero:** Wide paper-cut neighbourhood discovery scene with local products,
   storefront, job, rental, bicycle and location paths; clear left-side copy space.
3. **App icon:** Single green pin containing a bold white `Z`, safely padded for iOS,
   Android adaptive masks and small favicon rendering.
4. **Category family:** Twelve consistent paper-cut marketplace pictograms arranged on
   a precise grid and exported individually with transparent backgrounds.
5. **Empty state:** Folded neighbourhood map, heart pin, storefront and parcel; hopeful,
   text-free and reusable.

Generated alpha assets were locally matted, despilled, cropped and resized. Social-card
copy was composed locally after generation to guarantee exact spelling and typography.
