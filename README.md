# Whirl Shakes

A three-page milkshake storefront: an animated landing page, a shop and a product page, with a cart drawer. It is a static site with no build step and no external requests: fonts, scripts and images are all in this repository.

> Whirl is the brand. The product names, prices, copy, nutrition values and contact details are **placeholders**. Checkout is a demo message; no payment provider is connected. See [Before you launch](#before-you-launch).

## Run it

Any static file server works. From the repository root:

```bash
python3 tools/serve.py        # or: python3 -m http.server 8000
```

Then open <http://localhost:8000/>. `tools/serve.py` never lets the browser cache anything, so a refresh always shows your latest edit. Opening `index.html` straight from disk also works; the browser console then reports two blocked font preloads, which can be ignored (the fonts still load).

To deploy, publish the repository root as it is (GitHub Pages, Vercel, Netlify or any web host). There is nothing to build. All paths are relative, so the site also works from a sub-folder such as `username.github.io/milkshake-/`.

## What is in the site

| Page | Address | What it does |
| --- | --- | --- |
| Home | `#/` | Full-screen hero with five flavours, flavour grid, "why" section, a band of fruit you can grab and throw |
| Shop | `#/shop` | All products with category filter, search and sorting |
| Product | `#/product/<id>` | Pack size, subscribe & save, quantity, add to cart |

The cart is kept in the browser (`localStorage`, key `whirl-cart-v1`), so it survives a reload.

Behaviour worth knowing:

- The hero changes flavour by itself every 6 seconds. It pauses while the pointer is over a control, while the hero is off screen and while the cart is open, and it stops for good once the visitor uses the arrows or the arrow keys.
- With "reduce motion" switched on in the operating system there is no autoplay, parallax, falling fruit or page transition.
- Below 860 px the navigation becomes a menu button; below 760 px the hero is rearranged for phones.
- A picture that fails to load is requested again, twice at most, and hidden if it still fails, so visitors never see a broken-picture icon.

## Files

```
index.html              page shell, icon sprite, all three pages and the cart
assets/
  css/styles.css        all styles, in numbered sections
  js/data.js            content: brand, flavours, hero slides, products, shop rules
  js/app.js             behaviour, in numbered sections
  fonts/                Suez One (headlines) and Outfit (text)
  img/shakes/           one glass per flavour (transparent)
  img/scenes/           one hero backdrop per flavour
  img/fruit/            fruit and chocolate cut-outs
  img/og.jpg            preview image for links shared on social media
  vendor/               GSAP (animation), Matter.js (falling fruit, loaded on demand)
tools/                  optional Python scripts: a preview server and the image pipeline (not needed to run the site)
.vercelignore           keeps tools/ and this file out of a Vercel deployment
```

## Change the content

Almost everything you are likely to edit is in `assets/js/data.js`:

- `brand` is the name shown in the page titles.
- `shop` holds the currency, the free-shipping threshold, the shipping fee, the discount code and the pack sizes.
- `flavours` holds the colours of each flavour.
- `slides` is the hero: the headline word, the three tags and which side they sit on, the short description, the badge text and the floating fruit.
- `products` is the catalogue: `id`, `name`, `price`, optional `was` (crossed-out price), `cat` (`Singles`, `Bundles` or `Subscriptions`), optional `badge`.

The brand name also appears as text in `index.html` (title, description, logo, footer).

### Add a flavour

1. In `tools/build_assets.py`, add a line to `FLAVOURS` with the backdrop and drink colours.
2. Optional: give the flavour its own pictures by adding `tools/masters/glass-<key>.webp` and `tools/masters/scene-<key>.webp`. Without them the script recolours the generic strawberry-pink masters.
3. Run the script (see below). It writes `assets/img/shakes/<key>.webp` and `assets/img/scenes/<key>.webp`.
4. Add the fruit cut-outs to `assets/img/fruit/`.
5. In `assets/js/data.js`, add the flavour to `flavours`, a slide to `slides` and a product to `products`.
6. In `index.html`, add a badge icon to the sprite: `<symbol id="i-<key>" …>`.

## Rebuild the images

Only needed if you change colours or add artwork.

```bash
pip install pillow numpy scipy

# build every glass, backdrop and og.jpg from the masters
python3 tools/build_assets.py

# cut a photo on a flat blue or green backdrop into a transparent, trimmed picture
python3 tools/cutout.py mango.png assets/img/fruit/mango.webp --key b

# cut out a glass as a master (it stays see-through); use the same --crop for every flavour so they line up
python3 tools/cutout.py glass.png tools/masters/glass-mango.webp --key g --glassy --crop 119,73,729,1189 --size 0 --lossless
```

The masters are in `tools/masters/`:

- `glass-<flavour>.webp` is that flavour's shake in its glass. All five show the same glass from the same angle, so the slides line up. They are used as they are.
- `scene-<flavour>.webp` is that flavour's backdrop. The script nudges its overall tone to the flavour's `scene` colour, which keeps the headline readable.
- `glass.webp` and `scene.webp` are generic strawberry-pink masters. Strawberry uses this backdrop, and a new flavour without pictures of its own gets both, recoloured.

## Before you launch

- Check the product names, prices and descriptions, and replace the made-up ratings and review counts.
- Replace the nutrition, ingredients and allergen text on the product page with real information.
- Replace `hello@example.com` and the opening hours in the footer.
- Connect a real checkout. The Checkout button only shows a message (`checkout` in `assets/js/app.js`).
- Prices and discounts are worked out in the browser; a real shop must work them out again on the server.
- Set `og:image` in `index.html` to a full address (`https://your-domain/assets/img/og.jpg`); link previews do not follow relative paths.
- Consider replacing the generated artwork with photographs of the real product.

## Credits and licences

- **Images.** The glasses, the backdrops, the fruit and the chocolate pieces were made with an AI image generator and then cut out and colour-matched with the scripts in `tools/`. None of them shows a real product.
- **Fonts.** [Suez One](https://fonts.google.com/specimen/Suez+One) and [Outfit](https://fonts.google.com/specimen/Outfit), both under the SIL Open Font License 1.1, taken from the Fontsource packages (version 5.3.0). The licence texts are in `assets/fonts/`.
- **GSAP 3.15.1.** Subject to GreenSock's [standard "no charge" licence](https://gsap.com/standard-license). Read it before commercial use.
- **Matter.js 0.20.0.** MIT licence; the text is in `assets/vendor/`.

No licence has been chosen for the site's own code and content yet.
