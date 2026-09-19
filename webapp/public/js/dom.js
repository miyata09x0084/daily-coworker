/**
 * 最小の DOM ヘルパ。
 * 文字列 HTML を組み立てず、必ず textContent 経由で入れる。
 * 記録本文には固有名詞や事情がそのまま入るので、
 * 解釈させずにテキストとして扱うのが一番安全で、実装も単純になる。
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = value; // 呼び出し側が生成した固定文字列だけに使う
    else if (key === 'dataset') Object.assign(node.dataset, value);
    // style は必ず CSSOM 経由で当てる。style 属性として書くと CSP の style-src に弾かれる
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list' && typeof value !== 'object') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function frag(...children) {
  return append(document.createDocumentFragment(), children);
}

export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function field(label, control, hint) {
  return el(
    'div',
    { class: 'field' },
    el('label', { class: 'field__label', for: control.id || undefined }, label, hint ? el('span', { class: 'field__hint', text: hint }) : null),
    control,
  );
}

/** 押すたびに値が変わるチップ群。ラジオより指で押しやすく、選択状態も読み上げに乗る */
export function chipGroup({ options, value, multiple = false, onChange, small = false }) {
  const selected = multiple ? new Set(value ?? []) : value;
  const wrap = el('div', { class: 'chips', role: multiple ? 'group' : 'radiogroup' });
  for (const opt of options) {
    const key = opt.key ?? opt.value;
    const active = multiple ? selected.has(key) : selected === key;
    const btn = el('button', {
      type: 'button',
      class: `chip${small ? ' chip--sm' : ''}`,
      'aria-pressed': String(active),
      text: opt.label,
      title: opt.hint ?? '',
      onClick: () => {
        if (multiple) {
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          onChange([...selected]);
          for (const child of wrap.children) {
            child.setAttribute('aria-pressed', String(selected.has(child.dataset.key)));
          }
        } else {
          onChange(key);
          for (const child of wrap.children) {
            child.setAttribute('aria-pressed', String(child.dataset.key === String(key)));
          }
        }
      },
    });
    btn.dataset.key = String(key);
    wrap.append(btn);
  }
  return wrap;
}
