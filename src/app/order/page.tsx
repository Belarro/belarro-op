'use client';

import React, { useEffect, useState } from 'react';

interface Product {
  id: string;
  name: string;
  name_de: string;
  flavor_en: string;
  flavor_de: string;
  photo: string;
  category: string;
  sort_order: number;
  sizes: Array<{ label: string; price: number; grams?: number }>;
  growDays: number | null;
  tags: string[];
}

interface CartEntry {
  name: string;
  label: string;
  price: number;
  qty: number;
}

const COLOR_MAP: { [key: string]: string } = {
  'Pea Shoots': 'green',
  'Sunflower': 'green',
  'Broccoli': 'green',
  'Pak Choi': 'green',
  'Parsley': 'green',
  'Coriander': 'green',
  'Dill': 'green',
  'Fennel': 'green',
  'Leek': 'green',
  'Radish Daikon': 'green',
  'Nasturtium Alaska': 'green',
  'Mustard White': 'green',
  'Kale': 'green',
  'Rocket / Rucola': 'green',
  'Garlic': 'green',
  'Radish Red Rambo': 'red',
  'Red Beet Bull': 'red',
  'Red Cabbage': 'red',
  'Red Kohlrabi': 'red',
  'Amaranth': 'red',
  'Popcorn / Corn Shoots': 'yellow',
  'Yellow Beet': 'yellow',
  'Radish Mix': 'mixed',
  'Garden Mix': 'mixed',
};

const STRINGS = {
  en: {
    strip_main: 'Tuesdays · Free Delivery · No Minimum Order · 10-Day Shelf Life',
    strip_sub: 'All prices excl. VAT · Same-morning harvest · Soil-grown',
    filter_flavor: 'Flavor',
    filter_pairs: 'Pairs with',
    filter_color: 'Color',
    filter_clear: 'Clear',
    loading: 'Loading products…',
    load_error: 'Could not load products. Please refresh.',
    no_products: 'No products available.',
    order_empty: 'No products selected',
    order_send: 'Send Order',
    product_singular: 'product',
    product_plural: 'products',
    splash_title: 'Welcome, Chef.',
    splash_text: 'Browse our full range with prices. Pick what you need. Order in seconds.',
    splash_btn: 'Show me everything',
    modal_title: 'Confirm Your Details',
    modal_lbl_restaurant: 'Restaurant',
    modal_lbl_person: 'Your name',
    modal_lbl_position: 'Position',
    modal_placeholder: 'e.g. Nobelhart & Schmutzig',
    modal_person_placeholder: 'e.g. Billy Wagner',
    modal_position_placeholder: 'e.g. Head Chef',
    modal_send: 'Send via WhatsApp',
    modal_cancel: 'Cancel',
    wa_header: 'New order from',
    wa_contact: 'Contact',
    wa_position: 'Position',
    wa_total: 'Total',
    wa_vat: '(excl. VAT)',
    wa_unknown: 'Unknown',
    tray_label: 'Container',
    grow_days: 'days to grow',
  },
  de: {
    strip_main: 'Dienstags · Kostenlose Lieferung · Keine Mindestbestellung · 10 Tage Haltbarkeit',
    strip_sub: 'Alle Preise zzgl. MwSt. · Ernte am selben Morgen · Bodengewachsen',
    filter_flavor: 'Geschmack',
    filter_pairs: 'Passt zu',
    filter_color: 'Farbe',
    filter_clear: 'Zurücksetzen',
    loading: 'Produkte laden…',
    load_error: 'Produkte konnten nicht geladen werden. Bitte Seite neu laden.',
    no_products: 'Keine Produkte verfügbar.',
    order_empty: 'Noch keine Produkte ausgewählt',
    order_send: 'Bestellung senden',
    product_singular: 'Produkt',
    product_plural: 'Produkte',
    splash_title: 'Willkommen, Chef.',
    splash_text:
      'Alle Sorten mit Preisen auf einen Blick. Auswählen, bestellen, fertig.',
    splash_btn: 'Zeig mir alles',
    modal_title: 'Bitte Daten bestätigen',
    modal_lbl_restaurant: 'Restaurant',
    modal_lbl_person: 'Ihr Name',
    modal_lbl_position: 'Position',
    modal_placeholder: 'z.B. Nobelhart & Schmutzig',
    modal_person_placeholder: 'z.B. Billy Wagner',
    modal_position_placeholder: 'z.B. Chefkoch',
    modal_send: 'Senden via WhatsApp',
    modal_cancel: 'Abbrechen',
    wa_header: 'Neue Bestellung von',
    wa_contact: 'Kontakt',
    wa_position: 'Position',
    wa_total: 'Gesamt',
    wa_vat: '(zzgl. MwSt.)',
    wa_unknown: 'Unbekannt',
    tray_label: 'Container',
    grow_days: 'Tage bis zur Ernte',
  },
};

const WHATSAPP_NUMBER = '4915906442264';

