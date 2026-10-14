import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import ClosetScene from './components/ClosetScene.jsx';
import ProductDetail from './components/ProductDetail.jsx';
import { CATEGORIES, products as ALL } from './data/products.js';

export default function App() {
  const [category, setCategory] = useState('All');
  const [colorChoice, setColorChoice] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [hovered, setHovered] = useState(-1);
  const [bag, setBag] = useState([]);
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const controlRef = useRef(null);

  const products = useMemo(() => (category === 'All' ? ALL : ALL.filter((p) => p.category === category)), [category]);
  const selected = ALL.find((p) => p.id === selectedId);

  const colorIndex = (p) => colorChoice[p.id] ?? 0;
  const colorFor = useCallback((p) => p.colors[colorChoice[p.id] ?? 0], [colorChoice]);
  const onSelect = useCallback((i) => setSelectedId(products[i]?.id ?? null), [products]);

  useEffect(() => {
    const onKey = (e) => {
      if (selectedId) {
        if (e.key === 'Escape') setSelectedId(null);
        return;
      }
      if (e.key === 'ArrowRight') controlRef.current?.step(1);
      else if (e.key === 'ArrowLeft') controlRef.current?.step(-1);
      // Enter on a focused button should still press that button.
      else if (e.key === 'Enter' && !e.target.closest?.('button, input, a')) controlRef.current?.select();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const addToBag = ({ product, size, color }) => {
    setBag((b) => [...b, { id: product.id, size, color: color.name }]);
    setToast(`${product.name} · ${color.name} · ${size} added to your bag`);
  };

  const current = hovered >= 0 ? products[hovered] : null;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Closet No. 9 home">
          Closet <span>Nº</span> 9
        </a>
        <nav className="filters" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={c === category ? 'is-on' : ''} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </nav>
        <button type="button" className="bag-btn">
          Bag <span className="bag-count">{bag.length}</span>
        </button>
      </header>

      <main className="stage" aria-label="Interactive closet">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 0.05, 4.6], fov: 36 }}
          frameloop={selected ? 'never' : 'always'}
          onCreated={() => setTimeout(() => setReady(true), 250)}
        >
          <Suspense fallback={null}>
            <ClosetScene
              key={category}
              products={products}
              colorFor={colorFor}
              onSelect={onSelect}
              onHover={setHovered}
              controlRef={controlRef}
            />
          </Suspense>
        </Canvas>

        <div className={`loader${ready ? ' is-done' : ''}`} aria-hidden={ready}>
          <span>Opening the closet…</span>
        </div>

        <p className="hint">
          <span className="hint__dot" /> Drag hangers to shove through the rail · Click a piece to try it on
        </p>

        <div className="footer-bar">
          <div className="intro">
            <p className="eyebrow">Autumn / Winter 26</p>
            <h1>Step into the closet.</h1>
          </div>
          <div className="rail-nav">
            <p className="rail-nav__now" aria-live="polite">
              {current ? (
                <>
                  <span>{current.name}</span> — ${current.price}
                </>
              ) : (
                `${products.length} pieces on the rail`
              )}
            </p>
            <div className="rail-nav__btns">
              <button type="button" className="icon-btn" aria-label="Previous piece" onClick={() => controlRef.current?.step(-1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="pill" onClick={() => controlRef.current?.select()}>
                View piece
              </button>
              <button type="button" className="icon-btn" aria-label="Next piece" onClick={() => controlRef.current?.step(1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {selected && (
        <ProductDetail
          key={selected.id}
          product={selected}
          colorIndex={colorIndex(selected)}
          onColor={(i) => setColorChoice((c) => ({ ...c, [selected.id]: i }))}
          onClose={() => setSelectedId(null)}
          onAdd={addToBag}
        />
      )}

      <div className={`toast${toast ? ' is-on' : ''}`} role="status">
        {toast}
      </div>
    </div>
  );
}
