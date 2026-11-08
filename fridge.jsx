/* global React */
// FRIDGE — the cart, as an open fridge.
// All six flavors stand on glass shelves: stocked ones lit (with the rest of the pack lined up
// behind), empty slots dimmed. Tap a bottle and it flies off the shelf into a close-up where the
// real 3D bottle turns once; drag it to turn it yourself (it keeps your speed, then settles facing
// front). Set the quantity or a pack size there; Back or Escape flies it home to the same slot.
// Subscription packs sit in the crisper drawer.
// Interaction model after "Product Shelf" by Aakash Mehra (aakashmehra.com), rebuilt for this
// no-build React + GSAP-free stack with the site's WebGL bottle (bottle3d.js).
const { useState: useStateF, useEffect: useEffectF, useRef: useRefF, useLayoutEffect: useLayoutEffectF } = React;

const FRIDGE_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const FRIDGE_BASE = [9, 17, 13];                    // 3D stage colour; matches .fr-stage
const FRIDGE_PACKS = [6, 12, 24];
const fridgeImg = id => `assets/bottle/renders/card-${id}.webp`;
const fridgePad = n => String(n).padStart(2, '0');
const fridgeMoney = n => '$' + n.toFixed(2);

// FLIP: play `el` from the box `from` to where it sits now (one transform, compositor only).
function fridgeFlip(el, from, reduced, ms = 560) {
  if (!el || !from || !el.animate) return;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  if (reduced) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); return; }
  const dx = from.left - to.left, dy = from.top - to.top, s = from.width / to.width;
  el.animate([
    { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})` },
    { transformOrigin: '0 0', transform: 'translate(0, 0) scale(1)' },
  ], { duration: ms, easing: FRIDGE_EASE });
}

function FridgeSlot({ f, qty, onOpen, imgRef }) {
  const stocked = qty > 0;
  const behind = Math.min(2, Math.max(0, qty - 1));
  return (
    <button type="button" className={'fr-bottle' + (stocked ? '' : ' is-empty')} data-ghost-target
      onClick={e => onOpen(f, e.currentTarget.querySelector('.fr-front'))}
      aria-label={`${f.name}: ${stocked ? `${qty} in your fridge` : 'empty slot'}. Inspect`}>
      {behind >= 2 && <img src={fridgeImg(f.id)} alt="" className="fr-back fr-back-2" decoding="async"/>}
      {behind >= 1 && <img src={fridgeImg(f.id)} alt="" className="fr-back fr-back-1" decoding="async"/>}
      <img ref={imgRef} src={fridgeImg(f.id)} alt="" className="fr-front" width="800" height="1067" decoding="async"/>
      {!stocked && <span className="fr-plus" aria-hidden="true"><Icon name="plus" size={14} stroke={2.2}/></span>}
    </button>
  );
}

function FridgeShelves({ flavors, qtyOf, subs, onOpen, slotImgs, onInc, onDec, onBrowse }) {
  const rows = [flavors.slice(0, 3), flavors.slice(3, 6)];
  const stockedAny = flavors.some(f => qtyOf(f.id) > 0) || subs.length > 0;
  return (
    <div className="fr-shelves">
      {rows.map((row, r) => (
        <section key={r} className="fr-row" aria-label={r === 0 ? 'Top shelf' : 'Middle shelf'}>
          <div className="fr-row-bottles">
            {row.map(f => (
              <FridgeSlot key={f.id} f={f} qty={qtyOf(f.id)} onOpen={onOpen}
                imgRef={el => { slotImgs.current[f.id] = el; }}/>
            ))}
          </div>
          <div className="fr-shelf" aria-hidden="true"/>
          <div className="fr-tags" aria-hidden="true">
            {row.map(f => {
              const q = qtyOf(f.id);
              return (
                <div key={f.id} className={'fr-tag' + (q ? '' : ' is-empty')}>
                  <b>{f.short}</b>
                  <span>{q ? `×${q}` : 'EMPTY'} · {fridgeMoney(f.price)}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {subs.length > 0 && (
        <section className="fr-crisper" aria-label="Subscription pack">
          <div className="fr-crisper-h"><span>CRISPER · SUB PACK</span><span>{subs[0].sub}</span></div>
          <ul>
            {subs.map(i => (
              <li key={i.id}>
                <img src={fridgeImg(i.id.replace(/--sub$/, ''))} alt="" width="30" height="40"/>
                <span className="fr-crisper-name">{i.short || i.name}</span>
                <span className="fr-step fr-step-sm">
                  <button type="button" onClick={() => onDec(i.id)} aria-label={`Remove one ${i.name} from the subscription`}><Icon name="minus" size={11}/></button>
                  <b>{i.qty}</b>
                  <button type="button" onClick={() => onInc(i.id)} aria-label={`Add one ${i.name} to the subscription`}><Icon name="plus" size={11}/></button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!stockedAny ? (
        <div className="fr-empty">
          <span className="mono-sm" style={{ color: 'var(--accent)' }}>FRIDGE EMPTY</span>
          <span>Tap any slot to stock it, or</span>
          <button type="button" className="btn btn-secondary" onClick={onBrowse}>Browse flavors <Icon name="arrowR" size={14}/></button>
        </div>
      ) : (
        <p className="fr-hint-line" aria-hidden="true">TAP A BOTTLE TO INSPECT · DRAG IT TO TURN</p>
      )}
    </div>
  );
}

function FridgeDetail({ f, index, qty, onSetQty, onBack, flipFrom, reduced, backRef, stageImgRef }) {
  const hostRef = useRefF(null);
  const instRef = useRefF(null);
  const [ready, setReady] = useStateF(false);
  const [can3D, setCan3D] = useStateF(true);

  // fly in from the shelf slot
  useLayoutEffectF(() => { fridgeFlip(stageImgRef.current, flipFrom, reduced); }, []);
  useEffectF(() => { if (backRef.current) backRef.current.focus({ preventScroll: true }); }, []);

  // the live bottle: swap in once the flight has landed, then one turn
  useEffectF(() => {
    let cancelled = false, t = 0;
    const mount = () => {
      if (cancelled || instRef.current || !hostRef.current) return;
      if (!window.SL3D || !window.SL3D.supported) { setCan3D(false); return; }
      try {
        instRef.current = window.SL3D.create(hostRef.current, {
          id: f.id, juice: f.color, accent: f.accent, flavor: f.name, word: '', bg: null,
          base: FRIDGE_BASE, rest: 0, drag: true, interactive: false, exclusive: true,
          frame: { x: 0, y: 0.04, fill: 0.92 },
        });
        Promise.resolve(instRef.current.whenReady).then(() => {
          t = setTimeout(() => {
            if (cancelled || !instRef.current) return;
            setReady(true);
            instRef.current.spin();
          }, reduced ? 0 : 420);
        });
      } catch (err) { setCan3D(false); }
    };
    if (window.SL3D) mount(); else window.addEventListener('sl3d-ready', mount, { once: true });
    return () => {
      cancelled = true; clearTimeout(t);
      window.removeEventListener('sl3d-ready', mount);
      if (instRef.current) { instRef.current.destroy(); instRef.current = null; }
    };
  }, []);

  const infoRef = useRefF(null);
  useEffectF(() => {
    const el = infoRef.current;
    if (el && el.animate) el.animate(reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }],
      { duration: reduced ? 200 : 520, delay: reduced ? 0 : 60, easing: FRIDGE_EASE, fill: 'backwards' });
  }, []);

  const set = n => onSetQty(f, Math.max(0, Math.min(99, n)));

  return (
    <div className="fr-detail">
      <button ref={backRef} type="button" className="fr-backbtn" onClick={onBack}>
        <span aria-hidden="true" style={{ display: 'flex', transform: 'rotate(180deg)' }}><Icon name="chevR" size={15} stroke={2.2}/></span> Fridge
      </button>

      <div className="fr-stage" style={{ '--g': f.color }}>
        <img ref={stageImgRef} className="fr-stage-img" src={fridgeImg(f.id)} alt="" width="800" height="1067"
          style={{ opacity: ready ? 0 : 1 }}/>
        <div ref={hostRef} className="fr-stage-3d" style={{ opacity: ready ? 1 : 0 }}/>
        <div className="fr-stage-shelf" aria-hidden="true"/>
      </div>
      <p className="fr-hint" aria-hidden="true">{can3D ? 'DRAG TO TURN' : ' '}</p>

      <div ref={infoRef} className="fr-info">
        <div className="mono-sm" style={{ color: 'var(--fg-3)' }}>
          FLAVOR {fridgePad(index + 1)}/{fridgePad(window.FLAVORS.length)} · {(f.sub || '').toUpperCase()}
          {f.isNew && <span className="fr-new">NEW</span>}
        </div>
        <h3 className="fr-name" style={{ color: f.color }}>{f.name}</h3>
        <p className="fr-tagline">{f.tagline}</p>

        <div className="fr-price">
          <b>{fridgeMoney(f.price)}</b><span>/ bottle</span>
          {qty > 0 && <em>{fridgeMoney(f.price * qty)} in your fridge</em>}
        </div>

        <div className="fr-buy">
          <div className="fr-step" role="group" aria-label={`${f.name} quantity`}>
            <button type="button" onClick={() => set(qty - 1)} disabled={qty === 0} aria-label={`Remove one ${f.name}`}><Icon name="minus" size={14}/></button>
            <b aria-live="polite" aria-label={`${qty} in your fridge`}>{qty}</b>
            <button type="button" onClick={() => set(qty + 1)} aria-label={`Add one ${f.name}`}><Icon name="plus" size={14}/></button>
          </div>
          <div className="fr-packs" role="group" aria-label="Pack size">
            {FRIDGE_PACKS.map(n => (
              <button key={n} type="button" aria-pressed={qty === n} className={qty === n ? 'is-on' : ''} onClick={() => set(n)}>{n}-pack</button>
            ))}
          </div>
        </div>
        {qty > 0 && <button type="button" className="fr-clear" onClick={() => set(0)}>Clear this slot</button>}

        <p className="fr-desc">{f.desc}</p>
        <ul className="fr-specs" aria-label="Per bottle">
          <li><b>75</b>mg caffeine</li><li><b>5</b>g sugar</li><li><b>12</b>fl oz</li>
        </ul>
      </div>
    </div>
  );
}

function FridgeDrawer({ open, items, onClose, onSetQty, onInc, onDec, total }) {
  const flavors = window.FLAVORS;
  const panelRef = useRefF(null);
  const closeRef = useRefF(null);
  const backRef = useRefF(null);
  const returnFocusRef = useRefF(null);
  const stageImgRef = useRefF(null);
  const slotImgs = useRefF({});
  const flipRef = useRefF(null);
  const homeRef = useRefF(null);                    // flavor flying back to its slot
  const [view, setView] = useStateF(null);          // null = shelves, else a flavor id
  const viewRef = useRefF(view);
  viewRef.current = view;
  const [checkoutNote, setCheckoutNote] = useStateF(false);
  const reduced = shellUseMedia(SHELL_REDUCED_MOTION);
  const onCloseRef = useRefF(onClose);
  onCloseRef.current = onClose;

  const lines = items.filter(i => !i.subscription);
  const subs = items.filter(i => i.subscription);
  const qtyOf = id => { const l = lines.find(i => i.id === id); return l ? l.qty : 0; };
  const bottles = items.reduce((s, i) => s + i.qty, 0);

  const openDetail = (f, imgEl) => {
    flipRef.current = imgEl ? imgEl.getBoundingClientRect() : null;
    setView(f.id);
  };
  const back = () => {
    const v = viewRef.current;
    if (!v) return;
    flipRef.current = stageImgRef.current ? stageImgRef.current.getBoundingClientRect() : null;
    homeRef.current = v;
    setView(null);
  };
  // back on the shelves: the bottle flies home and focus returns to its slot
  useLayoutEffectF(() => {
    if (view !== null || !homeRef.current) return;
    const el = slotImgs.current[homeRef.current];
    fridgeFlip(el, flipRef.current, reduced, 480);
    if (el && el.parentElement) el.parentElement.focus({ preventScroll: true });
    homeRef.current = null; flipRef.current = null;
  }, [view]);

  React.useLayoutEffect(() => { if (panelRef.current) panelRef.current.inert = !open; }, [open]);

  // focus in on open, back to the opener on close; reset to the shelves once the door has shut
  useEffectF(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      const focusClose = () => { if (closeRef.current) closeRef.current.focus({ preventScroll: true }); };
      focusClose();
      if (document.activeElement === closeRef.current) return;
      const raf = requestAnimationFrame(() => requestAnimationFrame(focusClose));
      return () => cancelAnimationFrame(raf);
    }
    setCheckoutNote(false);
    const t = setTimeout(() => setView(null), 300);
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && el !== document.body && document.contains(el) && typeof el.focus === 'function') el.focus({ preventScroll: true });
    return () => clearTimeout(t);
  }, [open]);

  // Escape: close-up → shelves → shut. Tab stays inside.
  useEffectF(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (viewRef.current) back(); else onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll(SHELL_FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffectF(() => {
    if (!open) return;
    const body = document.body;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    return () => { body.style.overflow = prev.overflow; body.style.paddingRight = prev.paddingRight; };
  }, [open]);

  const inMs = reduced ? 200 : 420;
  const outMs = reduced ? 200 : 280;
  const dur = open ? inMs : outMs;
  const ease = reduced ? SHELL_EASE_OUT : SHELL_EASE_DRAWER;
  const freeShip = total >= 40 || subs.length > 0;
  const progress = Math.min(1, total / 40);
  const detail = view ? flavors.find(f => f.id === view) : null;

  const browse = () => {
    const el = returnFocusRef.current;
    if (el && !(el.closest && el.closest('header'))) returnFocusRef.current = null;
    onClose();
    navTo('/');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 100,
      visibility: open ? 'visible' : 'hidden', transition: `visibility 0s linear ${open ? 0 : dur}ms`,
    }}>
      <div onClick={onClose} aria-hidden="true" style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: `opacity ${dur}ms ${ease}`,
      }}/>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="fr-title" className="fr-panel" style={{
        pointerEvents: open ? 'auto' : 'none',
        transform: reduced || open ? 'translateX(0)' : 'translateX(100%)',
        opacity: reduced && !open ? 0 : 1,
        transition: reduced ? `opacity ${dur}ms ${ease}` : `transform ${dur}ms ${ease}`,
      }}>
        <div className={'fr-led' + (open ? ' is-on' : '')} aria-hidden="true"/>
        <div className="fr-head">
          <div>
            <span className="mono-sm" style={{ color: 'var(--accent)' }}>MY FRIDGE</span>
            <h2 id="fr-title" className="h2" style={{ marginTop: 4, fontSize: 28 }}>Inventory</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="iconbtn" aria-label="Close fridge"><Icon name="x"/></button>
        </div>
        <div className="fr-status">
          <span aria-hidden="true" className="fr-status-dot"/>
          <span>STATUS: {bottles ? 'STOCKED' : 'EMPTY'} · {bottles} {bottles === 1 ? 'BOTTLE' : 'BOTTLES'} CHILLING</span>
        </div>

        <div className="fr-body thin-scroll" key={view || 'shelves'}>
          {detail ? (
            <FridgeDetail f={detail} index={flavors.indexOf(detail)} qty={qtyOf(detail.id)} onSetQty={onSetQty}
              onBack={back} flipFrom={flipRef.current} reduced={reduced} backRef={backRef} stageImgRef={stageImgRef}/>
          ) : (
            <FridgeShelves flavors={flavors} qtyOf={qtyOf} subs={subs} onOpen={openDetail} slotImgs={slotImgs}
              onInc={onInc} onDec={onDec} onBrowse={browse}/>
          )}
        </div>

        <div className="fr-foot">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ font: '500 14px var(--font-body)', color: 'var(--fg-2)' }}>Subtotal</span>
            <span style={{ font: '700 22px var(--font-mono)', color: 'var(--accent)' }}>{fridgeMoney(total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: freeShip ? 14 : 10, font: '400 12px var(--font-mono)', color: 'var(--fg-3)', letterSpacing: '0.04em' }}>
            <span>SHIPPING</span>
            <span>{freeShip ? 'FREE' : `${fridgeMoney(40 - total)} TO FREE`}</span>
          </div>
          {!freeShip && (
            <div aria-hidden="true" style={{ background: 'var(--ink-900)', borderRadius: 999, height: 4, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
                transform: `scaleX(${progress})`, transformOrigin: 'left', transition: `transform 220ms ${SHELL_EASE_OUT}` }}/>
            </div>
          )}
          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}
            disabled={items.length === 0} onClick={() => setCheckoutNote(true)}>
            Checkout · {fridgeMoney(total)}
          </button>
          <div role="status" aria-live="polite" style={{ font: '500 12px var(--font-mono)', color: 'var(--fg-2)', textAlign: 'center', letterSpacing: '0.04em', marginTop: checkoutNote ? 10 : 0 }}>
            {checkoutNote ? 'Demo store — checkout is disabled' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FridgeDrawer });