export default function OrderPage() {
  const [lang, setLang] = useState<'en' | 'de'>('en');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [showSplash, setShowSplash] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    flavor: [] as string[],
    pairs: [] as string[],
    color: [] as string[],
    type: [] as string[],
  });
  const [formData, setFormData] = useState({
    restaurant: '',
    person: '',
    position: '',
  });

  const t = (key: keyof typeof STRINGS.en) =>
    STRINGS[lang][key] || STRINGS.en[key];

  // Load language preference and products
  useEffect(() => {
    const saved = localStorage.getItem('belarro-chef-lang');
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    const detectedLang = saved || (browser === 'de' ? 'de' : 'en');
    setLang(detectedLang as 'en' | 'de');
    document.documentElement.lang = detectedLang;

    const splashDismissed = localStorage.getItem('belarro-chef-splash') === 'dismissed';
    setShowSplash(!splashDismissed);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('r') || urlParams.has('c') || urlParams.has('p') || urlParams.has('n')) {
      setShowSplash(true);
      if (urlParams.get('r') || urlParams.get('c'))
        setFormData(prev => ({ ...prev, restaurant: urlParams.get('r') || urlParams.get('c') || '' }));
      if (urlParams.get('p') || urlParams.get('n'))
        setFormData(prev => ({ ...prev, person: urlParams.get('p') || urlParams.get('n') || '' }));
      if (urlParams.get('t'))
        setFormData(prev => ({ ...prev, position: urlParams.get('t') || '' }));
    }

    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products/public');
      const json = await res.json();
      if (json.success) {
        setProducts(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const changeLang = (newLang: 'en' | 'de') => {
    setLang(newLang);
    localStorage.setItem('belarro-chef-lang', newLang);
    document.documentElement.lang = newLang;
  };

  const getProductColor = (name: string) => COLOR_MAP[name] || 'green';

  const getSizes = (product: Product) => {
    const sizeLabels: { [key: string]: { [key: string]: string } } = {
      Leek: { container: 'box' },
      Garlic: { container: 'box' },
    };
    const overrides = sizeLabels[product.name] || {};
    return (product.sizes || []).map((s) => {
      let label = overrides[s.label] || s.label;
      if (/^(container|tray)$/i.test(label)) label = t('tray_label');
      return { label, price: s.price };
    });
  };

  const toggleCart = (productId: string, sizeIndex: number, displayName: string, sizeLabel: string, price: number) => {
    const key = `${productId}-${sizeIndex}`;
    const newCart = new Map(cart);
    const existing = newCart.get(key);

    if (existing) {
      existing.qty++;
    } else {
      newCart.set(key, { name: displayName, label: sizeLabel, price, qty: 1 });
    }

    setCart(newCart);
  };

  const updateQty = (key: string, delta: number) => {
    const newCart = new Map(cart);
    const entry = newCart.get(key);
    if (!entry) return;

    entry.qty += delta;
    if (entry.qty <= 0) {
      newCart.delete(key);
    } else {
      newCart.set(key, entry);
    }
    setCart(newCart);
  };

  const totalItems = Array.from(cart.values()).reduce((sum, e) => sum + e.qty, 0);
  const totalEur = Array.from(cart.values()).reduce(
    (sum, e) => sum + e.qty * e.price,
    0
  );

  const filteredProducts = products.filter((p) => {
    if (activeFilters.flavor.length && !activeFilters.flavor.some((f) => p.tags.includes(f))) return false;
    if (activeFilters.pairs.length && !activeFilters.pairs.some((f) => p.tags.includes(f))) return false;
    if (activeFilters.color.length && !activeFilters.color.includes(getProductColor(p.name))) return false;
    if (activeFilters.type.length && !activeFilters.type.includes(p.category)) return false;
    return true;
  });

  const sendOrder = () => {
    const restaurant = formData.restaurant.trim() || t('wa_unknown');
    const person = formData.person.trim();
    const position = formData.position.trim();

    const lines = [t('wa_header') + ' ' + restaurant, ''];
    if (person) lines.push(t('wa_contact') + ': ' + person + (position ? ' (' + position + ')' : ''));
    else if (position) lines.push(t('wa_position') + ': ' + position);
    if (person || position) lines.push('');

    let total = 0;
    cart.forEach((e) => {
      const lt = e.qty * e.price;
      total += lt;
      lines.push(`${e.qty}x ${e.name} (${e.label}) — €${lt.toFixed(2)}`);
    });
    lines.push('', t('wa_total') + ': €' + total.toFixed(2) + ' ' + t('wa_vat'));

    setShowModal(false);
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank'
    );
  };

  const dismissSplash = () => {
    setShowSplash(false);
    localStorage.setItem('belarro-chef-splash', 'dismissed');
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-widest">BELARRO</h1>
        <div className="text-xs text-gray-400 space-x-2">
          <button
            onClick={() => changeLang('en')}
            className={lang === 'en' ? 'text-white' : 'hover:text-gray-300'}
          >
            EN
          </button>
          <span className="text-gray-600">·</span>
          <button
            onClick={() => changeLang('de')}
            className={lang === 'de' ? 'text-white' : 'hover:text-gray-300'}
          >
            DE
          </button>
        </div>
      </header>

      {/* Welcome strip */}
      <div className="fixed top-[61px] left-0 right-0 z-30 bg-gray-950 border-b border-white/10 px-8 py-3 text-center">
        <p className="text-xs font-semibold tracking-wider uppercase text-white">{t('strip_main')}</p>
        <p className="text-[11px] font-light tracking-widest uppercase text-gray-500 mt-2">{t('strip_sub')}</p>
      </div>

      {/* Products grid */}
      <div className="pt-40 pb-40 px-8 max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-20">{t('loading')}</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-20">{t('no_products')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((p, idx) => {
              const sizes = getSizes(p);
              const displayName = lang === 'de' ? p.name_de : p.name;
              const flavor = lang === 'de' ? p.flavor_de : p.flavor_en;

              return (
                <div key={p.id} className="border border-white/10 bg-gray-950 overflow-hidden">
                  {/* Image */}
                  <div className="aspect-square bg-gradient-to-br from-gray-900 to-black flex items-center justify-center overflow-hidden">
                    {p.photo ? (
                      <img src={p.photo} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-5xl font-bold text-gray-700">
                        {(displayName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <h3 className="text-base font-semibold text-white mb-1">{displayName}</h3>
                    {flavor && <p className="text-sm text-gray-400 italic mb-3">{flavor}</p>}
                    {p.growDays && (
                      <span className="inline-block text-xs font-medium text-green-500 bg-green-500/10 rounded-full px-3 py-1 mb-4">
                        {p.growDays} {t('grow_days')}
                      </span>
                    )}

                    {/* Sizes */}
                    <div className="space-y-2">
                      {sizes.map((size, sizeIdx) => {
                        const key = `${p.id}-${sizeIdx}`;
                        const cartEntry = cart.get(key);
                        const qty = cartEntry?.qty || 0;

                        return (
                          <div
                            key={key}
                            onClick={() => toggleCart(p.id, sizeIdx, displayName, size.label, size.price)}
                            className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-all ${
                              qty > 0
                                ? 'border-white/25 bg-white/8'
                                : 'border-white/10 bg-white/3 hover:border-white/15 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-white">{size.label}</div>
                              <div className="text-xs text-gray-500">€{size.price}</div>
                            </div>
                            <div className="flex-shrink-0 ml-2">
                              {qty > 0 ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateQty(key, -1);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center bg-white/10 rounded hover:bg-white/20 text-white text-sm"
                                  >
                                    −
                                  </button>
                                  <span className="text-xs font-semibold text-white w-4 text-center">{qty}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateQty(key, 1);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center bg-white/10 rounded hover:bg-white/20 text-white text-sm"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xl text-gray-400">+</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order bar (sticky bottom) */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-gray-950 border-t border-white/10 px-8 py-4 flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wider uppercase">
            <span className="text-white">{totalItems}</span> {totalItems === 1 ? t('product_singular') : t('product_plural')} ·{' '}
            <span className="text-white">€{totalEur.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold tracking-wider rounded transition-colors"
          >
            {t('order_send')}
          </button>
        </div>
      )}

      {/* Splash overlay */}
      {showSplash && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={dismissSplash}
        >
          <div
            className="max-w-sm bg-gray-950 border border-white/10 p-12 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-light mb-4">{t('splash_title')}</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-8">{t('splash_text')}</p>
            <button
              onClick={dismissSplash}
              className="px-6 py-2 border border-white/30 hover:bg-white hover:text-black text-white text-xs font-semibold tracking-wider transition-all"
            >
              {t('splash_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Order modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/88 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="max-w-sm w-full max-h-96 bg-gray-950 border border-white/10 p-8 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xs font-semibold tracking-widest uppercase mb-6">{t('modal_title')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
                  {t('modal_lbl_restaurant')}
                </label>
                <input
                  type="text"
                  placeholder={t('modal_placeholder')}
                  value={formData.restaurant}
                  onChange={(e) => setFormData({ ...formData, restaurant: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-white/10 text-white text-sm focus:border-white/30 outline-none"
                  autoComplete="organization"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
                  {t('modal_lbl_person')}
                </label>
                <input
                  type="text"
                  placeholder={t('modal_person_placeholder')}
                  value={formData.person}
                  onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-white/10 text-white text-sm focus:border-white/30 outline-none"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
                  {t('modal_lbl_position')}
                </label>
                <input
                  type="text"
                  placeholder={t('modal_position_placeholder')}
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-white/10 text-white text-sm focus:border-white/30 outline-none"
                  autoComplete="organization-title"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-center mt-8">
              <button
                onClick={sendOrder}
                className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold tracking-wider rounded transition-colors"
              >
                {t('modal_send')}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-medium tracking-widest uppercase text-gray-400 hover:text-gray-300 transition-colors"
              >
                {t('modal_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
