import { useEffect, useRef, useState } from 'react';
import ProductViewer from './ProductViewer.jsx';
import { FIT_NOTES, MEASURE_LABELS, SIZES } from '../data/products.js';

export default function ProductDetail({ product, colorIndex, onColor, onClose, onAdd }) {
  const [size, setSize] = useState('M');
  const [compare, setCompare] = useState(false);
  const closeRef = useRef();
  const color = product.colors[colorIndex];
  const keys = Object.keys(product.measurements.M);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className="detail__backdrop" onClick={onClose} />
      <div className="detail__sheet">
        <div className="detail__stage">
          <ProductViewer product={product} color={color.hex} size={size} compare={compare} onPickSize={setSize} />
          <div className="stage-toolbar">
            <div className="seg" role="group" aria-label="View">
              <button type="button" className={!compare ? 'is-on' : ''} onClick={() => setCompare(false)}>
                On body
              </button>
              <button type="button" className={compare ? 'is-on' : ''} onClick={() => setCompare(true)}>
                Compare S · M · L
              </button>
            </div>
            <span className="stage-hint">Drag to turn · Scroll to zoom</span>
          </div>
        </div>

        <aside className="detail__info">
          <button ref={closeRef} type="button" className="icon-btn detail__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <p className="eyebrow">{product.category}</p>
          <h2 id="detail-title" className="detail__title">{product.name}</h2>
          <p className="detail__price">${product.price}</p>
          <p className="detail__desc">{product.description}</p>

          <section className="opt">
            <div className="opt__head">
              <span>Colour</span>
              <span className="opt__value">{color.name}</span>
            </div>
            <div className="swatches" role="radiogroup" aria-label="Colour">
              {product.colors.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={i === colorIndex}
                  aria-label={c.name}
                  title={c.name}
                  className={`swatch${i === colorIndex ? ' is-on' : ''}`}
                  style={{ '--swatch': c.hex }}
                  onClick={() => onColor(i)}
                />
              ))}
            </div>
          </section>

          <section className="opt">
            <div className="opt__head">
              <span>Size</span>
              <span className="opt__value">{size}</span>
            </div>
            <div className="sizes" role="radiogroup" aria-label="Size">
              {SIZES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={s === size} className={`size${s === size ? ' is-on' : ''}`} onClick={() => setSize(s)}>
                  {s}
                </button>
              ))}
            </div>
            <p className="fit-note">{FIT_NOTES[size]}</p>
          </section>

          <table className="measure">
            <caption>Garment measurements (cm)</caption>
            <thead>
              <tr>
                <th scope="col" />
                {SIZES.map((s) => (
                  <th key={s} scope="col" className={s === size ? 'is-on' : ''}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <th scope="row">{MEASURE_LABELS[k]}</th>
                  {SIZES.map((s) => (
                    <td key={s} className={s === size ? 'is-on' : ''}>
                      {product.measurements[s][k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" className="cta" onClick={() => onAdd({ product, size, color })}>
            Add to bag · ${product.price}
          </button>

          <dl className="facts">
            <div>
              <dt>Fabric</dt>
              <dd>{product.fabric}</dd>
            </div>
            <div>
              <dt>Care</dt>
              <dd>{product.care}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
