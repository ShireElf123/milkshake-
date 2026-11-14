/* Whirl Shakes — content & catalogue.
 *
 * Everything a non-developer is likely to change lives in this file:
 * brand name, flavours, hero slides, products, prices and shop rules.
 * Prices and copy are placeholders.
 */
window.WHIRL = {
  brand: 'Whirl',

  shop: {
    currency: 'R',            // South African rand
    locale: 'en-ZA',
    freeShippingFrom: 400,
    shippingFee: 79,
    discountCode: 'PK10',     // 10% off
    discountRate: 0.10,
    subscribeRate: 0.10,      // "subscribe & save"
    packs: [                  // label, number of shakes, multi-buy discount
      { label: '1 shake', size: 1, off: 0 },
      { label: '4-pack',  size: 4, off: 0.07 },
      { label: '8-pack',  size: 8, off: 0.12 }
    ]
  },

  /* One entry per flavour. Images are looked up by key:
   *   assets/img/shakes/<key>.webp   and   assets/img/scenes/<key>.webp
   * (both are produced by tools/build_assets.py).
   *   ink  = headline tint on the hero      deep = dark shade of the flavour
   *   tile = card background in the shop    soft = light section tint          */
  flavours: {
    grape:      { label: 'Grape',      ink: '#fbd9ff', deep: '#35123f', tile: '#9a5cc4', soft: '#f3e3ff' },
    orange:     { label: 'Orange',     ink: '#fff6d6', deep: '#7a3303', tile: '#f59a2f', soft: '#ffecd2' },
    kiwi:       { label: 'Kiwi',       ink: '#f0ffd2', deep: '#2d400d', tile: '#7fae3e', soft: '#eaf5d3' },
    strawberry: { label: 'Strawberry', ink: '#fff0ea', deep: '#74202c', tile: '#e0687a', soft: '#ffe3e6' },
    chocolate:  { label: 'Chocolate',  ink: '#fff1de', deep: '#1f0e08', tile: '#7a4a36', soft: '#f1e2d6' }
  },

  /* Hero carousel. `fruit` rows are [image, x%, y%, size(vw), rotation(deg), depth, blur(px), flip?]
   * — depth drives the mouse parallax (bigger = closer to the camera); pieces with a depth
   *   of 1 or more float in front of the glass, the rest behind it.
   * `tagsSide` is the side of the headline the three tags are tucked into.                    */
  slides: [
    {
      word: 'Grapeline', product: 'gr', flavour: 'grape',
      tags: ['Bold', 'Juicy', 'Vibrant'], tagsSide: 'left',
      text: 'Juicy grapes swirled into a silky, thick shake.',
      badge: { label: 'Real fruit', value: '100%' },
      fruit: [
        ['grape-bunch', 86, 25, 11, 16, 0.7, 0],
        ['grape', 41.5, 47, 6, -22, 1.0, 0],
        ['grape', 64, 64, 4.6, 28, 0.8, 0],
        ['grape-bunch', 12, 61, 9, -12, 1.1, 0],
        ['grape-bunch', 95, 74, 17, 24, 1.6, 3],
        ['grape', 68, 13, 3.2, 40, 0.3, 2]
      ]
    },
    {
      word: 'Orangeous', product: 'or', flavour: 'orange',
      tags: ['Citrus', 'Bright', 'Energizing'], tagsSide: 'left',
      text: 'A creamy shake with a bright orange twist.',
      badge: { label: 'Real fruit', value: '100%' },
      fruit: [
        ['orange-half', 86, 25, 11, 12, 0.7, 0],
        ['orange-wedge', 41, 47, 7.4, -24, 1.0, 0],
        ['orange-half', 64.5, 64, 5.4, -30, 0.8, 0],
        ['orange-wedge', 12, 61, 9.5, 150, 1.1, 0],
        ['orange-wedge', 95, 75, 17, 30, 1.6, 3],
        ['orange-wedge', 68, 13, 3.6, 70, 0.3, 2]
      ]
    },
    {
      word: 'Kiwiful', product: 'ki', flavour: 'kiwi',
      tags: ['Exotic', 'Tangy', 'Smooth'], tagsSide: 'right',
      text: 'Smooth, refreshing and just a little tangy.',
      badge: { label: 'Real fruit', value: '100%' },
      fruit: [
        ['kiwi', 13, 25, 11, -18, 0.7, 0, true],
        ['kiwi-slice', 58.5, 47, 6.6, 14, 1.0, 0],
        ['kiwi', 35.5, 64, 5.2, 40, 0.8, 0, true],
        ['kiwi-slice', 85, 61, 8.5, -20, 1.1, 0],
        ['kiwi', 3, 58, 16, 30, 1.6, 3, true],
        ['kiwi-slice', 32, 13, 3.6, 30, 0.3, 2]
      ]
    },
    {
      word: 'Berrylove', product: 'st', flavour: 'strawberry',
      tags: ['Fresh', 'Sweet', 'Irresistible'], tagsSide: 'right',
      text: 'Fresh strawberries blended into a creamy shake.',
      badge: { label: 'Real fruit', value: '100%' },
      fruit: [
        ['strawberry', 13, 25, 10, -22, 0.7, 0],
        ['strawberry-half', 58.5, 47, 6.4, 18, 1.0, 0],
        ['strawberry', 35.5, 64, 5, -35, 0.8, 0],
        ['strawberry-half', 85, 61, 8.5, 24, 1.1, 0],
        ['strawberry', 3, 58, 15, 35, 1.6, 3],
        ['strawberry', 32, 13, 3.4, 60, 0.3, 2]
      ]
    },
    {
      word: 'Cocoloco', product: 'ch', flavour: 'chocolate',
      tags: ['Rich', 'Creamy', 'Indulgent'], tagsSide: 'left',
      text: 'Deep chocolate in a rich, creamy blend.',
      badge: { label: 'Natural cocoa', value: '70%' },
      fruit: [
        ['chocolate-chunk', 86, 25, 12, 10, 0.7, 0],
        ['chocolate-square', 41.5, 47, 6, -18, 1.0, 0],
        ['chocolate-square', 64, 64, 4.6, 30, 0.8, 0],
        ['chocolate-block', 12, 61, 10, 14, 1.1, 0],
        ['chocolate-block', 95, 75, 18, -12, 1.6, 3],
        ['chocolate-chunk', 68, 13, 3.8, 150, 0.3, 2]
      ]
    }
  ],

  /* Catalogue. cat: Singles | Bundles | Subscriptions. `was` = crossed-out price. */
  products: [
    { id: 'gr',  flavour: 'grape',      name: 'Grape Swirl',         sub: '300ml shake · real grape',       price: 59,  cat: 'Singles', badge: 'Best seller', rating: 4.9 },
    { id: 'or',  flavour: 'orange',     name: 'Citrus Sun',          sub: '300ml shake · real orange',      price: 59,  cat: 'Singles', rating: 4.8 },
    { id: 'ki',  flavour: 'kiwi',       name: 'Kiwi Chill',          sub: '300ml shake · real kiwi',        price: 59,  cat: 'Singles', badge: 'New', rating: 4.8 },
    { id: 'st',  flavour: 'strawberry', name: 'Strawberry Dream',    sub: '300ml shake · real strawberry',  price: 62,  cat: 'Singles', rating: 4.9 },
    { id: 'ch',  flavour: 'chocolate',  name: 'Cocoa Storm',         sub: '300ml shake · real cocoa',       price: 65,  cat: 'Singles', rating: 5.0 },
    { id: 't5',  flavour: 'strawberry', name: 'Taster Box',          sub: '5 shakes · one of each flavour', price: 279, was: 305, cat: 'Bundles', tile: '#c25b8a', badge: 'Save 9%', rating: 4.9 },
    { id: 'p10', flavour: 'grape',      name: 'Party Box',           sub: '10 shakes · mix any flavours',   price: 520, was: 610, cat: 'Bundles', tile: '#7b3fa0', badge: 'Save 15%', rating: 5.0 },
    { id: 'sb',  flavour: 'chocolate',  name: 'Weekly Subscription', sub: 'Delivered weekly · save 10%',    price: 53,  was: 59,  cat: 'Subscriptions', tile: '#5a3425', rating: 4.9 }
  ],

  nutrition: { kcal: 320, ml: 300 }
};
