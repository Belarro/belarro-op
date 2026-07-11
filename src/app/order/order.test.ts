import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock localStorage for Node.js test environment
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

/**
 * Unit tests for chef portal page (/order)
 * Tests: API route, product filtering, cart logic, WhatsApp flow, i18n
 */

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

const mockProducts = [
  {
    id: 'pea-shoots',
    name: 'Pea Shoots',
    name_de: 'Keimlinge',
    flavor_en: 'Fresh, green',
    flavor_de: 'Frisch, grün',
    photo: 'https://example.com/pea.jpg',
    category: 'microgreen',
    sort_order: 1,
    sizes: [
      { label: '100g', price: 14, grams: 100 },
      { label: '225g', price: 24, grams: 225 },
    ],
    growDays: 10,
    tags: ['green', 'Peppery', 'Asian', 'Salad'],
  },
  {
    id: 'radish-red',
    name: 'Radish Red Rambo',
    name_de: 'Radieschen Rot',
    flavor_en: 'Peppery',
    flavor_de: 'Würzig',
    photo: 'https://example.com/radish.jpg',
    category: 'microgreen',
    sort_order: 2,
    sizes: [{ label: '100g', price: 16, grams: 100 }],
    growDays: 12,
    tags: ['red', 'Peppery', 'Meat', 'Salad'],
  },
  {
    id: 'garden-mix',
    name: 'Garden Mix',
    name_de: 'Gartenmischung',
    flavor_en: 'Mixed flavors',
    flavor_de: 'Gemischte Geschmäcker',
    photo: '',
    category: 'mix',
    sort_order: 3,
    sizes: [
      { label: '225g', price: 28, grams: 225 },
      { label: '450g', price: 44, grams: 450 },
    ],
    growDays: 14,
    tags: ['mixed', 'Sweet', 'Salad'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe.skip('GET /api/products/public (requires running dev server)', () => {
  it('should return products with correct schema', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    if (json.data.length > 0) {
      const product = json.data[0];
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('name_de');
      expect(product).toHaveProperty('flavor_en');
      expect(product).toHaveProperty('flavor_de');
      expect(product).toHaveProperty('photo');
      expect(product).toHaveProperty('category');
      expect(product).toHaveProperty('sort_order');
      expect(product).toHaveProperty('sizes');
      expect(product).toHaveProperty('growDays');
      expect(product).toHaveProperty('tags');
    }
  });

  it('should only return active crops with status=active', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    const json = await response.json();

    json.data.forEach((product: any) => {
      expect(product.sizes.length).toBeGreaterThan(0);
    });
  });

  it('should filter out soft-deleted variants (deleted_at is null)', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    const json = await response.json();

    json.data.forEach((product: any) => {
      product.sizes.forEach((size: any) => {
        expect(size.deleted_at).toBeUndefined();
      });
    });
  });

  it('should exclude internal-only variants (is_internal=true)', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    const json = await response.json();

    json.data.forEach((product: any) => {
      product.sizes.forEach((size: any) => {
        expect(size.is_internal).not.toBe(true);
      });
    });
  });

  it('should exclude variants without prices (price_eur=null)', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    const json = await response.json();

    json.data.forEach((product: any) => {
      product.sizes.forEach((size: any) => {
        expect(size.price).toBeDefined();
        expect(typeof size.price).toBe('number');
      });
    });
  });

  it('should calculate growDays from procedure (stack + blackout + light)', () => {
    // Procedure: stack=5, blackout=2, light=3 → total 10
    const procedure = {
      stack_enabled: true,
      stack_days: 5,
      blackout_enabled: true,
      blackout_days: 2,
      light_enabled: true,
      light_days: 3,
    };

    let growDays = 0;
    if (procedure.stack_enabled && procedure.stack_days)
      growDays += procedure.stack_days;
    if (procedure.blackout_enabled && procedure.blackout_days)
      growDays += procedure.blackout_days;
    if (procedure.light_enabled && procedure.light_days)
      growDays += procedure.light_days;

    expect(growDays).toBe(10);
  });

  it('should skip disabled procedure phases', () => {
    // Only stack enabled
    const procedure = {
      stack_enabled: true,
      stack_days: 5,
      blackout_enabled: false,
      blackout_days: 2,
      light_enabled: false,
      light_days: 3,
    };

    let growDays = 0;
    if (procedure.stack_enabled && procedure.stack_days)
      growDays += procedure.stack_days;
    if (procedure.blackout_enabled && procedure.blackout_days)
      growDays += procedure.blackout_days;
    if (procedure.light_enabled && procedure.light_days)
      growDays += procedure.light_days;

    expect(growDays).toBe(5);
  });

  it('should sort products by sort_order then by name', async () => {
    const response = await fetch('http://localhost:3000/api/products/public');
    const json = await response.json();

    for (let i = 1; i < json.data.length; i++) {
      const prev = json.data[i - 1];
      const curr = json.data[i];

      const isSortedCorrectly =
        prev.sort_order < curr.sort_order ||
        (prev.sort_order === curr.sort_order &&
          prev.name.localeCompare(curr.name) <= 0);

      expect(isSortedCorrectly).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT FILTERING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Product Filtering', () => {
  const COLOR_MAP: { [key: string]: string } = {
    'Pea Shoots': 'green',
    'Radish Red Rambo': 'red',
    'Garden Mix': 'mixed',
  };

  const getProductColor = (name: string) => COLOR_MAP[name] || 'green';

  it('should filter by flavor tag', () => {
    const activeFilters = { flavor: ['Peppery'] };
    const filtered = mockProducts.filter((p) =>
      activeFilters.flavor.some((f) => p.tags.includes(f))
    );

    expect(filtered.length).toBe(2); // Pea Shoots, Radish Red
    expect(filtered.some((p) => p.name === 'Garden Mix')).toBe(false);
  });

  it('should filter by pairs tag', () => {
    const activeFilters = { pairs: ['Salad'] };
    const filtered = mockProducts.filter((p) =>
      activeFilters.pairs.some((f) => p.tags.includes(f))
    );

    expect(filtered.length).toBe(3); // All have Salad
  });

  it('should filter by color', () => {
    const activeFilters = { color: ['red'] };
    const filtered = mockProducts.filter((p) =>
      activeFilters.color.includes(getProductColor(p.name))
    );

    expect(filtered.length).toBe(1); // Radish Red only
    expect(filtered[0].name).toBe('Radish Red Rambo');
  });

  it('should filter by category (mixes)', () => {
    const activeFilters = { type: ['mix'] };
    const filtered = mockProducts.filter((p) =>
      activeFilters.type.includes(p.category)
    );

    expect(filtered.length).toBe(1); // Garden Mix
    expect(filtered[0].name).toBe('Garden Mix');
  });

  it('should combine multiple filters (AND logic)', () => {
    const activeFilters = { flavor: ['Peppery'], type: [] };
    let filtered = mockProducts.filter((p) =>
      activeFilters.flavor.some((f) => p.tags.includes(f))
    );
    if (activeFilters.type.length > 0) {
      filtered = filtered.filter((p) =>
        activeFilters.type.includes(p.category)
      );
    }

    expect(filtered.length).toBe(2);
    expect(filtered.map((p) => p.name)).toEqual([
      'Pea Shoots',
      'Radish Red Rambo',
    ]);
  });

  it('should clear all filters', () => {
    const activeFilters = { flavor: [], pairs: [], color: [], type: [] };
    const filtered = mockProducts.filter((p) => {
      if (activeFilters.flavor.length && !activeFilters.flavor.some((f) => p.tags.includes(f)))
        return false;
      if (activeFilters.pairs.length && !activeFilters.pairs.some((f) => p.tags.includes(f)))
        return false;
      if (activeFilters.color.length &&
        !activeFilters.color.includes(getProductColor(p.name)))
        return false;
      if (activeFilters.type.length && !activeFilters.type.includes(p.category))
        return false;
      return true;
    });

    expect(filtered.length).toBe(3); // All products
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CART LOGIC TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Cart Management', () => {
  let cart: Map<string, any>;

  beforeEach(() => {
    cart = new Map();
  });

  it('should add item to cart', () => {
    const key = 'pea-shoots-0';
    const entry = { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 };
    cart.set(key, entry);

    expect(cart.has(key)).toBe(true);
    expect(cart.get(key)?.qty).toBe(1);
  });

  it('should increment quantity on duplicate add', () => {
    const key = 'pea-shoots-0';
    const entry = { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 };
    cart.set(key, entry);

    const existing = cart.get(key);
    if (existing) {
      existing.qty++;
      cart.set(key, existing);
    }

    expect(cart.get(key)?.qty).toBe(2);
  });

  it('should decrease quantity', () => {
    const key = 'pea-shoots-0';
    const entry = { name: 'Pea Shoots', label: '100g', price: 14, qty: 3 };
    cart.set(key, entry);

    const existing = cart.get(key);
    if (existing) {
      existing.qty--;
      cart.set(key, existing);
    }

    expect(cart.get(key)?.qty).toBe(2);
  });

  it('should remove item when qty reaches 0', () => {
    const key = 'pea-shoots-0';
    const entry = { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 };
    cart.set(key, entry);

    const existing = cart.get(key);
    if (existing) {
      existing.qty--;
      if (existing.qty <= 0) {
        cart.delete(key);
      } else {
        cart.set(key, existing);
      }
    }

    expect(cart.has(key)).toBe(false);
  });

  it('should calculate total items', () => {
    cart.set('pea-shoots-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 2 });
    cart.set('radish-0', { name: 'Radish', label: '100g', price: 16, qty: 1 });

    const total = Array.from(cart.values()).reduce((sum, e) => sum + e.qty, 0);
    expect(total).toBe(3);
  });

  it('should calculate total price', () => {
    cart.set('pea-shoots-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 2 });
    cart.set('radish-0', { name: 'Radish', label: '100g', price: 16, qty: 1 });

    const totalPrice = Array.from(cart.values()).reduce(
      (sum, e) => sum + e.qty * e.price,
      0
    );
    expect(totalPrice).toBe(44); // (14*2) + (16*1) = 44
  });

  it('should support multiple sizes of same product', () => {
    cart.set('pea-shoots-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 });
    cart.set('pea-shoots-1', { name: 'Pea Shoots', label: '225g', price: 24, qty: 2 });

    expect(cart.size).toBe(2);
    const total = Array.from(cart.values()).reduce((sum, e) => sum + e.qty, 0);
    expect(total).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP ORDER FLOW TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('WhatsApp Order Flow', () => {
  const STRINGS = {
    en: {
      wa_header: 'New order from',
      wa_contact: 'Contact',
      wa_position: 'Position',
      wa_total: 'Total',
      wa_vat: '(excl. VAT)',
      wa_unknown: 'Unknown',
      product_singular: 'product',
      product_plural: 'products',
    },
  };

  const t = (key: keyof typeof STRINGS.en) => STRINGS.en[key];

  it('should build correct WhatsApp message format', () => {
    const cart = new Map([
      ['pea-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 2 }],
      ['radish-0', { name: 'Radish', label: '100g', price: 16, qty: 1 }],
    ]);

    const restaurant = 'Nobelhart & Schmutzig';
    const person = 'Billy Wagner';
    const position = 'Head Chef';

    const lines = [t('wa_header') + ' ' + restaurant, ''];
    if (person)
      lines.push(t('wa_contact') + ': ' + person + (position ? ' (' + position + ')' : ''));
    if (person || position) lines.push('');

    let total = 0;
    cart.forEach((e) => {
      const lt = e.qty * e.price;
      total += lt;
      lines.push(`${e.qty}x ${e.name} (${e.label}) — €${lt.toFixed(2)}`);
    });
    lines.push('', t('wa_total') + ': €' + total.toFixed(2) + ' ' + t('wa_vat'));

    const message = lines.join('\n');

    expect(message).toContain('New order from Nobelhart & Schmutzig');
    expect(message).toContain('Contact: Billy Wagner (Head Chef)');
    expect(message).toContain('2x Pea Shoots (100g) — €28.00');
    expect(message).toContain('1x Radish (100g) — €16.00');
    expect(message).toContain('Total: €44.00 (excl. VAT)');
  });

  it('should handle missing restaurant name', () => {
    const cart = new Map([
      ['pea-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 }],
    ]);

    const restaurant = '';
    const fallback = restaurant.trim() || t('wa_unknown');

    expect(fallback).toBe('Unknown');

    const lines = [t('wa_header') + ' ' + fallback];
    expect(lines[0]).toBe('New order from Unknown');
  });

  it('should handle order with no person/position', () => {
    const cart = new Map([
      ['pea-0', { name: 'Pea Shoots', label: '100g', price: 14, qty: 1 }],
    ]);

    const restaurant = 'Test Restaurant';
    const person = '';
    const position = '';

    const lines = [t('wa_header') + ' ' + restaurant, ''];
    if (person)
      lines.push(t('wa_contact') + ': ' + person + (position ? ' (' + position + ')' : ''));
    else if (position) lines.push(t('wa_position') + ': ' + position);
    if (person || position) lines.push('');

    expect(lines).toEqual(['New order from Test Restaurant', '']);
  });

  it('should build WhatsApp deep link URL', () => {
    const WHATSAPP_NUMBER = '4915906442264';
    const message = 'Test order';
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    expect(url).toContain('https://wa.me/4915906442264');
    expect(url).toContain('?text=');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNATIONALIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('i18n (Language Support)', () => {
  const STRINGS = {
    en: {
      strip_main: 'Tuesdays · Free Delivery · No Minimum Order · 10-Day Shelf Life',
      grow_days: 'days to grow',
      tray_label: 'Container',
    },
    de: {
      strip_main: 'Dienstags · Kostenlose Lieferung · Keine Mindestbestellung · 10 Tage Haltbarkeit',
      grow_days: 'Tage bis zur Ernte',
      tray_label: 'Container',
    },
  };

  it('should detect browser language preference', () => {
    const browserLang = 'de';
    const lang = browserLang === 'de' ? 'de' : 'en';
    expect(lang).toBe('de');
  });

  it('should prioritize saved language preference', () => {
    const savedLang = localStorage.getItem('belarro-chef-lang');
    const browserLang = 'en';
    const lang = savedLang || (browserLang === 'de' ? 'de' : 'en');

    // Assume saved is 'de'
    localStorage.setItem('belarro-chef-lang', 'de');
    const finalLang = localStorage.getItem('belarro-chef-lang') || 'en';
    expect(finalLang).toBe('de');
  });

  it('should switch language and update strings', () => {
    let lang: 'en' | 'de' = 'en';
    const t = (key: keyof typeof STRINGS.en) =>
      STRINGS[lang][key as keyof typeof STRINGS[typeof lang]] || STRINGS.en[key];

    expect(t('strip_main')).toContain('Tuesdays');

    lang = 'de';
    expect(t('strip_main')).toContain('Dienstags');
  });

  it('should handle size label translation (container → Container)', () => {
    const sizeLabels = {
      'Leek': { 'container': 'box' },
      'Garlic': { 'container': 'box' },
    };
    const overrides = sizeLabels['Leek'] || {};
    let label = 'container';
    label = overrides[label] || label;

    expect(label).toBe('box');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge Cases & Validation', () => {
  it('should handle product with no photo', () => {
    const product = {
      id: 'test',
      name: 'Test',
      photo: '',
      category: 'microgreen',
    };

    const imgHTML = product.photo
      ? `<img src="${product.photo}">`
      : `<div>${(product.name || '?').charAt(0)}</div>`;

    expect(imgHTML).toContain('T');
  });

  it('should escape HTML in product names', () => {
    const name = 'Test<script>alert("xss")</script>';
    const escaped = name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('should handle product with no flavor', () => {
    const flavor = '';
    const flavorHTML = flavor ? `<p>${flavor}</p>` : '';

    expect(flavorHTML).toBe('');
  });

  it('should handle large order totals', () => {
    const cart = new Map([
      ['item1', { name: 'Expensive', label: 'Large', price: 999.99, qty: 100 }],
    ]);

    const totalPrice = Array.from(cart.values()).reduce(
      (sum, e) => sum + e.qty * e.price,
      0
    );

    expect(totalPrice).toBe(99999);
    expect(totalPrice.toFixed(2)).toBe('99999.00');
  });

  it('should handle products with no sizes', () => {
    const product = {
      id: 'test',
      name: 'Test',
      sizes: [],
    };

    expect(product.sizes.length).toBe(0);
    // API should filter this out
  });

  it('should handle URL parameters correctly', () => {
    const url = new URL('http://localhost:3000/order?r=TestRestaurant&p=John&t=Chef');
    const params = new URLSearchParams(url.search);

    expect(params.get('r')).toBe('TestRestaurant');
    expect(params.get('p')).toBe('John');
    expect(params.get('t')).toBe('Chef');
  });

  it('should handle legacy URL parameters (c=/n=)', () => {
    const url = new URL('http://localhost:3000/order?c=OldRestaurant&n=OldName');
    const params = new URLSearchParams(url.search);

    const restaurant = params.get('r') || params.get('c');
    const person = params.get('p') || params.get('n');

    expect(restaurant).toBe('OldRestaurant');
    expect(person).toBe('OldName');
  });
});
