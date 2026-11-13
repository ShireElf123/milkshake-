# Whirl Shakes

A three-page milkshake storefront: an animated landing page, a shop and a product page, with a cart drawer. It is a static site with no build step and no external requests: fonts, scripts and images are all in this repository.

> "Whirl", the product names, prices, copy, nutrition values and contact details are **placeholders**. Checkout is a demo message; no payment provider is connected. See [Before you launch](#before-you-launch).

## Run it

Any static file server works. From the repository root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Opening `index.html` straight from disk also works; the browser console then reports two blocked font preloads, which can be ignored (the fonts still load).

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
tools/                  optional Python scripts that produce the images (not needed to run the site)
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

1. In `tools/build_assets.py`, add a line to `FLAVOURS` with the backdrop and drink colours, then run the script (see below). It writes `assets/img/shakes/<key>.webp` and `assets/img/scenes/<key>.webp`.
2. Add the fruit cut-outs to `assets/img/fruit/`.
3. In `assets/js/data.js`, add the flavour to `flavours`, a slide to `slides` and a product to `products`.
4. In `index.html`, add a badge icon to the sprite: `<symbol id="i-<key>" …>`.

## Rebuild the images

Only needed if you change colours or add artwork.

```bash
pip install pillow numpy scipy

# recolour the two master images into every flavour, and rebuild og.jpg
python3 tools/build_assets.py

# cut a photo on a flat blue or green backdrop into a transparent, trimmed picture
python3 tools/cutout.py mango.png assets/img/fruit/mango.webp --key b

# render a chocolate piece: columns, rows, three rotation angles, size
python3 tools/render_choc.py chunk.png 2 1 62 25 -18 1000
python3 tools/cutout.py chunk.png assets/img/fruit/chocolate-chunk.webp --gamma 1.32 --contrast 1.12
```

All five glasses come from one master (`tools/masters/glass.webp`) and all five backdrops from another (`tools/masters/scene.webp`); the script shifts their colour. To give a flavour its own photograph, replace its file in `assets/img/shakes/` or `assets/img/scenes/` and remove it from `FLAVOURS`, so the script does not overwrite it.

## Before you launch

- Replace the placeholder brand, product names, prices, descriptions, ratings and review counts.
- Replace the nutrition, ingredients and allergen text on the product page with real information.
- Replace `hello@example.com` and the opening hours in the footer.
- Connect a real checkout. The Checkout button only shows a message (`checkout` in `assets/js/app.js`).
- Prices and discounts are worked out in the browser; a real shop must work them out again on the server.
- Set `og:image` in `index.html` to a full address (`https://your-domain/assets/img/og.jpg`); link previews do not follow relative paths.
- Consider replacing the generated artwork with photographs of the real product.

## Credits and licences

- **Images.** The glass, the backdrop and the fruit were made with an AI image generator and then cut out and recoloured with the scripts in `tools/`. The chocolate pieces are rendered by `tools/render_choc.py`. None of them shows a real product.
- **Fonts.** [Suez One](https://fonts.google.com/specimen/Suez+One) and [Outfit](https://fonts.google.com/specimen/Outfit), both under the SIL Open Font License 1.1, taken from the Fontsource packages (version 5.3.0). The licence texts are in `assets/fonts/`.
- **GSAP 3.15.1.** Subject to GreenSock's [standard "no charge" licence](https://gsap.com/standard-license). Read it before commercial use.
- **Matter.js 0.20.0.** MIT licence; the text is in `assets/vendor/`.

No licence has been chosen for the site's own code and content yet.
